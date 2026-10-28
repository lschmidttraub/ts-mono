import clsx from "clsx";
import { FC, FormEvent, useState } from "react";
import { Link } from "react-router";

import { ToolButton } from "@tsmono/react/components";

import { getApi, useLogDir } from "../../../app_config";
import { imperativeLogData } from "../../../log_data";
import { clearSampleSelection } from "../../../state/actions";
import { useStore } from "../../../state/store";
import { logsUrl, useRoutePrefix } from "../../routing/url";

import {
  defaultSubsetFileName,
  ownedSampleSelection,
  selectedSampleRefs,
} from "./sampleSelection";
import styles from "./SampleSelectionBar.module.css";

interface SampleSelectionBarProps {
  logFile: string;
  /** Every sample in the log, in log order (not just the filtered rows):
   *  a checked sample stays selected when a filter hides it. */
  samples: readonly { id: string | number; epoch: number }[];
}

interface SavedSubset {
  logFile: string;
  metricsRecomputed: boolean;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The name field appears in response to "Save to log directory…", so it is
// where the user expects to type next.
const focusOnMount = (el: HTMLInputElement | null) => {
  el?.focus();
};

/** Shown above the samples grid while samples are checked: export them as
 *  a new .eval log, downloaded or saved into the log directory. */
export const SampleSelectionBar: FC<SampleSelectionBarProps> = ({
  logFile,
  samples,
}) => {
  const api = getApi();
  const logDir = useLogDir();
  const routePrefix = useRoutePrefix();
  const selection = useStore((state) => state.log.sampleSelection);
  const refs = selectedSampleRefs(
    samples,
    ownedSampleSelection(selection, logFile).keys
  );

  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<SavedSubset | undefined>(undefined);

  if (refs.length === 0) return null;

  const defaultName = defaultSubsetFileName(logFile, refs.length);

  const handleDownload = (): void => {
    if (!api.download_log_subset) return;
    setBusy(true);
    setError(undefined);
    api
      .download_log_subset(logFile, refs, defaultName)
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  const handleSave = (e: FormEvent): void => {
    e.preventDefault();
    if (!api.save_log_subset || fileName === undefined) return;
    setBusy(true);
    setError(undefined);
    api
      .save_log_subset(logFile, refs, fileName)
      .then((result) => {
        setSaved({
          logFile: result.log_file,
          metricsRecomputed: result.metrics_recomputed,
        });
        setFileName(undefined);
        imperativeLogData.invalidateLogListing();
      })
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  const savedName = saved?.logFile.split(/[\\/]/).pop();

  return (
    <div
      className={clsx(styles.bar, "text-size-small")}
      role="region"
      aria-label="Selected samples"
    >
      <span className={styles.count}>
        {refs.length} {refs.length === 1 ? "sample" : "samples"} selected
      </span>
      {fileName === undefined ? (
        <>
          {api.download_log_subset && (
            <ToolButton
              className={styles.action}
              label="Download .eval"
              icon={busy ? "loading" : "download"}
              disabled={busy}
              title="Download the selected samples as a new .eval log"
              onClick={handleDownload}
            />
          )}
          {api.save_log_subset && (
            <ToolButton
              className={styles.action}
              label="Save to log directory…"
              icon="add"
              disabled={busy}
              title="Write the selected samples to a new .eval log next to this one"
              onClick={() => {
                setError(undefined);
                setFileName(defaultName);
              }}
            />
          )}
        </>
      ) : (
        <form className={styles.saveForm} onSubmit={handleSave}>
          <input
            type="text"
            className={clsx("form-control", styles.fileName)}
            aria-label="New log file name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            ref={focusOnMount}
          />
          <ToolButton
            className={styles.action}
            type="submit"
            label="Save"
            icon={busy ? "loading" : "confirm"}
            disabled={busy || fileName.trim() === ""}
          />
          <ToolButton
            className={styles.action}
            label="Cancel"
            disabled={busy}
            onClick={() => setFileName(undefined)}
          />
        </form>
      )}
      <ToolButton
        className={styles.action}
        label="Clear selection"
        icon="selectionClear"
        subtle
        disabled={busy}
        onClick={() => {
          setSaved(undefined);
          clearSampleSelection();
        }}
      />
      {error && <span className={styles.error}>{error}</span>}
      {saved && !error && (
        <span className={styles.saved}>
          Saved{" "}
          <Link to={logsUrl(saved.logFile, logDir, undefined, routePrefix)}>
            {savedName}
          </Link>
          {!saved.metricsRecomputed &&
            " (metrics could not be recomputed here, so it has no aggregate results)"}
        </span>
      )}
    </div>
  );
};
