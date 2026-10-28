import { useScores, useSelectedScores } from "../../../state/hooks";
import { useSavedViews } from "../../../state/savedViews";
import { useStore } from "../../../state/store";

import {
  applySavedView,
  captureSavedView,
  isSavedViewActive,
  SavedSampleView,
} from "./savedViews";
import { useSamplesView } from "./useSamplesView";

export interface UseSavedSampleViewsResult {
  views: SavedSampleView[];
  /** The saved view the list currently matches, if any. */
  activeView: SavedSampleView | undefined;
  /** Save the current filter, columns, sort and layout as `name`,
   *  replacing a view of that name. */
  saveCurrent: (name: string) => void;
  apply: (view: SavedSampleView) => void;
  remove: (name: string) => void;
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
  const views = useSavedViews((state) => state.views);
  const saveView = useSavedViews((state) => state.saveView);
  const deleteView = useSavedViews((state) => state.deleteView);

  const snapshot = { filter, view, selectedScores };
  return {
    views,
    activeView: views.find((v) => isSavedViewActive(v, snapshot)),
    saveCurrent: (name) => saveView(captureSavedView(name, snapshot)),
    apply: (saved) => {
      const applied = applySavedView(saved, { view, availableScores });
      patchView(applied.viewPatch);
      setFilter(applied.filter);
      if (applied.selectedScores) setSelectedScores(applied.selectedScores);
    },
    remove: deleteView,
  };
}
