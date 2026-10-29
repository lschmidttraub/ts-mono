import { expect, test } from "vitest";

import { logNamesDigest } from "./logNamesDigest";

test("matches the view server's digest, in any order", () => {
  const names = ["file:///logs/a.eval", "file:///logs/sub/ü b.eval"];
  // pinned to log_names_digest in the Python view server tests
  expect(logNamesDigest(names)).toBe("2c148067");
  expect(logNamesDigest([...names].reverse())).toBe("2c148067");
  expect(logNamesDigest([])).toBe("00000000");
});

test("changes when a log moves", () => {
  expect(logNamesDigest(["file:///logs/b.eval"])).not.toBe(
    logNamesDigest(["file:///logs/sub/b.eval"])
  );
});
