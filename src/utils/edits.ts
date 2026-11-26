/**
 * Geometry for crop, rotate and resize (M4). Pure, shared by the editor and the worker.
 * "Stored" rectangles are in source pixels after orientation, before rotation; "shown"
 * rectangles are in the same pixels, but in the rotated image the user sees.
 */
import type { Dimensions, ImageEdits, Rect, Rotation } from "../types/engine";

/** Size of an image of `size` after rotating it. */
export function rotatedSize(size: Dimensions, rotation: Rotation): Dimensions {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/** A stored rectangle (in an image of `size`) → where it is after rotating the image. */
export function rotateRect(rect: Rect, size: Dimensions, rotation: Rotation): Rect {
  const { x, y, width: w, height: h } = rect;
  if (rotation === 90) return { x: size.height - (y + h), y: x, width: h, height: w };
  if (rotation === 180)
    return { x: size.width - (x + w), y: size.height - (y + h), width: w, height: h };
  if (rotation === 270) return { x: y, y: size.width - (x + w), width: h, height: w };
  return { ...rect };
}

/** A shown rectangle (in the rotated image) → the stored rectangle in the un-rotated image. */
export function unrotateRect(rect: Rect, size: Dimensions, rotation: Rotation): Rect {
  const back = ((360 - rotation) % 360) as Rotation;
  return rotateRect(rect, rotatedSize(size, rotation), back);
}

export const turn = (rotation: Rotation, by: 90 | -90): Rotation =>
  ((rotation + by + 360) % 360) as Rotation;

/** Whole pixels, at least 1 × 1, fully inside an image of `size`. */
export function isValidRect(rect: Rect, size: Dimensions): boolean {
  const ints = [rect.x, rect.y, rect.width, rect.height].every(Number.isInteger);
  return (
    ints &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.width >= 1 &&
    rect.height >= 1 &&
    rect.x + rect.width <= size.width &&
    rect.y + rect.height <= size.height
  );
}

/** Rounds to whole pixels and moves/shrinks the rectangle until it fits inside `size`. */
export function clampRect(rect: Rect, size: Dimensions): Rect {
  const width = Math.min(size.width, Math.max(1, Math.round(rect.width)));
  const height = Math.min(size.height, Math.max(1, Math.round(rect.height)));
  const x = Math.min(size.width - width, Math.max(0, Math.round(rect.x)));
  const y = Math.min(size.height - height, Math.max(0, Math.round(rect.y)));
  return { x, y, width, height };
}

/** Size after crop + rotate (before any resize). */
export function editedSize(
  source: Dimensions,
  edits: Pick<ImageEdits, "crop" | "rotation">,
): Dimensions {
  return rotatedSize(edits.crop ?? source, edits.rotation);
}

/** The largest rectangle with this aspect (width / height) centred inside `within`. */
export function fitAspect(within: Rect, aspect: number): Rect {
  let width = within.width;
  let height = Math.round(width / aspect);
  if (height > within.height) {
    height = within.height;
    width = Math.round(height * aspect);
  }
  width = Math.max(1, Math.min(within.width, width));
  height = Math.max(1, Math.min(within.height, height));
  return {
    x: within.x + Math.floor((within.width - width) / 2),
    y: within.y + Math.floor((within.height - height) / 2),
    width,
    height,
  };
}

/** Keep-aspect-ratio resize: the other side for a typed side, rounded, at least 1. */
export function linkedSide(typed: number, typedOf: number, otherOf: number): number {
  return Math.max(1, Math.round((typed * otherOf) / typedOf));
}
