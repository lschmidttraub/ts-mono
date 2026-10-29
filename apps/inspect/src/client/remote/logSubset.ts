import { asyncJsonParseBytes, isRecord } from "@tsmono/util";

import type { SampleRef } from "../api/types";

import { storedEntry, writeZip, ZipWriteEntry } from "./zipWriter";

/** The parts of an opened .eval archive that a subset is built from. */
export interface LogSubsetSource {
  centralDirectory: ReadonlyMap<
    string,
    { compressionMethod: number; crc32: number; uncompressedSize: number }
  >;
  readFile: (file: string) => Promise<Uint8Array>;
  readRawFile: (file: string) => Promise<Uint8Array>;
}

const kHeaderFile = "header.json";
const kSummariesFile = "summaries.json";
const kJournalSummariesDir = "_journal/summaries/";
const kSampleReadConcurrency = 6;

const refKey = (id: unknown, epoch: unknown) => JSON.stringify([id, epoch]);

const sampleFile = (ref: SampleRef) =>
  `samples/${ref.id}_epoch_${ref.epoch}.json`;

// Python writes NaN/Infinity as bare tokens, which JSON.stringify would turn
// into null; round-trip them through a sentinel string instead.
const kNonFinite = "__inspect_subset_nonfinite__";
const kNonFiniteToken = new RegExp(
  `"${kNonFinite}(NaN|Infinity|-Infinity)"`,
  "g"
);
const encodeJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify(value, (_key, v: unknown) =>
      typeof v === "number" && !Number.isFinite(v) ? `${kNonFinite}${v}` : v
    ).replace(kNonFiniteToken, "$1")
  );

// crypto.randomUUID needs a secure context; getRandomValues does not.
const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

const readJson = async (
  source: LogSubsetSource,
  file: string
): Promise<unknown> =>
  asyncJsonParseBytes<unknown>(await source.readFile(file));

const journalIndex = (file: string) =>
  Number(file.slice(kJournalSummariesDir.length).replace(/\.json$/, ""));

/** Summary rows in write order: `summaries.json`, else the journal files. */
const readSummaryRows = async (source: LogSubsetSource): Promise<unknown[]> => {
  const files = source.centralDirectory.has(kSummariesFile)
    ? [kSummariesFile]
    : [...source.centralDirectory.keys()]
        .filter(
          (f) => f.startsWith(kJournalSummariesDir) && f.endsWith(".json")
        )
        .sort((a, b) => journalIndex(a) - journalIndex(b));
  const rows: unknown[] = [];
  for (const file of files) {
    const parsed = await readJson(source, file);
    if (!Array.isArray(parsed)) throw new Error(`Expected an array in ${file}`);
    const fileRows: unknown[] = parsed;
    rows.push(...fileRows);
  }
  return rows;
};

const readSampleEntries = async (
  source: LogSubsetSource,
  samples: readonly SampleRef[]
): Promise<ZipWriteEntry[]> => {
  const entries: ZipWriteEntry[] = new Array<ZipWriteEntry>(samples.length);
  let next = 0;
  const worker = async () => {
    while (next < samples.length) {
      const index = next++;
      const ref = samples[index]!;
      const name = sampleFile(ref);
      const entry = source.centralDirectory.get(name);
      if (!entry) {
        throw new Error(
          `Sample ${ref.id} (epoch ${ref.epoch}) is not in the log.`
        );
      }
      entries[index] = {
        name,
        data: await source.readRawFile(name),
        compressionMethod: entry.compressionMethod,
        crc32: entry.crc32,
        uncompressedSize: entry.uncompressedSize,
      };
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(kSampleReadConcurrency, samples.length) },
      worker
    )
  );
  return entries;
};

/**
 * Build a .eval log holding only `samples` of the log in `source`, in the
 * browser (for hosts with no view server, like a bundled Space). Sample
 * entries are copied without recompressing. Like the view server's subsets,
 * the new log gets fresh `eval_id`/`task_id` values and records its source
 * under `eval.metadata.subset_of`. Its aggregate `results` are removed:
 * metrics can only be rebuilt in Python (`inspect_ai.log.recompute_metrics`).
 */
export const buildLogSubset = async (
  source: LogSubsetSource,
  samples: readonly SampleRef[],
  sourceLog: string
): Promise<Uint8Array<ArrayBuffer>> => {
  if (samples.length === 0) throw new Error("No samples were selected.");
  if (!source.centralDirectory.has(kHeaderFile)) {
    throw new Error(
      "Cannot copy samples from a log that is still in progress (it has no header yet)."
    );
  }

  const header = await readJson(source, kHeaderFile);
  if (!isRecord(header) || !isRecord(header.eval)) {
    throw new Error(`Unexpected ${kHeaderFile} in the log`);
  }
  const metadata = isRecord(header.eval.metadata) ? header.eval.metadata : {};
  const subsetHeader = {
    ...header,
    eval: {
      ...header.eval,
      eval_id: randomId(),
      task_id: randomId(),
      metadata: {
        ...metadata,
        subset_of: { log: sourceLog, samples: samples.length },
      },
    },
    results: null,
  };

  const wanted = new Set(samples.map((s) => refKey(s.id, s.epoch)));
  // A later journal row for the same sample supersedes an earlier one.
  const summaries = new Map<string, unknown>();
  for (const row of await readSummaryRows(source)) {
    if (!isRecord(row)) continue;
    const key = refKey(row.id, row.epoch);
    if (wanted.has(key)) summaries.set(key, row);
  }

  return writeZip([
    ...(await readSampleEntries(source, samples)),
    storedEntry(
      kSummariesFile,
      encodeJson(
        samples.flatMap((s) => summaries.get(refKey(s.id, s.epoch)) ?? [])
      )
    ),
    storedEntry(kHeaderFile, encodeJson(subsetHeader)),
  ]);
};
