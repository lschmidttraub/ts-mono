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
import { selectionFilter } from "./savedViews";
import { useSavedSampleViews } from "./useSavedSampleViews";

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

/** The inline name field: a log file to write, or a view to save. */
interface SelectionForm {
  kind: "log" | "view";
  name: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The name field appears in response to a "Save…" button, so it is where the
// user expects to type next.
const focusOnMount = (el: HTMLInputElement | null) => {
  el?.focus();
};

/** Shown above the samples grid while samples are checked: export them as
 *  a new .eval log (downloaded or saved into the log directory), or save a
 *  view that shows only them. */
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

  const savedViews = useSavedSampleViews();
  const [form, setForm] = useState<SelectionForm | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<SavedSubset | undefined>(undefined);
  const [savedView, setSavedView] = useState<string | undefined>(undefined);

  if (refs.length === 0) return null;

  const defaultName = defaultSubsetFileName(logFile, refs.length);

  const openForm = (kind: SelectionForm["kind"]) => {
    setError(undefined);
    setForm({
      kind,
      name:
        kind === "log"
          ? defaultName
          : `${refs.length} selected ${refs.length === 1 ? "sample" : "samples"}`,
    });
  };

  const handleDownload = (): void => {
    if (!api.download_log_subset) return;
    setBusy(true);
    setError(undefined);
    api
      .download_log_subset(logFile, refs, defaultName)
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  const saveToLogDir = (fileName: string): void => {
    if (!api.save_log_subset) return;
    setBusy(true);
    setError(undefined);
    api
      .save_log_subset(logFile, refs, fileName)
      .then((result) => {
        setSaved({
          logFile: result.log_file,
          metricsRecomputed: result.metrics_recomputed,
        });
        setForm(undefined);
        imperativeLogData.invalidateLogListing();
      })
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  const saveAsView = (name: string): void => {
    const epochs = new Set(samples.map((s) => s.epoch));
    savedViews.saveWithFilter(name, selectionFilter(refs, epochs));
    setSavedView(name);
    setForm(undefined);
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    if (form.kind === "log") saveToLogDir(name);
    else saveAsView(name);
  };

  const replacingView =
    form?.kind === "view" &&
    savedViews.views.some((v) => v.name === form.name.trim());
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
      {form === undefined ? (
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
              onClick={() => openForm("log")}
            />
          )}
          <ToolButton
            className={styles.action}
            label="Save as view…"
            icon="filter"
            disabled={busy}
            title="Save a view that shows only the selected samples (as an id filter, so it also applies to other logs with these sample ids)"
            onClick={() => openForm("view")}
          />
        </>
      ) : (
        <form className={styles.saveForm} onSubmit={handleSubmit}>
          <input
            type="text"
            className={clsx("form-control", styles.fileName)}
            aria-label={form.kind === "log" ? "New log file name" : "View name"}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            ref={focusOnMount}
          />
          <ToolButton
            className={styles.action}
            type="submit"
            label={
              form.kind === "log"
                ? "Save"
                : replacingView
                  ? "Replace view"
                  : "Save view"
            }
            icon={busy ? "loading" : "confirm"}
            disabled={busy || form.name.trim() === ""}
          />
          <ToolButton
            className={styles.action}
            label="Cancel"
            disabled={busy}
            onClick={() => setForm(undefined)}
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
          setSavedView(undefined);
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
      {savedView && !error && (
        <span className={styles.saved}>
          Showing only the selection, saved as view “{savedView}”
        </span>
      )}
    </div>
  );
};
