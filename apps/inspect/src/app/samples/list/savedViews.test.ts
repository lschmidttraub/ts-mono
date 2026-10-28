import { describe, expect, test } from "vitest";

import { defaultSamplesView, SamplesViewState } from "./samplesView";
import {
  applySavedView,
  captureSavedView,
  isSavedViewActive,
  parseSavedViews,
  SamplesViewSnapshot,
  upsertSavedView,
} from "./savedViews";

const accuracy = { scorer: "match", name: "accuracy" };
const hack = { scorer: "judge", name: "hack" };

const viewWith = (partial: Partial<SamplesViewState>): SamplesViewState => ({
  ...defaultSamplesView(),
  ...partial,
});

const snapshot: SamplesViewSnapshot = {
  filter: "hack == 1",
  view: viewWith({
    columns: [
      { id: "id", visible: true },
      { id: "input", visible: false },
      { id: "target", visible: true },
    ],
    sort: [{ colId: "id", dir: "desc" }],
    multiline: false,
  }),
  selectedScores: [hack],
};

describe("captureSavedView", () => {
  test("is active for the state it was captured from", () => {
    const saved = captureSavedView("hacks", snapshot);
    expect(saved.name).toBe("hacks");
    expect(isSavedViewActive(saved, snapshot)).toBe(true);
  });
});

describe("isSavedViewActive", () => {
  const saved = captureSavedView("hacks", snapshot);

  test("tracks filter, sort, scores and column visibility", () => {
    expect(isSavedViewActive(saved, { ...snapshot, filter: "" })).toBe(false);
    expect(
      isSavedViewActive(saved, { ...snapshot, selectedScores: [accuracy] })
    ).toBe(false);
    expect(
      isSavedViewActive(saved, {
        ...snapshot,
        view: { ...snapshot.view, sort: [] },
      })
    ).toBe(false);
    expect(
      isSavedViewActive(saved, {
        ...snapshot,
        view: {
          ...snapshot.view,
          columns: snapshot.view.columns.map((c) => ({ ...c, visible: true })),
        },
      })
    ).toBe(false);
  });

  test("ignores columns the view never saw", () => {
    expect(
      isSavedViewActive(saved, {
        ...snapshot,
        view: {
          ...snapshot.view,
          columns: [...snapshot.view.columns, { id: "extra", visible: true }],
        },
      })
    ).toBe(true);
  });
});

describe("applySavedView", () => {
  const saved = captureSavedView("hacks", snapshot);

  test("restores the saved state onto a log with the same columns", () => {
    const current = viewWith({
      columns: snapshot.view.columns.map((c) => ({ ...c, visible: true })),
    });
    const applied = applySavedView(saved, {
      view: current,
      availableScores: [accuracy, hack],
    });
    expect(applied.filter).toBe("hack == 1");
    expect(applied.selectedScores).toEqual([hack]);
    const after = { ...current, ...applied.viewPatch };
    expect(
      isSavedViewActive(saved, {
        filter: applied.filter,
        view: after,
        selectedScores: [hack],
      })
    ).toBe(true);
    expect(after.userOverrides.multiline).toBe(false);
  });

  test("drops columns and sorts the log doesn't have and keeps its own", () => {
    const current = viewWith({
      columns: [
        { id: "extra", visible: true },
        { id: "input", visible: true },
      ],
    });
    const applied = applySavedView(saved, {
      view: current,
      availableScores: [],
    });
    expect(applied.viewPatch.columns).toEqual([
      { id: "input", visible: false },
      { id: "extra", visible: true },
    ]);
    expect(applied.viewPatch.sort).toEqual([]);
  });

  test("leaves the score selection alone when none of the scores exist", () => {
    const applied = applySavedView(saved, {
      view: snapshot.view,
      availableScores: [accuracy],
    });
    expect(applied.selectedScores).toBeUndefined();
  });
});

describe("parseSavedViews", () => {
  test("keeps well-formed views and drops the rest", () => {
    const good = captureSavedView("ok", snapshot);
    expect(
      parseSavedViews([good, { name: "bad" }, null, { ...good, sort: [{}] }])
    ).toEqual([good]);
    expect(parseSavedViews("not a list")).toEqual([]);
  });
});

describe("upsertSavedView", () => {
  test("replaces a view of the same name in place", () => {
    const one = captureSavedView("one", snapshot);
    const two = captureSavedView("two", snapshot);
    const replaced = { ...one, filter: "x" };
    expect(upsertSavedView([one, two], replaced)).toEqual([replaced, two]);
    expect(upsertSavedView([one], two)).toEqual([one, two]);
  });
});
