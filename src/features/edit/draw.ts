/**
 * Display only (M4): draws the worker-made preview cropped and rotated, so the editor and the
 * preview show what the output will contain. The real crop is done in the worker, at full size.
 */
import type { Dimensions, Rect, Rotation } from "../../types/engine";
import { rotatedSize } from "../../utils/edits";

/**
 * Draws `image` (a preview of a `source`-sized image) onto `canvas`, cropped to `crop`
 * (source pixels; null = whole) and rotated. The canvas gets the preview's resolution.
 */
export function drawEdited(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  source: Dimensions,
  crop: Rect | null,
  rotation: Rotation,
): void {
  const scale = image.naturalWidth / source.width;
  const c = crop ?? { x: 0, y: 0, ...source };
  const w = Math.max(1, Math.round(c.width * scale));
  const h = Math.max(1, Math.round(c.height * scale));
  const out = rotatedSize({ width: w, height: h }, rotation);
  canvas.width = out.width;
  canvas.height = out.height;
  const context = canvas.getContext("2d");
  if (!context) return; // no canvas (e.g. unit tests): nothing to show
  if (rotation === 90) context.setTransform(0, 1, -1, 0, out.width, 0);
  else if (rotation === 180) context.setTransform(-1, 0, 0, -1, out.width, out.height);
  else if (rotation === 270) context.setTransform(0, -1, 1, 0, 0, out.height);
  context.drawImage(image, c.x * scale, c.y * scale, c.width * scale, c.height * scale, 0, 0, w, h);
}

/** Loads an image URL (the preview) for drawing; resolves null if it can't be loaded. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      resolve(null);
    };
    image.src = url;
  });
}
