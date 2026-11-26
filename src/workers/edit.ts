/**
 * Crop and rotate a decoded (already oriented) bitmap in the worker (M4, order 04:
 * orient → crop → rotate → resize). Whole pixels and 90° steps only, so pixels are copied
 * exactly, never resampled. The caller closes both bitmaps.
 */
import type { Dimensions, ImageEdits } from "../types/engine";
import { editedSize, isValidRect } from "../utils/edits";

/** The edits don't fit the decoded image (e.g. a crop outside it); reported as invalid_settings. */
export class InvalidEditsError extends Error {
  override name = "InvalidEditsError";
}

/** Checks the edits against the decoded size; returns the size the optimizer starts from. */
export function outputSize(source: Dimensions, edits: ImageEdits): Dimensions {
  if (edits.crop && !isValidRect(edits.crop, source)) throw new InvalidEditsError("crop");
  const edited = editedSize(source, edits);
  const out = edits.resize ?? edited;
  const ok =
    Number.isInteger(out.width) &&
    Number.isInteger(out.height) &&
    out.width >= 1 &&
    out.height >= 1 &&
    out.width <= edited.width &&
    out.height <= edited.height; // never enlarge
  if (!ok) throw new InvalidEditsError("resize");
  return out;
}

/** Returns `bitmap` itself when there's nothing to crop or rotate. */
export function applyEdits(bitmap: ImageBitmap, edits: ImageEdits): ImageBitmap {
  const source = { width: bitmap.width, height: bitmap.height };
  if (edits.crop && !isValidRect(edits.crop, source)) throw new InvalidEditsError("crop");
  if (!edits.crop && edits.rotation === 0) return bitmap;

  const crop = edits.crop ?? { x: 0, y: 0, ...source };
  const out = editedSize(source, edits);
  const canvas = new OffscreenCanvas(out.width, out.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is not available");
  context.imageSmoothingEnabled = false;
  // Rotate the drawing space clockwise around the canvas so the crop lands at (0, 0).
  if (edits.rotation === 90) context.setTransform(0, 1, -1, 0, out.width, 0);
  else if (edits.rotation === 180) context.setTransform(-1, 0, 0, -1, out.width, out.height);
  else if (edits.rotation === 270) context.setTransform(0, -1, 1, 0, 0, out.height);
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas.transferToImageBitmap();
}
