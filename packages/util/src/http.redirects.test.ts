import { expect, test } from "vitest";

import { allowLogFetchRedirects, logFetchInit } from "./http";

// A file of its own: the opt-in is module state, and vitest isolates files.
test("allowLogFetchRedirects makes log fetches, and copies of the options, follow redirects", () => {
  expect({ ...logFetchInit }.redirect).toBe("error");
  allowLogFetchRedirects();
  expect({ ...logFetchInit }.redirect).toBe("follow");
  expect(logFetchInit.redirect).toBe("follow");
});
