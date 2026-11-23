/**
 * Decode and resize inside the worker (OffscreenCanvas 2D only; Safari 16.4 is 2D-only).
 * Bitmaps are closed by the caller; pixel buffers are dropped when no longer needed.
 */
import type { Dimensions } from "../types/engine";

export async function decode(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas is not available");
  return context;
}

/** True if any pixel is not fully opaque. */
export function hasTransparency(bitmap: ImageBitmap): boolean {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = context2d(canvas);
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
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
