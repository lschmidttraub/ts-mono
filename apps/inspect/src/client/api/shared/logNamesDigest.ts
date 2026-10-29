import { crc32 } from "../../remote/zipWriter";

/**
 * Order-independent fingerprint of a listing's file names: the sum (mod
 * 2^32) of each name's CRC-32 over UTF-8, as 8 hex digits. The view server
 * computes the same (`log_names_digest` in `_view/common.py`); keep the two
 * in sync.
 */
export const logNamesDigest = (names: readonly string[]): string => {
  const encoder = new TextEncoder();
  let total = 0;
  for (const name of names) {
    total = (total + crc32(encoder.encode(name))) >>> 0;
  }
  return total.toString(16).padStart(8, "0");
};
