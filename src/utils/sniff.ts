/**
 * Detects an image format from the file's first bytes, never from its name or the browser's
 * MIME guess. SVG (untrusted markup) and anything unrecognised are refused.
 */
import type { InputFormat } from "../types/image";

/** How many leading bytes `detectFormat` needs (an ISO-BMFF `ftyp` box fits easily). */
export const SNIFF_BYTES = 4096;

export type SniffResult =
  { kind: "image"; format: InputFormat; mime: string } | { kind: "svg" } | { kind: "unknown" };

/** HEIF brands whose images are HEVC-coded (stills and sequences, 8- and 10-bit). */
const HEVC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
/** Generic HEIF brands that don't say which codec is inside. */
const GENERIC_HEIF_BRANDS = new Set(["mif1", "msf1"]);

/** DIB header sizes of real BMP files (BITMAPCOREHEADER … BITMAPV5HEADER). */
const BMP_DIB_SIZES = new Set([12, 40, 52, 56, 64, 108, 124]);

const ascii = (bytes: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...bytes.subarray(start, end));

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

/** ISO-BMFF (`ftyp` first): HEIC/HEIF or AVIF, decided by the brands. */
function sniffIsoBmff(bytes: Uint8Array): SniffResult | null {
  if (bytes.length < 16 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const boxSize = readUint32BE(bytes, 0);
  if (boxSize < 16) return { kind: "unknown" };
  const end = Math.min(boxSize, bytes.length);
  const major = ascii(bytes, 8, 12);
  const brands = [major];
  for (let offset = 16; offset + 4 <= end; offset += 4)
    brands.push(ascii(bytes, offset, offset + 4));

  // The major brand decides when it's specific; otherwise the compatible brands do.
  if (HEVC_BRANDS.has(major)) return { kind: "image", format: "heic", mime: "image/heic" };
  if (AVIF_BRANDS.has(major)) return { kind: "image", format: "avif", mime: "image/avif" };
  if (brands.some((b) => AVIF_BRANDS.has(b))) {
    return { kind: "image", format: "avif", mime: "image/avif" };
  }
  if (brands.some((b) => HEVC_BRANDS.has(b))) {
    return { kind: "image", format: "heic", mime: "image/heic" };
  }
  if (brands.some((b) => GENERIC_HEIF_BRANDS.has(b))) {
    return { kind: "image", format: "heic", mime: "image/heif" };
  }
  return { kind: "unknown" };
}

/** Text that is (or wraps) SVG markup: optional BOM/whitespace, then XML or `<svg`. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, SNIFF_BYTES));
  text = text
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (!text.startsWith("<")) return false;
  return text.includes("<svg");
}

export function detectFormat(bytes: Uint8Array): SniffResult {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { kind: "image", format: "jpeg", mime: "image/jpeg" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "image", format: "png", mime: "image/png" };
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return { kind: "image", format: "gif", mime: "image/gif" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { kind: "image", format: "webp", mime: "image/webp" };
  }
  // "BM" alone is too weak (plain text can start with it): also require a known DIB header size.
  if (
    bytes.length >= 18 &&
    ascii(bytes, 0, 2) === "BM" &&
    BMP_DIB_SIZES.has(readUint32LE(bytes, 14))
  ) {
    return { kind: "image", format: "bmp", mime: "image/bmp" };
  }
  const isoBmff = sniffIsoBmff(bytes);
  if (isoBmff) return isoBmff;
  if (looksLikeSvg(bytes)) return { kind: "svg" };
  return { kind: "unknown" };
}

/**
 * True for an animated WebP: an extended header (`VP8X`) with the animation flag. Only the
 * first frame is used, so the user gets a notice. Needs the first 21 bytes.
 */
export function isAnimatedWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 21 && ascii(bytes, 12, 16) === "VP8X" && ((bytes[20] ?? 0) & 0x02) !== 0;
}

/**
 * True when a GIF holds more than one image (an animation). Walks the GIF blocks of the whole
 * file; stops safely on anything malformed (then it reports `false`, i.e. no notice).
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (bytes.length < 13) return false;
  const at = (i: number) => bytes[i] ?? 0;
  const colorTableSize = (flags: number) => (flags & 0x80 ? 3 * (1 << ((flags & 0x07) + 1)) : 0);
  let p = 13 + colorTableSize(at(10));
  // Data sub-blocks: a length byte, that many bytes, … until a zero length.
  const skipSubBlocks = (): boolean => {
    while (p < bytes.length) {
      const length = at(p);
      p += 1;
      if (length === 0) return true;
      p += length;
    }
    return false;
  };
  let images = 0;
  while (p < bytes.length) {
    const block = at(p);
    p += 1;
    if (block === 0x21) {
      p += 1; // extension label
      if (!skipSubBlocks()) return false;
    } else if (block === 0x2c) {
      images += 1;
      if (images > 1) return true;
      if (p + 9 > bytes.length) return false;
      const flags = at(p + 8);
      p += 9 + colorTableSize(flags) + 1; // descriptor, local colour table, LZW code size
      if (!skipSubBlocks()) return false;
    } else {
      return false; // trailer (0x3b) or anything unexpected
    }
  }
  return false;
}

/** Extensions that normally go with each format (lower case, no dot). */
const EXTENSIONS: Record<InputFormat, readonly string[]> = {
  jpeg: ["jpg", "jpeg", "jpe", "jfif"],
  png: ["png"],
  webp: ["webp"],
  gif: ["gif"],
  bmp: ["bmp", "dib"],
  avif: ["avif"],
  heic: ["heic", "heif", "hif"],
};

/**
 * True when the name's extension contradicts the content (Q3: such files are accepted with a
 * notice). A name without an extension is not a mismatch.
 */
export function extensionMismatch(format: InputFormat, extension: string): boolean {
  return extension !== "" && !EXTENSIONS[format].includes(extension.toLowerCase());
}
