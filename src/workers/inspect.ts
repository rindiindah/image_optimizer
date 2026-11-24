/**
 * Inspect an added file (M2): decode it once, check it, and describe it for the image list.
 * Returns real measured facts only (dimensions after orientation, transparency from the pixels)
 * plus a small thumbnail and a larger preview. Previews are display-only, made with the
 * browser's encoder; they're never offered as output.
 */
import type { Dimensions } from "../types/engine";
import type { ImageInfo, ImageNotice } from "../types/image";
import { MAX_PIXELS } from "../utils/limits";
import { DecodeError, decodeImage, encodeNative, pixelsAt, scanPixels } from "./pixels";

/** Longest side of the list thumbnail (2× a 96 px CSS box, for sharp high-DPI screens). */
export const THUMBNAIL_MAX_SIDE = 192;
/** Longest side of the selected-image preview (Q5). */
export const PREVIEW_MAX_SIDE = 2048;

export interface EncodedImage {
  data: ArrayBuffer;
  mime: string;
}

export interface Inspection {
  info: ImageInfo;
  thumbnail: EncodedImage;
  preview: EncodedImage;
}

export type InspectErrorCode = "decode_failed" | "megapixel_limit" | "blank_decode";

export class InspectError extends Error {
  override name = "InspectError";
  constructor(readonly code: InspectErrorCode) {
    super(code);
  }
}

/** Largest size within `maxSide` on both axes, keeping the aspect ratio. Never enlarges. */
export function fitWithin(size: Dimensions, maxSide: number): Dimensions {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

async function render(
  bitmap: ImageBitmap,
  maxSide: number,
  hasAlpha: boolean,
): Promise<EncodedImage> {
  const image = pixelsAt(bitmap, fitWithin(bitmap, maxSide), null);
  // PNG keeps transparency visible; JPEG is much smaller for everything else.
  const blob = await encodeNative(image, hasAlpha ? "image/png" : "image/jpeg", 85);
  return { data: await blob.arrayBuffer(), mime: blob.type };
}

export async function inspectFile(file: Blob): Promise<Inspection> {
  let decoded;
  try {
    decoded = await decodeImage(file, MAX_PIXELS);
  } catch (error) {
    throw new InspectError(error instanceof DecodeError ? error.code : "decode_failed");
  }
  const { bitmap } = decoded;
  try {
    const { hasAlpha, blank } = scanPixels(bitmap);
    if (blank) throw new InspectError("blank_decode");

    const notices: ImageNotice[] = [];
    if (decoded.animated) notices.push({ code: "first_frame_only" });
    if (decoded.highBitDepth) notices.push({ code: "hdr_converted" });

    const thumbnail = await render(bitmap, THUMBNAIL_MAX_SIDE, hasAlpha);
    const preview = await render(bitmap, PREVIEW_MAX_SIDE, hasAlpha);
    return {
      info: {
        format: decoded.format,
        mime: decoded.mime,
        width: bitmap.width,
        height: bitmap.height,
        hasAlpha,
        notices,
      },
      thumbnail,
      preview,
    };
  } finally {
    bitmap.close();
  }
}
