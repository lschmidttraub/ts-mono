import clsx from "clsx";
import { FC, FormEvent, useState } from "react";

import { PopOver } from "@tsmono/react/components";
import { Icon } from "@tsmono/react/icons";

import styles from "./SamplesViewOptionsPopover.module.css";
import {
  useSamplesView,
  useSamplesViewScoreColorScales,
} from "./useSamplesView";
import { useSavedSampleViews } from "./useSavedSampleViews";

interface SamplesViewOptionsPopoverProps {
  showing: boolean;
  setShowing: (showing: boolean) => void;
  positionEl: HTMLElement | null;
}

export const SamplesViewOptionsPopover: FC<SamplesViewOptionsPopoverProps> = ({
  showing,
  setShowing,
  positionEl,
}) => {
  const { view, setMultiline, setCompactScores, setColorScalesEnabled } =
    useSamplesView();
  const scoreColorScales = useSamplesViewScoreColorScales();
  const showColorScales = Object.keys(scoreColorScales).length > 0;
  const savedViews = useSavedSampleViews();
  const [newViewName, setNewViewName] = useState("");
  const trimmedName = newViewName.trim();
  const replacing = savedViews.views.some((v) => v.name === trimmedName);

  const handleSave = (e: FormEvent): void => {
    e.preventDefault();
    if (!trimmedName) return;
    savedViews.saveCurrent(trimmedName);
    setNewViewName("");
  };

  return (
    <PopOver
      id="samples-view-options-popover"
      isOpen={showing}
      setIsOpen={setShowing}
      positionEl={positionEl}
      placement="bottom-end"
      showArrow={false}
      hoverDelay={-1}
      closeOnMouseLeave={false}
      offset={[0, 1]}
    >
      <div className={clsx(styles.container, "text-size-small")}>
        <div className={styles.heading}>Saved views</div>
        {savedViews.views.length === 0 ? (
          <div className={styles.empty}>
            Save the current filter, columns, sort and layout to reuse them on
            any log.
          </div>
        ) : (
          <ul className={styles.viewList} aria-label="Saved views">
            {savedViews.views.map((saved) => {
              const active = saved === savedViews.activeView;
              return (
                <li
                  key={saved.name}
                  className={clsx(styles.viewRow, active && styles.activeView)}
                >
                  <button
                    type="button"
                    className={styles.viewApply}
                    aria-pressed={active}
                    title={
                      saved.filter ? `Filter: ${saved.filter}` : "No filter"
                    }
                    onClick={() => savedViews.apply(saved)}
                  >
                    <Icon
                      name="confirm"
                      className={clsx(styles.check, !active && styles.hidden)}
                    />
                    <span className={styles.viewName}>{saved.name}</span>
                    {saved.filter && (
                      <span className={styles.viewFilter}>{saved.filter}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={`Update "${saved.name}" to the current view`}
                    aria-label={`Update ${saved.name}`}
                    disabled={active}
                    onClick={() => savedViews.saveCurrent(saved.name)}
                  >
                    <Icon name="refresh" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={`Delete "${saved.name}"`}
                    aria-label={`Delete ${saved.name}`}
                    onClick={() => savedViews.remove(saved.name)}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form className={styles.saveForm} onSubmit={handleSave}>
          <input
            type="text"
            className={clsx("form-control", styles.nameInput)}
            placeholder="New view name"
            aria-label="New view name"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
          />
          <button
            type="submit"
            className={clsx("btn", "btn-primary", styles.saveButton)}
            disabled={!trimmedName}
            title={
              replacing
                ? `Replace "${trimmedName}" with the current view`
                : "Save the current view"
            }
          >
            {replacing ? "Replace" : "Save"}
          </button>
        </form>

        <div className={styles.divider} />
        <div className={styles.heading}>Display</div>
        <label className={styles.row}>
          <input
            type="checkbox"
            checked={view.multiline}
            onChange={() => setMultiline(!view.multiline)}
            className={styles.checkbox}
          />
          <span>Multiline</span>
        </label>
        <label className={styles.row}>
          <input
            type="checkbox"
            checked={view.compactScores}
            onChange={() => setCompactScores(!view.compactScores)}
            className={styles.checkbox}
          />
          <span>Compact scores</span>
        </label>
        {showColorScales && (
          <label className={styles.row}>
            <input
              type="checkbox"
              checked={view.colorScalesEnabled}
              onChange={() => setColorScalesEnabled(!view.colorScalesEnabled)}
              className={styles.checkbox}
            />
            <span>Score colors</span>
          </label>
        )}
      </div>
    </PopOver>
  );
};
