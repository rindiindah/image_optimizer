import { describe, expect, it } from "vitest";
import type { Rect, Rotation } from "../../src/types/engine";
import {
  clampRect,
  editedSize,
  fitAspect,
  isValidRect,
  linkedSide,
  rotateRect,
  rotatedSize,
  turn,
  unrotateRect,
} from "../../src/utils/edits";

const size = { width: 300, height: 200 };
const rect: Rect = { x: 37, y: 21, width: 123, height: 77 };
const rotations: Rotation[] = [0, 90, 180, 270];

/** Rotates one pixel position the way the image is rotated (independent of rotateRect). */
function rotatePoint(x: number, y: number, rotation: Rotation): [number, number] {
  if (rotation === 90) return [size.height - 1 - y, x];
  if (rotation === 180) return [size.width - 1 - x, size.height - 1 - y];
  if (rotation === 270) return [y, size.width - 1 - x];
  return [x, y];
}

describe("rotation geometry", () => {
  it("rotated size swaps for 90° and 270°", () => {
    expect(rotatedSize(size, 0)).toEqual(size);
    expect(rotatedSize(size, 90)).toEqual({ width: 200, height: 300 });
    expect(rotatedSize(size, 180)).toEqual(size);
    expect(rotatedSize(size, 270)).toEqual({ width: 200, height: 300 });
  });

  it("a rotated rectangle covers exactly the rotated pixels", () => {
    for (const rotation of rotations) {
      const shown = rotateRect(rect, size, rotation);
      const corners = [
        rotatePoint(rect.x, rect.y, rotation),
        rotatePoint(rect.x + rect.width - 1, rect.y + rect.height - 1, rotation),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      expect(shown, String(rotation)).toEqual({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs) + 1,
        height: Math.max(...ys) - Math.min(...ys) + 1,
      });
      expect(isValidRect(shown, rotatedSize(size, rotation))).toBe(true);
    }
  });

  it("un-rotating a shown rectangle gives back the stored one (round trip)", () => {
    for (const rotation of rotations) {
      expect(unrotateRect(rotateRect(rect, size, rotation), size, rotation)).toEqual(rect);
    }
  });

  it("turns in 90° steps both ways", () => {
    expect(turn(0, 90)).toBe(90);
    expect(turn(270, 90)).toBe(0);
    expect(turn(0, -90)).toBe(270);
  });

  it("edited size = crop (or whole image), then rotation", () => {
    expect(editedSize(size, { crop: null, rotation: 0 })).toEqual(size);
    expect(editedSize(size, { crop: rect, rotation: 90 })).toEqual({ width: 77, height: 123 });
  });
});

describe("crop validation and clamping", () => {
  it("accepts whole-pixel rectangles inside the image, at least 1 × 1", () => {
    expect(isValidRect({ x: 0, y: 0, width: 300, height: 200 }, size)).toBe(true);
    expect(isValidRect({ x: 299, y: 199, width: 1, height: 1 }, size)).toBe(true);
    for (const bad of [
      { x: -1, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 0, height: 10 },
      { x: 291, y: 0, width: 10, height: 10 },
      { x: 0, y: 191, width: 10, height: 10 },
      { x: 0.5, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 10, height: Number.NaN },
    ]) {
      expect(isValidRect(bad, size), JSON.stringify(bad)).toBe(false);
    }
  });

  it("clamping rounds, keeps at least 1 px and moves the rectangle inside", () => {
    expect(clampRect({ x: -5, y: -5, width: 10.4, height: 0.2 }, size)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 1,
    });
    expect(clampRect({ x: 295, y: 10, width: 20, height: 20 }, size)).toEqual({
      x: 280,
      y: 10,
      width: 20,
      height: 20,
    });
    expect(clampRect({ x: 0, y: 0, width: 999, height: 999 }, size)).toEqual({
      x: 0,
      y: 0,
      ...size,
    });
    for (const r of [
      { x: 12.6, y: 199.7, width: 50.5, height: 3.3 },
      { x: -3, y: 400, width: 1, height: 1 },
    ]) {
      expect(isValidRect(clampRect(r, size), size)).toBe(true);
    }
  });
});

describe("ratio fitting and linked resize", () => {
  it("fits the largest centred rectangle with the ratio", () => {
    expect(fitAspect({ x: 0, y: 0, ...size }, 1)).toEqual({ x: 50, y: 0, width: 200, height: 200 });
    expect(fitAspect({ x: 0, y: 0, ...size }, 16 / 9)).toEqual({
      x: 0,
      y: 15, // (200 − 169) / 2, rounded down
      width: 300,
      height: 169,
    });
    expect(fitAspect({ x: 10, y: 10, width: 100, height: 100 }, 3 / 4)).toEqual({
      x: 22,
      y: 10,
      width: 75,
      height: 100,
    });
  });

  it("the linked side keeps the ratio, rounded, at least 1", () => {
    expect(linkedSide(320, 640, 480)).toBe(240);
    expect(linkedSide(100, 300, 200)).toBe(67);
    expect(linkedSide(1, 1000, 1)).toBe(1);
  });
});
