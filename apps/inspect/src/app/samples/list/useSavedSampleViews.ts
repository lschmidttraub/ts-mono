import { useAsyncDataFromQuery } from "@tsmono/react/hooks";
import { dirname } from "@tsmono/util";

import { useAppConfig } from "../../../app_config";
import { useScores, useSelectedScores } from "../../../state/hooks";
import {
  openSavedViewsFolder,
  SavedViewsServer,
  useSavedViews,
} from "../../../state/savedViews";
import { useStore } from "../../../state/store";
import { useCurrentLogFile } from "../../routing/currentSelection";

import {
  applySavedView,
  captureSavedView,
  isSavedViewActive,
  SavedSampleView,
} from "./savedViews";
import { useSamplesView } from "./useSamplesView";

const kNoViews: SavedSampleView[] = [];

export interface UseSavedSampleViewsResult {
  /** The views of the folder holding the current log. */
  views: SavedSampleView[];
  /** The folder the views belong to. */
  folder: string;
  /** The view server's file holding the views; undefined when they are
   *  kept in this browser only. */
  serverPath: string | undefined;
  /** The saved view the list currently matches, if any. */
  activeView: SavedSampleView | undefined;
  /** Save the current filter, columns, sort and layout as `name`,
   *  replacing a view of that name. */
  saveCurrent: (name: string) => void;
  /** Save the current view with `filter` in place of the current filter,
   *  and apply it. */
  saveWithFilter: (name: string, filter: string) => void;
  apply: (view: SavedSampleView) => void;
  remove: (name: string) => void;
  /** Rename a view; ignored if the new name is blank or taken. */
  rename: (from: string, to: string) => void;
}

export function useSavedSampleViews(): UseSavedSampleViewsResult {
  const { view, patchView } = useSamplesView();
  const filter = useStore((state) => state.log.filter);
  const setFilter = useStore((state) => state.logActions.setFilter);
  const setSelectedScores = useStore(
    (state) => state.logActions.setSelectedScores
  );
  const selectedScores = useSelectedScores();
  const availableScores = useScores();
  const logFile = useCurrentLogFile();
  const folder = logFile ? dirname(logFile) : "";
  const views = useSavedViews(
    (state) => state.viewsByFolder[folder] ?? kNoViews
  );
  const saveView = useSavedViews((state) => state.saveView);
  const deleteView = useSavedViews((state) => state.deleteView);
  const renameView = useSavedViews((state) => state.renameView);
  const serverPath = useSavedViews((state) => state.serverPath);

  // Load each folder's views once per page (from the view server when it
  // keeps them); the store holds the result.
  const { api } = useAppConfig();
  const getViews = api.get_saved_views;
  const putViews = api.put_saved_views;
  const server: SavedViewsServer | undefined =
    getViews && putViews ? { get: getViews, put: putViews } : undefined;
  useAsyncDataFromQuery({
    queryKey: ["saved-views-folder", folder],
    queryFn: () => openSavedViewsFolder(folder, server),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  const snapshot = { filter, view, selectedScores };
  return {
    views,
    folder,
    serverPath,
    activeView: views.find((v) => isSavedViewActive(v, snapshot)),
    saveCurrent: (name) => saveView(folder, captureSavedView(name, snapshot)),
    saveWithFilter: (name, nextFilter) => {
      saveView(
        folder,
        captureSavedView(name, { ...snapshot, filter: nextFilter })
      );
      setFilter(nextFilter);
    },
    apply: (saved) => {
      const applied = applySavedView(saved, { view, availableScores });
      patchView(applied.viewPatch);
      setFilter(applied.filter);
      if (applied.selectedScores) setSelectedScores(applied.selectedScores);
    },
    remove: (name) => deleteView(folder, name),
    rename: (from, to) => renameView(folder, from, to),
  };
}
