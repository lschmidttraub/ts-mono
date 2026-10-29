/** An entry to write: `data` is already in `compressionMethod`'s encoding. */
export interface ZipWriteEntry {
  name: string;
  data: Uint8Array;
  compressionMethod: number;
  crc32: number;
  uncompressedSize: number;
}

const kMethodStored = 0;
const kMethodDeflate = 8;
// Bit 11: file names are UTF-8 (sample ids can be any string).
const kFlagUtf8 = 0x0800;
const kMaxClassic = 0xffffffff;

let crcTable: Uint32Array | undefined;

export const crc32 = (bytes: Uint8Array): number => {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** An uncompressed entry for `data`. */
export const storedEntry = (name: string, data: Uint8Array): ZipWriteEntry => ({
  name,
  data,
  compressionMethod: kMethodStored,
  crc32: crc32(data),
  uncompressedSize: data.length,
});

// Deflate and stored need 2.0; other methods (e.g. zstd, 93) declare 6.3.
const versionNeeded = (method: number) =>
  method === kMethodStored || method === kMethodDeflate ? 20 : 63;

/**
 * Write a ZIP archive from entries whose data is already encoded, so entries
 * read raw from another archive are copied without recompressing. Writes the
 * classic format only: an archive that would need ZIP64 (4 GiB or 65535
 * entries) is rejected.
 */
export const writeZip = (
  entries: readonly ZipWriteEntry[]
): Uint8Array<ArrayBuffer> => {
  if (entries.length > 0xffff) {
    throw new Error("Too many files for a ZIP archive written in the browser");
  }
  const encoder = new TextEncoder();
  const names = entries.map((e) => encoder.encode(e.name));
  const localSize = entries.reduce(
    (n, e, i) => n + 30 + names[i]!.length + e.data.length,
    0
  );
  const centralSize = names.reduce((n, name) => n + 46 + name.length, 0);
  if (
    localSize + centralSize > kMaxClassic ||
    entries.some((e) => e.uncompressedSize > kMaxClassic)
  ) {
    throw new Error(
      "The selected samples are too large (over 4 GiB) to download from the browser"
    );
  }

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let pos = 0;
  entries.forEach((entry, i) => {
    const name = names[i]!;
    offsets.push(pos);
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, versionNeeded(entry.compressionMethod), true);
    view.setUint16(pos + 6, kFlagUtf8, true);
    view.setUint16(pos + 8, entry.compressionMethod, true);
    view.setUint16(pos + 10, 0, true); // mod time
    view.setUint16(pos + 12, 0x21, true); // mod date: 1980-01-01
    view.setUint32(pos + 14, entry.crc32, true);
    view.setUint32(pos + 18, entry.data.length, true);
    view.setUint32(pos + 22, entry.uncompressedSize, true);
    view.setUint16(pos + 26, name.length, true);
    view.setUint16(pos + 28, 0, true);
    out.set(name, pos + 30);
    out.set(entry.data, pos + 30 + name.length);
    pos += 30 + name.length + entry.data.length;
  });

  const centralStart = pos;
  entries.forEach((entry, i) => {
    const name = names[i]!;
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, versionNeeded(entry.compressionMethod), true);
    view.setUint16(pos + 6, versionNeeded(entry.compressionMethod), true);
    view.setUint16(pos + 8, kFlagUtf8, true);
    view.setUint16(pos + 10, entry.compressionMethod, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint16(pos + 14, 0x21, true);
    view.setUint32(pos + 16, entry.crc32, true);
    view.setUint32(pos + 20, entry.data.length, true);
    view.setUint32(pos + 24, entry.uncompressedSize, true);
    view.setUint16(pos + 28, name.length, true);
    // extra length, comment length, disk number, internal/external attributes
    view.setUint32(pos + 42, offsets[i]!, true);
    out.set(name, pos + 46);
    pos += 46 + name.length;
  });

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, pos - centralStart, true);
  view.setUint32(pos + 16, centralStart, true);
  return out;
};
