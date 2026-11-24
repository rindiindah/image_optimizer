/**
 * Builds small test files in code (no fixtures needed): file signatures for format detection
 * and ISO-BMFF `ftyp` boxes with chosen brands.
 */

const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

export const bytes = (...parts: (number[] | string)[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? text(p) : p)));

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

/** An ISO-BMFF file start: an `ftyp` box with the given major and compatible brands. */
export function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + compatible.length * 4;
  return bytes(u32be(size), "ftyp", major, [0, 0, 0, 0], ...compatible);
}

const u16le = (n: number) => [n & 255, (n >>> 8) & 255];

/** One 1×1 GIF image block (descriptor + LZW data for colour index 0). */
const gifFrame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00];
/** Graphic control extension: 10/100 s delay (makes a frame of an animation). */
const gifControl = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00];
const gifHeader = () => bytes("GIF89a", [1, 0, 1, 0, 0x80, 0, 0], [255, 0, 0, 0, 0, 255]);

/** Real, decodable files built in code. */
export const files = {
  /** A 1×1 red GIF with one image. */
  staticGif: () => bytes(Array.from(gifHeader()), gifFrame, [0x3b]),
  /** A 1×1 GIF animation with two frames (NETSCAPE loop extension). */
  animatedGif: () =>
    bytes(
      Array.from(gifHeader()),
      [0x21, 0xff, 0x0b],
      "NETSCAPE2.0",
      [0x03, 0x01, 0x00, 0x00, 0x00],
      gifControl,
      gifFrame,
      gifControl,
      gifFrame,
      [0x3b],
    ),
  /** An uncompressed 24-bit BMP, `width` × `height`, filled with one colour (bottom-up rows). */
  bmp: (width: number, height: number, [r, g, b] = [0, 128, 255]) => {
    const rowBytes = Math.ceil((width * 3) / 4) * 4;
    const pixelBytes = rowBytes * height;
    const row = [
      ...Array.from({ length: width }, () => [b, g, r]).flat(),
      ...Array<number>(rowBytes - width * 3).fill(0),
    ];
    return bytes(
      "BM",
      u32le(54 + pixelBytes),
      [0, 0, 0, 0],
      u32le(54),
      u32le(40),
      u32le(width),
      u32le(height),
      u16le(1),
      u16le(24),
      u32le(0),
      u32le(pixelBytes),
      u32le(2835),
      u32le(2835),
      u32le(0),
      u32le(0),
      Array.from({ length: height }, () => row).flat(),
    );
  },
};

/** The first bytes of an animated WebP (extended header with the animation flag). */
export const animatedWebpHead = () =>
  bytes("RIFF", u32le(100), "WEBP", "VP8X", u32le(10), [0x02, 0, 0, 0], [0, 0, 0, 0, 0, 0]);

/** A JPEG with an APP1 Exif segment holding only `Orientation` (inserted after SOI). */
export function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  const tiff = [
    ...text("MM"),
    0x00,
    0x2a,
    ...u32be(8),
    0x00,
    0x01, // one IFD entry
    0x01,
    0x12, // tag 0x0112 Orientation
    0x00,
    0x03, // type SHORT
    ...u32be(1),
    0x00,
    orientation,
    0x00,
    0x00,
    ...u32be(0), // no next IFD
  ];
  const payload = [...text("Exif"), 0, 0, ...tiff];
  const length = payload.length + 2;
  const app1 = [0xff, 0xe1, (length >>> 8) & 255, length & 255, ...payload];
  return bytes([0xff, 0xd8], app1, Array.from(jpeg.subarray(2)));
}

export const signatures = {
  jpeg: () => bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], "JFIF", [0]),
  png: () => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR"),
  gif87: () => bytes("GIF87a", [1, 0, 1, 0]),
  gif89: () => bytes("GIF89a", [1, 0, 1, 0]),
  webp: () => bytes("RIFF", u32le(30), "WEBP", "VP8 "),
  /** BMP file header + BITMAPINFOHEADER size (40). */
  bmp: () => bytes("BM", u32le(70), [0, 0, 0, 0], u32le(54), u32le(40), u32le(1), u32le(1)),
};
