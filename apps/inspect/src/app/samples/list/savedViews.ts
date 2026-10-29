import { isRecord } from "@tsmono/util";

import type { ScoreLabel } from "../../types";

import type { SamplesViewState } from "./samplesView";

/**
 * A named preset for the samples list, like a W&B saved view: the filter
 * expression plus the columns, sort, selected scores and row layout that
 * were showing when it was saved. Views are global (not per log) so one
 * saved for a task's scores applies to every log of that task.
 */
export interface SavedSampleView {
  name: string;
  filter: string;
  columns: SamplesViewState["columns"];
  sort: SamplesViewState["sort"];
  scores: ScoreLabel[];
  multiline: boolean;
  compactScores: boolean;
}

export interface SamplesViewSnapshot {
  filter: string;
  view: SamplesViewState;
  selectedScores: ScoreLabel[];
}

export const captureSavedView = (
  name: string,
  current: SamplesViewSnapshot
): SavedSampleView => ({
  name,
  filter: current.filter,
  columns: current.view.columns.map(({ id, visible }) => ({ id, visible })),
  sort: current.view.sort.map(({ colId, dir }) => ({ colId, dir })),
  scores: current.selectedScores.map(({ scorer, name }) => ({ scorer, name })),
  multiline: current.view.multiline,
  compactScores: current.view.compactScores,
});

const scoreKey = (s: ScoreLabel) => JSON.stringify([s.scorer, s.name]);

export interface AppliedSavedView {
  filter: string;
  viewPatch: Partial<SamplesViewState>;
  /** Undefined leaves the selection alone: none of the view's scores exist
   *  in this log. */
  selectedScores: ScoreLabel[] | undefined;
}

/**
 * Resolve `saved` against the current log. Columns and sorts the log doesn't
 * have are dropped; columns the view doesn't mention keep their visibility
 * and follow the view's columns in their current order.
 */
export const applySavedView = (
  saved: SavedSampleView,
  current: { view: SamplesViewState; availableScores: ScoreLabel[] }
): AppliedSavedView => {
  const savedVisibility = new Map(saved.columns.map((c) => [c.id, c.visible]));
  const currentById = new Map(current.view.columns.map((c) => [c.id, c]));
  const columns: SamplesViewState["columns"] = [
    ...saved.columns.filter((c) => currentById.has(c.id)),
    ...current.view.columns.filter((c) => !savedVisibility.has(c.id)),
  ];
  const sort = saved.sort.filter((s) => currentById.has(s.colId));

  const available = new Map(
    current.availableScores.map((s) => [scoreKey(s), s])
  );
  const matchedScores = saved.scores.flatMap((s) => {
    const match = available.get(scoreKey(s));
    return match ? [match] : [];
  });
  const selectedScores =
    saved.scores.length === 0 || matchedScores.length > 0
      ? matchedScores
      : undefined;

  return {
    filter: saved.filter,
    viewPatch: {
      columns,
      sort,
      multiline: saved.multiline,
      compactScores: saved.compactScores,
      userOverrides: {
        ...current.view.userOverrides,
        multiline: saved.multiline,
        compactScores: saved.compactScores,
      },
    },
    selectedScores,
  };
};

/** Whether the list currently shows `saved`, judged over the columns both
 *  have (a log may have columns the view never saw). */
export const isSavedViewActive = (
  saved: SavedSampleView,
  current: SamplesViewSnapshot
): boolean => {
  if (saved.filter.trim() !== current.filter.trim()) return false;
  if (saved.multiline !== current.view.multiline) return false;
  if (saved.compactScores !== current.view.compactScores) return false;
  if (JSON.stringify(saved.sort) !== JSON.stringify(current.view.sort)) {
    return false;
  }
  const savedScores = new Set(saved.scores.map(scoreKey));
  const currentScores = new Set(current.selectedScores.map(scoreKey));
  if (
    savedScores.size !== currentScores.size ||
    [...savedScores].some((k) => !currentScores.has(k))
  ) {
    return false;
  }
  const currentVisibility = new Map(
    current.view.columns.map((c) => [c.id, c.visible])
  );
  return saved.columns.every((c) => {
    const visible = currentVisibility.get(c.id);
    return visible === undefined || visible === c.visible;
  });
};

