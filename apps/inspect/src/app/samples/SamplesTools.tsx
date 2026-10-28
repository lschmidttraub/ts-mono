import { FC, Fragment, useState } from "react";

import { useScores, useSelectedScores } from "../../state/hooks";
import { useStore } from "../../state/store";
import { NavbarButton } from "../navbar/NavbarButton";

import { SamplesViewOptionsPopover } from "./list/SamplesViewOptionsPopover";
import { useSavedSampleViews } from "./list/useSavedSampleViews";
import { SampleFilter } from "./sample-tools/sample-filter/SampleFilter";
import { SelectScorer } from "./sample-tools/SelectScorer";

// Multi-sample tools: DSL filter + a single "View" dropdown grouping saved
// views and the presentation toggles (multiline, compact scores, colour
// scales). Scorer selection is handled by the column-chooser popover in
// `SamplesTab`.
export const SampleTools: FC = () => {
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [viewButtonEl, setViewButtonEl] = useState<HTMLButtonElement | null>(
    null
  );
  const { activeView } = useSavedSampleViews();
  return (
    <Fragment>
      <SampleFilter />
      <NavbarButton
        ref={setViewButtonEl}
        label={activeView ? `View: ${activeView.name}` : "View"}
        icon="options"
        dropdown
        subtle
        onClick={(e) => {
          e.stopPropagation();
          setShowViewOptions((prev) => !prev);
        }}
      />
      <SamplesViewOptionsPopover
        showing={showViewOptions}
        setShowing={setShowViewOptions}
        positionEl={viewButtonEl}
      />
    </Fragment>
  );
};

export const ScoreFilterTools: FC = () => {
  const scores = useScores();
  const selectedScores = useSelectedScores();
  const setSelectedScores = useStore(
    (state) => state.logActions.setSelectedScores
  );
  if (scores.length <= 1) {
    return undefined;
  }
  return (
    <SelectScorer
      scores={scores}
      selectedScores={selectedScores}
      setSelectedScores={setSelectedScores}
    />
  );
};
