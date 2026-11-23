/**
 * The worker's Encoder: resizes the decoded image on demand and encodes it with the
 * format's WASM codec (D15). If the WASM codec fails to load, it falls back to the
 * browser's native encoder and sets "format_fallback" (D1). Sizes are always byteLength.
 */
import type { EncodeOutput, EncodeRequest, Encoder } from "../engine/encoder";
import type { Dimensions, Flag, OutputFormat } from "../types/engine";
import {
  CodecLoadError,
  loadJpeg,
  loadOxipng,
  loadWebp,
  OXIPNG_LEVEL,
  QUANTIZER_MAX_PIXELS,
  quantizeToPng,
} from "./codecs/wasm-codecs";
import { encodeNative, pixelsAt } from "./pixels";
import type { EncoderPreference } from "./protocol";

export class ImageTooLargeError extends Error {
  override name = "ImageTooLargeError";
}

export interface WorkerEncoderOptions {
  bitmap: ImageBitmap;
  format: OutputFormat;
  allowColorReduction: boolean;
  background: string | null;
  preference: EncoderPreference;
}

/** PNG: quality 100 = lossless (OxiPNG only); below 100 = libimagequant palette, then OxiPNG. */
const PNG_LOSSLESS = 100;

export function createWorkerEncoder(options: WorkerEncoderOptions): Encoder<ArrayBuffer> {
  const { bitmap, format, background } = options;
  let useNative = options.preference === "native";
  let cached: { size: Dimensions; image: ImageData } | null = null;

  const imageAt = (size: Dimensions): ImageData => {
    if (cached?.size.width !== size.width || cached.size.height !== size.height) {
      cached = null; // drop the previous buffer before allocating a new one
      cached = { size, image: pixelsAt(bitmap, size, background) };
    }
    return cached.image;
  };

  const encodeWasm = async (
    image: ImageData,
    quality: number | null,
  ): Promise<{ data: ArrayBuffer; flags: Flag[] }> => {
    if (format === "image/jpeg") {
      const encode = await loadJpeg();
      return { data: await encode(image, { quality: quality ?? 75 }), flags: [] };
    }
    if (format === "image/webp") {
      const encode = await loadWebp();
      return { data: await encode(image, { quality: quality ?? 75 }), flags: [] };
    }
    const oxipng = await loadOxipng();
    if (quality === null || quality >= PNG_LOSSLESS) {
      const png = oxipng.optimiseRaw(image.data, image.width, image.height, OXIPNG_LEVEL);
      return { data: copyToArrayBuffer(png), flags: [] };
    }
    if (image.width * image.height > QUANTIZER_MAX_PIXELS) {
      throw new ImageTooLargeError("too many pixels for colour reduction");
    }
    const indexed = await quantizeToPng(image, quality);
    const png = oxipng.optimise(indexed, OXIPNG_LEVEL, false, false);
    return { data: copyToArrayBuffer(png), flags: ["colors_reduced"] };
  };

  const encodeFallback = async (image: ImageData, quality: number | null) => {
    const blob = await encodeNative(image, format, format === "image/png" ? null : quality);
    return {
      data: await blob.arrayBuffer(),
      mime: blob.type,
      flags: ["format_fallback"] as Flag[],
    };
  };

  return {
    qualityRange:
      format === "image/png"
        ? options.allowColorReduction
          ? { min: 1, max: PNG_LOSSLESS }
          : null
        : { min: 1, max: 100 },

    async encode(request: EncodeRequest, signal: AbortSignal): Promise<EncodeOutput<ArrayBuffer>> {
      signal.throwIfAborted();
      const image = imageAt({ width: request.width, height: request.height });
      if (!useNative) {
        try {
          const { data, flags } = await encodeWasm(image, request.quality);
          return { bytes: data.byteLength, mime: format, payload: data, flags };
        } catch (error) {
          if (!(error instanceof CodecLoadError)) throw error;
          useNative = true; // WASM codec unavailable: native fallback for the rest of this job
        }
      }
      // Native PNG has no quality or palette control; colour reduction isn't possible there.
      const { data, mime, flags } = await encodeFallback(image, request.quality);
      return { bytes: data.byteLength, mime, payload: data, flags };
    },
  };
}

/** WASM views point into WASM memory; copy into a standalone, transferable buffer. */
function copyToArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}
