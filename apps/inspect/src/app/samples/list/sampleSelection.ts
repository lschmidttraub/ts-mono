import type { SampleRef } from "../../../client/api/types";
import type { SampleSelectionState } from "../../types";

const kNoKeys: readonly string[] = Object.freeze([]);

/** The selection as seen from `logFile`: empty unless that log owns it. */
export const ownedSampleSelection = (
  selection: SampleSelectionState | undefined,
  logFile: string | undefined
): { keys: readonly string[]; lastToggledKey?: string } =>
  selection && logFile !== undefined && selection.logFile === logFile
    ? selection
    : { keys: kNoKeys };

/** Lossless key for a sample: ids may be numbers or strings, so `1` and `"1"`
 *  must not collide (the grid's row ids flatten both to text). */
export const sampleSelectionKey = (
  id: string | number,
  epoch: number
): string => JSON.stringify([id, epoch]);

/**
 * Toggle `key`. With `range` (shift-click) and an anchor that is still in
 * `orderedKeys`, every key between the anchor and `key` takes the state `key`
 * is toggled to, as in mail clients.
 */
export const toggleSampleSelection = (
  selected: readonly string[],
  orderedKeys: readonly string[],
  key: string,
  anchor: string | undefined,
  range: boolean
): string[] => {
  const next = new Set(selected);
  const select = !next.has(key);
  const from = range && anchor !== undefined ? orderedKeys.indexOf(anchor) : -1;
  const to = orderedKeys.indexOf(key);
  const span =
    from >= 0 && to >= 0
      ? orderedKeys.slice(Math.min(from, to), Math.max(from, to) + 1)
      : [key];
  for (const k of span) {
    if (select) next.add(k);
    else next.delete(k);
  }
  return [...next];
};

/** Header checkbox: select every visible row, or clear them if all are
 *  already selected. Selected rows outside `visibleKeys` are kept. */
export const toggleAllVisible = (
  selected: readonly string[],
  visibleKeys: readonly string[]
): string[] => {
  const next = new Set(selected);
  const allSelected =
    visibleKeys.length > 0 && visibleKeys.every((k) => next.has(k));
  for (const k of visibleKeys) {
    if (allSelected) next.delete(k);
    else next.add(k);
  }
  return [...next];
};

/** The selected samples as API refs, in log order. */
export const selectedSampleRefs = (
  samples: readonly { id: string | number; epoch: number }[],
  selected: readonly string[]
): SampleRef[] => {
  const keys = new Set(selected);
  return samples
    .filter((s) => keys.has(sampleSelectionKey(s.id, s.epoch)))
    .map((s) => ({ id: s.id, epoch: s.epoch }));
};

/** Default name for a subset log: `<source stem>_<n>-samples.eval`. */
export const defaultSubsetFileName = (
  logFile: string,
  count: number
): string => {
  const base = logFile.split(/[\\/]/).pop() ?? "log.eval";
  const stem = base.replace(/\.(eval|json)$/, "");
  return `${stem}_${count}-samples.eval`;
};
