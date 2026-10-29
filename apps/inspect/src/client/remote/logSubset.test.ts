import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { expect, test } from "vitest";

import { buildLogSubset } from "./logSubset";
import { openZipFileFromBuffer } from "./remoteZipFile";

const kHeader = `{"version": 2, "status": "success",
  "eval": {"eval_id": "orig-eval", "task_id": "orig-task", "task": "t",
           "metadata": {"run": "r1"}},
  "results": {"total_samples": 3, "scores": []},
  "stats": {"weird": NaN, "big": Infinity}}`;

const sample = (id: string | number, epoch: number) =>
  JSON.stringify({
    id,
    epoch,
    messages: [{ role: "user", content: `q${id}` }],
  });

const summary = (id: string | number, epoch: number, note = "") => ({
  id,
  epoch,
  input: `q${id}${note}`,
});

const sourceLog = (files: Record<string, string>) =>
  openZipFileFromBuffer(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, strToU8(text)])
      )
    )
  );

const readSubset = (bytes: Uint8Array) => {
  const files = unzipSync(bytes);
  const json = (name: string): unknown => {
    const data = files[name];
    if (!data) throw new Error(`missing ${name}`);
    return JSON.parse(strFromU8(data).replace(/\bNaN\b|-?Infinity/g, "null"));
  };
  return { names: Object.keys(files).sort(), files, json };
};

test("copies only the selected samples and their summaries", async () => {
  const source = await sourceLog({
    "header.json": kHeader,
    "summaries.json": JSON.stringify([
      summary("a", 1),
      summary("b", 1),
      summary(3, 1),
    ]),
    "samples/a_epoch_1.json": sample("a", 1),
    "samples/b_epoch_1.json": sample("b", 1),
    "samples/3_epoch_1.json": sample(3, 1),
    "reductions.json": "[]",
  });

  const bytes = await buildLogSubset(
    source,
    [
      { id: "b", epoch: 1 },
      { id: 3, epoch: 1 },
    ],
    "https://example.com/logs/source.eval"
  );
  const subset = readSubset(bytes);

  expect(subset.names).toEqual([
    "header.json",
    "samples/3_epoch_1.json",
    "samples/b_epoch_1.json",
    "summaries.json",
  ]);
  expect(strFromU8(subset.files["samples/b_epoch_1.json"]!)).toBe(
    sample("b", 1)
  );
  expect(subset.json("summaries.json")).toEqual([
    summary("b", 1),
    summary(3, 1),
  ]);
});

test("gives the subset its own ids, records its source and drops results", async () => {
  const source = await sourceLog({
    "header.json": kHeader,
    "summaries.json": JSON.stringify([summary("a", 1)]),
    "samples/a_epoch_1.json": sample("a", 1),
  });
  const bytes = await buildLogSubset(
    source,
    [{ id: "a", epoch: 1 }],
    "https://example.com/logs/source.eval"
  );
  const header = readSubset(bytes).json("header.json");

  expect(header).toMatchObject({
    status: "success",
    results: null,
    eval: {
      task: "t",
      metadata: {
        run: "r1",
        subset_of: { log: "https://example.com/logs/source.eval", samples: 1 },
      },
    },
  });
  expect(header).not.toMatchObject({ eval: { eval_id: "orig-eval" } });
  expect(header).not.toMatchObject({ eval: { task_id: "orig-task" } });

  // Python's bare NaN/Infinity survive the rewrite rather than becoming null
  const text = strFromU8(unzipSync(bytes)["header.json"]!);
  expect(text).toContain('"weird":NaN');
  expect(text).toContain('"big":Infinity');
});

test("reads journal summaries when there is no summaries.json, latest row winning", async () => {
  const source = await sourceLog({
    "header.json": kHeader,
    "_journal/summaries/2.json": JSON.stringify([summary("a", 1, " (retry)")]),
    "_journal/summaries/1.json": JSON.stringify([summary("a", 1)]),
    "samples/a_epoch_1.json": sample("a", 1),
  });
  const bytes = await buildLogSubset(
    source,
    [{ id: "a", epoch: 1 }],
    "source.eval"
  );
  expect(readSubset(bytes).json("summaries.json")).toEqual([
    summary("a", 1, " (retry)"),
  ]);
});

test("refuses a sample that isn't in the log or a log without a header", async () => {
  const withHeader = await sourceLog({
    "header.json": kHeader,
    "summaries.json": "[]",
  });
  await expect(
    buildLogSubset(withHeader, [{ id: "zz", epoch: 1 }], "source.eval")
  ).rejects.toThrow(/not in the log/);

  const running = await sourceLog({ "_journal/start.json": "{}" });
  await expect(
    buildLogSubset(running, [{ id: "a", epoch: 1 }], "source.eval")
  ).rejects.toThrow(/in progress/);

  await expect(buildLogSubset(withHeader, [], "source.eval")).rejects.toThrow(
    /No samples/
  );
});
