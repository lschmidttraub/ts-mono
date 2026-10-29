import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isRecord } from "@tsmono/util";

import {
  mergeSavedViews,
  parseSavedViews,
  renameSavedView,
  SavedSampleView,
  upsertSavedView,
} from "../app/samples/list/savedViews";

/** The view server's per-folder saved views (`/saved-views?folder=`). */
export interface SavedViewsServer {
  get: (folder: string) => Promise<unknown>;
  put: (folder: string, views: readonly SavedSampleView[]) => Promise<void>;
}

type ViewsOp = (views: readonly SavedSampleView[]) => SavedSampleView[];

// Views belong to the folder holding the log being viewed. They are kept in
// localStorage (the app store's persistence is host-transient) and, when the
// view server has a saved-views file, there too: localStorage is per origin,
// so a new port or host would start empty.
interface SavedViewsState {
  viewsByFolder: Record<string, SavedSampleView[]>;
  /** Folders whose local views have been merged into the server's once.
   *  After that the server's list wins, so a view deleted elsewhere stays
   *  gone. */
  syncedFolders: string[];
  /** Views saved before views were per folder, waiting to be filed: into
   *  the server's `legacy_views_folder`, else the first folder opened. */
  legacyViews: SavedSampleView[];
  /** The server file holding the views, once connected to one. */
  serverPath?: string;
  saveView: (folder: string, view: SavedSampleView) => void;
  deleteView: (folder: string, name: string) => void;
  renameView: (folder: string, from: string, to: string) => void;
}

let server: SavedViewsServer | undefined;
// Server reads and writes run one at a time, in order.
let serverQueue: Promise<void> = Promise.resolve();

const enqueue = (task: () => Promise<void>, onError: (e: unknown) => void) => {
  serverQueue = serverQueue.then(task).catch(onError);
};

const viewsIn = (response: unknown): SavedSampleView[] =>
  parseSavedViews(isRecord(response) ? response.views : undefined);

const stringIn = (response: unknown, key: string): string | undefined => {
  const value = isRecord(response) ? response[key] : undefined;
  return typeof value === "string" ? value : undefined;
};

const setFolderViews = (folder: string, views: SavedSampleView[]) => {
  useSavedViews.setState((state) => ({
    viewsByFolder: { ...state.viewsByFolder, [folder]: views },
  }));
};

// Apply `op` to the server's current list rather than pushing this tab's
// copy, so changes made in another tab since we last read aren't dropped.
const writeToServer = (folder: string, op: ViewsOp): void => {
  enqueue(
    async () => {
      const target = server;
      if (!target) return;
      const next = op(viewsIn(await target.get(folder)));
      await target.put(folder, next);
      setFolderViews(folder, next);
    },
    (error) => console.error("Failed to save views to the view server", error)
  );
};

export const useSavedViews = create<SavedViewsState>()(
  persist(
    (set) => {
      const apply = (folder: string, op: ViewsOp) => {
        set((state) => ({
          viewsByFolder: {
            ...state.viewsByFolder,
            [folder]: op(state.viewsByFolder[folder] ?? []),
          },
        }));
        writeToServer(folder, op);
      };
      return {
        viewsByFolder: {},
        syncedFolders: [],
        legacyViews: [],
        saveView: (folder, view) => {
          apply(folder, (views) => upsertSavedView(views, view));
        },
        deleteView: (folder, name) => {
          apply(folder, (views) => views.filter((v) => v.name !== name));
        },
        renameView: (folder, from, to) => {
          apply(folder, (views) => renameSavedView(views, from, to));
        },
      };
    },
    {
      name: "inspect-saved-sample-views",
      storage: createJSONStorage(() => localStorage),
      // 1: one global list ({ views, syncedWithServer }).
      version: 2,
      migrate: (persisted, version) =>
        version < 2
          ? {
              viewsByFolder: {},
              syncedFolders: [],
              legacyViews: isRecord(persisted) ? persisted.views : [],
            }
          : persisted,
      partialize: (state) => ({
        viewsByFolder: state.viewsByFolder,
        syncedFolders: state.syncedFolders,
        legacyViews: state.legacyViews,
      }),
      merge: (persisted, current) => {
        if (!isRecord(persisted)) return current;
        const byFolder = isRecord(persisted.viewsByFolder)
          ? persisted.viewsByFolder
          : {};
        return {
          ...current,
          viewsByFolder: Object.fromEntries(
            Object.entries(byFolder).map(([folder, views]) => [
              folder,
              parseSavedViews(views),
            ])
          ),
          syncedFolders: Array.isArray(persisted.syncedFolders)
            ? persisted.syncedFolders.filter(
                (f): f is string => typeof f === "string"
              )
            : [],
          legacyViews: parseSavedViews(persisted.legacyViews),
        };
      },
    }
  )
);

/** File legacy views into `folder` locally (hosts without a server). */
const fileLegacyViewsLocally = (folder: string) => {
  const { legacyViews, viewsByFolder } = useSavedViews.getState();
  if (legacyViews.length === 0) return;
  useSavedViews.setState({
    legacyViews: [],
    viewsByFolder: {
      ...viewsByFolder,
      [folder]: mergeSavedViews(viewsByFolder[folder] ?? [], legacyViews),
    },
  });
};

/**
 * Load `folder`'s saved views, from the view server when there is one. The
 * first time this browser opens a folder, its local views for it are merged
 * into the server's; after that the server's list replaces the local one.
 * Legacy (pre-folder) views are filed on the way. If the server can't be
 * reached, views stay in this browser. Resolves when done; never rejects.
 */
export const openSavedViewsFolder = (
  folder: string,
  next: SavedViewsServer | undefined
): Promise<true> => {
  if (!next) {
    fileLegacyViewsLocally(folder);
    return Promise.resolve(true);
  }
  server ??= next;
  enqueue(
    async () => {
      const target = server;
      if (!target) {
        fileLegacyViewsLocally(folder);
        return;
      }
      const response = await target.get(folder);
      let remote = viewsIn(response);

      const { legacyViews } = useSavedViews.getState();
      if (legacyViews.length > 0) {
        const here = stringIn(response, "folder");
        const destination = stringIn(response, "legacy_views_folder") ?? here;
        if (destination === undefined || destination === here) {
          remote = mergeSavedViews(remote, legacyViews);
          await target.put(folder, remote);
        } else {
          const there = viewsIn(await target.get(destination));
          await target.put(destination, mergeSavedViews(there, legacyViews));
        }
        useSavedViews.setState({ legacyViews: [] });
      }

      const { viewsByFolder, syncedFolders } = useSavedViews.getState();
      const synced = syncedFolders.includes(folder);
      const views = synced
        ? remote
        : mergeSavedViews(remote, viewsByFolder[folder] ?? []);
      if (views.length !== remote.length) await target.put(folder, views);
      useSavedViews.setState({
        viewsByFolder: { ...viewsByFolder, [folder]: views },
        syncedFolders: synced ? syncedFolders : [...syncedFolders, folder],
        serverPath: stringIn(response, "path"),
      });
    },
    (error) => {
      server = undefined;
      fileLegacyViewsLocally(folder);
      console.warn(
        "The view server's saved views are unavailable; keeping views in this browser only.",
        error
      );
    }
  );
  return serverQueue.then(() => true);
};

/** Resolves once pending server reads and writes have finished. */
export const savedViewsServerIdle = (): Promise<void> => serverQueue;
