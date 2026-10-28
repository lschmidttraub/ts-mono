import { describe, expect, test } from "vitest";

import {
  defaultSubsetFileName,
  ownedSampleSelection,
  sampleSelectionKey,
  selectedSampleRefs,
  toggleAllVisible,
  toggleSampleSelection,
} from "./sampleSelection";

const [a, b, c, d] = ["a", "b", "c", "d"].map((id) =>
  sampleSelectionKey(id, 1)
);
const ordered = [a!, b!, c!, d!];

describe("sampleSelectionKey", () => {
  test("keeps numeric and string ids apart", () => {
    expect(sampleSelectionKey(1, 1)).not.toBe(sampleSelectionKey("1", 1));
  });
});

describe("toggleSampleSelection", () => {
  test("toggles a single key", () => {
    expect(toggleSampleSelection([], ordered, b!, undefined, false)).toEqual([
      b,
    ]);
    expect(toggleSampleSelection([b!], ordered, b!, b, false)).toEqual([]);
  });

  test("shift-click selects the span from the anchor, in either direction", () => {
    expect(new Set(toggleSampleSelection([a!], ordered, c!, a, true))).toEqual(
      new Set([a, b, c])
    );
    expect(new Set(toggleSampleSelection([d!], ordered, b!, d, true))).toEqual(
      new Set([b, c, d])
    );
  });

  test("shift-click on a selected row clears the span", () => {
    expect(
      toggleSampleSelection([a!, b!, c!, d!], ordered, c!, a, true)
    ).toEqual([d]);
  });

  test("an anchor no longer shown falls back to a single toggle", () => {
    const gone = sampleSelectionKey("gone", 1);
    expect(toggleSampleSelection([], ordered, c!, gone, true)).toEqual([c]);
  });
});

describe("toggleAllVisible", () => {
  test("selects all visible rows, keeping hidden selections", () => {
    const hidden = sampleSelectionKey("hidden", 1);
    expect(new Set(toggleAllVisible([hidden, a!], [a!, b!]))).toEqual(
      new Set([hidden, a, b])
    );
  });

  test("clears visible rows when they are all selected", () => {
    const hidden = sampleSelectionKey("hidden", 1);
    expect(toggleAllVisible([hidden, a!, b!], [a!, b!])).toEqual([hidden]);
  });
});

describe("ownedSampleSelection", () => {
  test("is empty for a log that doesn't own the selection", () => {
    const selection = { logFile: "x.eval", keys: [a!] };
    expect(ownedSampleSelection(selection, "x.eval").keys).toEqual([a]);
    expect(ownedSampleSelection(selection, "y.eval").keys).toEqual([]);
    expect(ownedSampleSelection(undefined, "x.eval").keys).toEqual([]);
  });
});

describe("selectedSampleRefs", () => {
  test("returns selected samples in log order", () => {
    const samples = [
      { id: "a", epoch: 1 },
      { id: "a", epoch: 2 },
      { id: 3, epoch: 1 },
    ];
    expect(
      selectedSampleRefs(samples, [
        sampleSelectionKey(3, 1),
        sampleSelectionKey("a", 2),
        sampleSelectionKey("missing", 1),
      ])
    ).toEqual([
      { id: "a", epoch: 2 },
      { id: 3, epoch: 1 },
    ]);
  });
});

describe("defaultSubsetFileName", () => {
  test("derives the name from the source log", () => {
    expect(defaultSubsetFileName("s3://bucket/logs/run_x.eval", 3)).toBe(
      "run_x_3-samples.eval"
    );
    expect(defaultSubsetFileName("/tmp/logs/old.json", 1)).toBe(
      "old_1-samples.eval"
    );
  });
});