const isScoreLabel = (v: unknown): v is ScoreLabel =>
  isRecord(v) && typeof v.name === "string" && typeof v.scorer === "string";

const isColumn = (v: unknown): v is SavedSampleView["columns"][number] =>
  isRecord(v) && typeof v.id === "string" && typeof v.visible === "boolean";

const isSort = (v: unknown): v is SavedSampleView["sort"][number] =>
  isRecord(v) &&
  typeof v.colId === "string" &&
  (v.dir === "asc" || v.dir === "desc");

const isSavedSampleView = (v: unknown): v is SavedSampleView =>
  isRecord(v) &&
  typeof v.name === "string" &&
  typeof v.filter === "string" &&
  Array.isArray(v.columns) &&
  v.columns.every(isColumn) &&
  Array.isArray(v.sort) &&
  v.sort.every(isSort) &&
  Array.isArray(v.scores) &&
  v.scores.every(isScoreLabel) &&
  typeof v.multiline === "boolean" &&
  typeof v.compactScores === "boolean";

/** Views from browser storage, which any viewer version may have written:
 *  entries that don't match the current shape are dropped. */
export const parseSavedViews = (persisted: unknown): SavedSampleView[] =>
  Array.isArray(persisted) ? persisted.filter(isSavedSampleView) : [];

/** Whether `name` can be given to the view now called `current` (or to a
 *  new view): not blank and not used by another view. */
export const isAvailableViewName = (
  views: readonly SavedSampleView[],
  name: string,
  current?: string
): boolean => {
  const trimmed = name.trim();
  return (
    trimmed !== "" &&
    !views.some((v) => v.name === trimmed && v.name !== current)
  );
};

/** Rename the view `from` to `to` in place. Unchanged if `to` isn't an
 *  available name. */
export const renameSavedView = (
  views: readonly SavedSampleView[],
  from: string,
  to: string
): SavedSampleView[] => {
  if (!isAvailableViewName(views, to, from)) return [...views];
  return views.map((v) => (v.name === from ? { ...v, name: to.trim() } : v));
};

/** Insert `view`, replacing any view with the same name in place. */
export const upsertSavedView = (
  views: readonly SavedSampleView[],
  view: SavedSampleView
): SavedSampleView[] => {
  const index = views.findIndex((v) => v.name === view.name);
  if (index < 0) return [...views, view];
  return views.map((v, i) => (i === index ? view : v));
};

// Filter strings take only `\"` and `\\` escapes (filtrex), so JSON.stringify's
// `\n`-style escapes would not round-trip.
const filterLiteral = (id: string | number): string =>
  typeof id === "number"
    ? String(id)
    : `"${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const idCondition = (ids: readonly (string | number)[]): string =>
  ids.length === 1
    ? `id == ${filterLiteral(ids[0]!)}`
    : `id in (${ids.map(filterLiteral).join(", ")})`;

/**
 * A filter expression matching exactly the `selected` samples. Ids alone
 * suffice when the log has one epoch; otherwise each epoch gets its own id
 * list, so selecting one epoch of a sample doesn't show the others.
 */
export const selectionFilter = (
  selected: readonly { id: string | number; epoch: number }[],
  logEpochs: ReadonlySet<number>
): string => {
  if (logEpochs.size <= 1) {
    return idCondition([...new Set(selected.map((s) => s.id))]);
  }
  const byEpoch = new Map<number, (string | number)[]>();
  for (const { id, epoch } of selected) {
    byEpoch.set(epoch, [...(byEpoch.get(epoch) ?? []), id]);
  }
  return [...byEpoch]
    .sort(([a], [b]) => a - b)
    .map(([epoch, ids]) => `(epoch == ${epoch} and ${idCondition(ids)})`)
    .join(" or ");
};
