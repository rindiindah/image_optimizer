/**
 * HEIC/HEIF decode with libheif-js (D3), used only when the browser can't decode the file
 * itself. The ≈ 2 MB bundle is imported lazily, so it is downloaded only when a HEIC file
 * actually needs it, and then reused.
 *
 * Rules (D3): decode the **primary** image only; libheif applies the HEIF transforms
 * (irot/imir), so EXIF orientation must not be applied on top. Output is 8-bit RGBA.
 */
import type { HeifDecoderInstance } from "libheif-js/libheif-wasm/libheif-bundle.mjs";

export class HeicDecodeError extends Error {
  override name = "HeicDecodeError";
}

/** The primary image has more pixels than allowed; checked before any pixels are decoded. */
export class HeicTooLargeError extends Error {
  override name = "HeicTooLargeError";
}

/**
 * One decoder for the worker's lifetime: each `decode()` frees the previous file's native
 * context, so a new decoder per file would leak that memory.
 */
let decoder: Promise<HeifDecoderInstance> | null = null;

function loadDecoder(): Promise<HeifDecoderInstance> {
  decoder ??= import("libheif-js/libheif-wasm/libheif-bundle.mjs").then((module) => {
    const { HeifDecoder } = module.default();
    return new HeifDecoder();
  });
  // A failed load (e.g. a network error fetching the chunk) may be retried on the next file.
  decoder.catch(() => {
    decoder = null;
  });
  return decoder;
}

export interface HeicImage {
  image: ImageData;
  /** Number of top-level images in the file (only the primary one is decoded). */
  topLevelImages: number;
  /** Position of the primary image among them (file order). */
  primaryIndex: number;
}

export async function decodeHeic(
  bytes: ArrayBuffer,
  maxPixels = Number.POSITIVE_INFINITY,
): Promise<HeicImage> {
  const handles = (await loadDecoder()).decode(new Uint8Array(bytes));
  try {
    if (handles.length === 0) throw new HeicDecodeError("no decodable image");
    const primaryIndex = handles.findIndex((handle) => handle.is_primary());
    const primary = handles[primaryIndex === -1 ? 0 : primaryIndex];
    if (!primary) throw new HeicDecodeError("no primary image");

    const width = primary.get_width();
    const height = primary.get_height();
    if (width <= 0 || height <= 0) throw new HeicDecodeError("image has no pixels");
    if (width * height > maxPixels) throw new HeicTooLargeError("too many pixels");
    const data = new Uint8ClampedArray(width * height * 4);
    const decoded = await new Promise<boolean>((resolve) => {
      primary.display({ data, width, height }, (result) => {
        resolve(result !== null);
      });
    });
    if (!decoded) throw new HeicDecodeError("pixel decode failed");
    return {
      image: new ImageData(data, width, height),
      topLevelImages: handles.length,
      primaryIndex: primaryIndex === -1 ? 0 : primaryIndex,
    };
  } finally {
    for (const handle of handles) handle.free();
  }
}
