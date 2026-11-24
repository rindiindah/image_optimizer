/**
 * Input limits (owner, M2 Q2, 2026-11-24). One place to change them.
 * Decimal units (D4): 100 MB = 100,000,000 B; 50 MP = 50,000,000 pixels.
 */
import { MB } from "./file-size";

/** Largest file accepted, inclusive. */
export const MAX_FILE_BYTES = 100 * MB;
/** Most images in the list at once, inclusive. */
export const MAX_FILES = 50;
/** Most pixels per image (width × height after orientation), inclusive. 48 MP iPhone photos fit. */
export const MAX_PIXELS = 50_000_000;

export function isFileTooLarge(bytes: number): boolean {
  return bytes > MAX_FILE_BYTES;
}

export function exceedsPixelLimit(width: number, height: number): boolean {
  return width * height > MAX_PIXELS;
}

/** How many more files fit when `current` images are already in the list. */
export function remainingSlots(current: number): number {
  return Math.max(0, MAX_FILES - current);
}
