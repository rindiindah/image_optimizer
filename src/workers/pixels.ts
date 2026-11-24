/**
 * Decode and resize inside the worker (OffscreenCanvas 2D only; Safari 16.4 is 2D-only).
 * Bitmaps are closed by the caller; pixel buffers are dropped when no longer needed.
 */
import type { Dimensions } from "../types/engine";
import type { InputFormat } from "../types/image";
import { readHeifBitDepth } from "../utils/heif-info";
import { exceedsPixelLimit } from "../utils/limits";
import { detectFormat, isAnimatedGif, isAnimatedWebp, SNIFF_BYTES } from "../utils/sniff";
import { decodeHeic, HeicTooLargeError } from "./heic";

/** Why a file couldn't be decoded; maps 1:1 to engine error codes. */
export class DecodeError extends Error {
  override name = "DecodeError";
  constructor(readonly code: "decode_failed" | "megapixel_limit") {
    super(code);
  }
}

export interface DecodedImage {
  /** Oriented as displayed: EXIF orientation (JPEG etc.) or the HEIF transforms, applied once. */
  bitmap: ImageBitmap;
  format: InputFormat;
  /** MIME type detected from the content. */
  mime: string;
  /** The source had more than 8 bits per channel and was converted to 8-bit (HEIC). */
  highBitDepth: boolean;
  /** An animated GIF/WebP: only the first frame is used. */
  animated: boolean;
}

/**
 * The one decode path for inspection and optimization (so HEIC works everywhere).
 * The format comes from the file's bytes, never its name or the browser's MIME guess.
 * HEIC: the browser first (Safari can), then libheif-js, loaded only now (D3).
 */
export async function decodeImage(file: Blob, maxPixels: number): Promise<DecodedImage> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniff = detectFormat(head);
  if (sniff.kind !== "image") throw new DecodeError("decode_failed");
  const { format, mime } = sniff;

  if (format === "heic") return decodeHeif(file, mime, maxPixels);

  // Re-label with the real type, so a renamed file (a PNG called .jpg) decodes as what it is.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([file], { type: mime }));
  } catch {
    throw new DecodeError("decode_failed");
  }
  checkPixels(bitmap, maxPixels);
  const animated =
    format === "gif"
      ? isAnimatedGif(new Uint8Array(await file.arrayBuffer()))
      : format === "webp" && isAnimatedWebp(head);
  return { bitmap, format, mime, highBitDepth: false, animated };
}

async function decodeHeif(file: Blob, mime: string, maxPixels: number): Promise<DecodedImage> {
  const bytes = await file.arrayBuffer();
  const depth = readHeifBitDepth(new Uint8Array(bytes));
  const highBitDepth = depth !== null && depth > 8;
  const result = (bitmap: ImageBitmap): DecodedImage => ({
    bitmap,
    format: "heic",
    mime,
    highBitDepth,
    animated: false,
  });

  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    checkPixels(bitmap, maxPixels);
    return result(bitmap);
  } catch (error) {
    if (error instanceof DecodeError) throw error;
    // The browser can't decode HEIC (Chrome, Firefox): use libheif.
  }

  try {
    // libheif applies the HEIF transforms itself; nothing else rotates it afterwards.
    const { image } = await decodeHeic(bytes, maxPixels);
    return result(await createImageBitmap(image));
  } catch (error) {
    if (error instanceof HeicTooLargeError) throw new DecodeError("megapixel_limit");
    throw new DecodeError("decode_failed");
  }
}

function checkPixels(bitmap: ImageBitmap, maxPixels: number): void {
  if (bitmap.width === 0 || bitmap.height === 0) {
    bitmap.close();
    throw new DecodeError("decode_failed");
  }
  if (exceedsPixelLimit(bitmap.width, bitmap.height) || bitmap.width * bitmap.height > maxPixels) {
    bitmap.close();
    throw new DecodeError("megapixel_limit");
  }
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas is not available");
  return context;
}

export interface PixelScan {
  /** At least one pixel isn't fully opaque. */
  hasAlpha: boolean;
  /**
   * Every byte is zero (transparent black). This is what iOS Safari produces when a canvas is
   * too large for the device: no error, just an empty canvas. Treated as a failed decode.
   */
  blank: boolean;
}

/**
 * Draws the image at full size (as the encoder will) and reads every pixel once.
 * Full size on purpose: if the device can't handle a canvas this large, it shows up here.
 */
export function scanPixels(bitmap: ImageBitmap): PixelScan {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = context2d(canvas);
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  let hasAlpha = false;
  let nonZero = false;
  for (let i = 0; i < data.length; i += 4) {
    if (!hasAlpha && data[i + 3] !== 255) hasAlpha = true;
    if (
      !nonZero &&
      (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0)
    ) {
      nonZero = true;
    }
    if (hasAlpha && nonZero) break;
  }
  return { hasAlpha, blank: !nonZero };
}

/** True if any pixel is not fully opaque. */
export function hasTransparency(bitmap: ImageBitmap): boolean {
  return scanPixels(bitmap).hasAlpha;
}

/**
 * RGBA pixels at the requested size. Downscaling is stepped (halving at most per step) for
 * quality; it never enlarges. With `background`, transparency is flattened onto that colour.
 */
export function pixelsAt(
  bitmap: ImageBitmap,
  size: Dimensions,
  background: string | null,
): ImageData {
  if (size.width > bitmap.width || size.height > bitmap.height) {
    throw new RangeError("Refusing to enlarge the image");
  }
  let current: OffscreenCanvas | ImageBitmap = bitmap;
  let width = bitmap.width;
  let height = bitmap.height;
  while (width / 2 >= size.width && height / 2 >= size.height) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    const step = new OffscreenCanvas(width, height);
    const context = context2d(step);
    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, width, height);
    current = step;
  }

  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = context2d(canvas);
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(current, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height);
}

/** Native browser encoder; the caller checks the MIME type it actually produced. */
export async function encodeNative(
  image: ImageData,
  type: string,
  quality: number | null,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  context2d(canvas).putImageData(image, 0, 0);
  return canvas.convertToBlob(quality === null ? { type } : { type, quality: quality / 100 });
}
