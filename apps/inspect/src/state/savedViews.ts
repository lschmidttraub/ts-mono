import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isRecord } from "@tsmono/util";

import {
  parseSavedViews,
  SavedSampleView,
  upsertSavedView,
} from "../app/samples/list/savedViews";

// localStorage rather than the app store: the app store's persistence is
// host-transient (it only survives webview recreation), while saved views
// should last across sessions, like the user settings.
interface SavedViewsState {
  views: SavedSampleView[];
  saveView: (view: SavedSampleView) => void;
  deleteView: (name: string) => void;
}

export const useSavedViews = create<SavedViewsState>()(
  persist(
    (set) => ({
      views: [],
      saveView: (view: SavedSampleView) => {
        set((state) => ({ views: upsertSavedView(state.views, view) }));
      },
      deleteView: (name: string) => {
        set((state) => ({ views: state.views.filter((v) => v.name !== name) }));
      },
    }),
    {
      name: "inspect-saved-sample-views",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        views: parseSavedViews(isRecord(persisted) ? persisted.views : []),
      }),
    }
  )
);
