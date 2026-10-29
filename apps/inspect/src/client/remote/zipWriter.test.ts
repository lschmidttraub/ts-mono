import { deflateSync, strToU8, unzipSync } from "fflate";
import { expect, test } from "vitest";

import { openZipFileFromBuffer } from "./remoteZipFile";
import { crc32, storedEntry, writeZip } from "./zipWriter";

test("crc32 matches the standard check value", () => {
  expect(crc32(strToU8("123456789"))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array())).toBe(0);
});

test("writes stored and pre-compressed entries other readers can open", async () => {
  const text = strToU8('{"hello": "wörld", "n": NaN}'.repeat(50));
  const bytes = writeZip([
    storedEntry("header.json", strToU8("{}")),
    {
      name: "samples/ä|1_epoch_1.json",
      data: deflateSync(text),
      compressionMethod: 8,
      crc32: crc32(text),
      uncompressedSize: text.length,
    },
  ]);

  // an independent reader
  const files = unzipSync(bytes);
  expect(Object.keys(files)).toEqual([
    "header.json",
    "samples/ä|1_epoch_1.json",
  ]);
  expect(files["samples/ä|1_epoch_1.json"]).toEqual(text);

  // and the viewer's own reader, which checks sizes against the directory
  const zip = await openZipFileFromBuffer(bytes);
  expect(await zip.readFile("samples/ä|1_epoch_1.json")).toEqual(text);
  expect(zip.centralDirectory.get("header.json")?.crc32).toBe(
    crc32(strToU8("{}"))
  );
});

test("readRawFile returns an entry's stored bytes unchanged", async () => {
  const text = strToU8("x".repeat(1000));
  const compressed = deflateSync(text);
  const zip = await openZipFileFromBuffer(
    writeZip([
      {
        name: "a.json",
        data: compressed,
        compressionMethod: 8,
        crc32: crc32(text),
        uncompressedSize: text.length,
      },
    ])
  );
  expect(await zip.readRawFile("a.json")).toEqual(compressed);
});

test("rejects entries that would need ZIP64", () => {
  expect(() =>
    writeZip([
      {
        name: "big.json",
        data: new Uint8Array(1),
        compressionMethod: 8,
        crc32: 0,
        uncompressedSize: 0x1_0000_0000,
      },
    ])
  ).toThrow(/too large/);
});
