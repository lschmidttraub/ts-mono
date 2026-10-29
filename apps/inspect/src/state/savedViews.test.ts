// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { SavedSampleView } from "../app/samples/list/savedViews";

const view = (name: string, filter = ""): SavedSampleView => ({
  name,
  filter,
  columns: [],
  sort: [],
  scores: [],
  multiline: true,
  compactScores: false,
});

const IB = "file:///logs/impossiblebench";
const SORH = "file:///logs/sorh";
// The server stores folders under their plain path.
const key = (folder: string) => folder.replace("file://", "");

/** An in-memory `/saved-views?folder=`. */
const fakeServer = (
  initial: Record<string, SavedSampleView[]> = {},
  options: { legacyFolder?: string; reachable?: boolean } = {}
) => {
  const folders: Record<string, SavedSampleView[]> = Object.fromEntries(
    Object.entries(initial).map(([f, v]) => [key(f), v])
  );
  const state = { folders, puts: 0 };
  return {
    state,
    names: (folder: string) =>
      (state.folders[key(folder)] ?? []).map((v) => v.name),
    server: {
      get: (folder: string) =>
        options.reachable === false
          ? Promise.reject(new Error("404"))
          : Promise.resolve({
              views: state.folders[key(folder)] ?? [],
              folder: key(folder),
              path: "/data/saved_views.json",
              legacy_views_folder: options.legacyFolder
                ? key(options.legacyFolder)
                : null,
            }),
      put: (folder: string, views: readonly SavedSampleView[]) => {
        state.folders[key(folder)] = [...views];
        state.puts += 1;
        return Promise.resolve();
      },
    },
  };
};

// Each call is a fresh page load: module state (the connected server)
// resets; localStorage (the persisted views) survives unless cleared.
const loadPage = async () => {
  vi.resetModules();
  return import("./savedViews");
};

const localNames = (
  page: Awaited<ReturnType<typeof loadPage>>,
  folder: string
) =>
  (page.useSavedViews.getState().viewsByFolder[folder] ?? []).map(
    (v) => v.name
  );

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

test("views come back from the server after restarts and port changes", async () => {
  const { server, state } = fakeServer({ [IB]: [view("kept")] });
  let page = await loadPage();
  await page.openSavedViewsFolder(IB, server);

  // a new origin has empty localStorage
  localStorage.clear();
  page = await loadPage();
  await page.openSavedViewsFolder(IB, server);
  expect(localNames(page, IB)).toEqual(["kept"]);
  expect(page.useSavedViews.getState().serverPath).toBe(
    "/data/saved_views.json"
  );
  expect(state.puts).toBe(0);
});

test("each folder has its own views", async () => {
  const fake = fakeServer();
  const page = await loadPage();
  await page.openSavedViewsFolder(IB, fake.server);
  await page.openSavedViewsFolder(SORH, fake.server);
  page.useSavedViews.getState().saveView(IB, view("ib only"));
  page.useSavedViews.getState().saveView(SORH, view("sorh only"));
  await page.savedViewsServerIdle();

  expect(fake.names(IB)).toEqual(["ib only"]);
  expect(fake.names(SORH)).toEqual(["sorh only"]);
  expect(localNames(page, IB)).toEqual(["ib only"]);
});

test("once a folder is synced, the server's list wins, so deletions elsewhere stick", async () => {
  const fake = fakeServer({ [IB]: [view("a"), view("b")] });
  let page = await loadPage();
  await page.openSavedViewsFolder(IB, fake.server);

  fake.state.folders[key(IB)] = [view("a")]; // deleted in another browser
  page = await loadPage();
  await page.openSavedViewsFolder(IB, fake.server);
  expect(localNames(page, IB)).toEqual(["a"]);
});

test("changes apply to the server's latest list, keeping other tabs' views", async () => {
  const fake = fakeServer({ [IB]: [view("a")] });
  const page = await loadPage();
  await page.openSavedViewsFolder(IB, fake.server);

  fake.state.folders[key(IB)] = [view("a"), view("from another tab")];
  page.useSavedViews.getState().saveView(IB, view("new"));
  page.useSavedViews.getState().renameView(IB, "a", "renamed");
  await page.savedViewsServerIdle();

  const names = ["renamed", "from another tab", "new"];
  expect(fake.names(IB)).toEqual(names);
  expect(localNames(page, IB)).toEqual(names);
});

test("views saved before folders go to the server's legacy views folder", async () => {
  // what an earlier viewer left in localStorage: one global list
  localStorage.setItem(
    "inspect-saved-sample-views",
    JSON.stringify({
      state: { views: [view("old 1"), view("old 2")], syncedWithServer: false },
      version: 1,
    })
  );
  const fake = fakeServer({ [IB]: [view("ib")] }, { legacyFolder: IB });
  const page = await loadPage();

  // opening a different folder first still files them into impossiblebench
  await page.openSavedViewsFolder(SORH, fake.server);
  expect(fake.names(IB)).toEqual(["ib", "old 1", "old 2"]);
  expect(fake.names(SORH)).toEqual([]);
  expect(page.useSavedViews.getState().legacyViews).toEqual([]);

  await page.openSavedViewsFolder(IB, fake.server);
  expect(localNames(page, IB)).toEqual(["ib", "old 1", "old 2"]);
});

test("without a legacy folder setting, legacy views go to the first folder opened", async () => {
  localStorage.setItem(
    "inspect-saved-sample-views",
    JSON.stringify({ state: { views: [view("old")] }, version: 1 })
  );
  const fake = fakeServer();
  const page = await loadPage();
  await page.openSavedViewsFolder(SORH, fake.server);
  expect(fake.names(SORH)).toEqual(["old"]);
  expect(localNames(page, SORH)).toEqual(["old"]);
});

test("without a reachable server, views stay in the browser, per folder", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fake = fakeServer({}, { reachable: false });
  const page = await loadPage();
  await page.openSavedViewsFolder(IB, fake.server);

  page.useSavedViews.getState().saveView(IB, view("local"));
  await page.savedViewsServerIdle();
  expect(fake.state.puts).toBe(0);
  expect(localNames(page, IB)).toEqual(["local"]);
  expect(localNames(page, SORH)).toEqual([]);
  expect(page.useSavedViews.getState().serverPath).toBeUndefined();
});
