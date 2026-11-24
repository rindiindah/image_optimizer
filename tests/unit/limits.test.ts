import { describe, expect, it } from "vitest";
import {
  exceedsPixelLimit,
  isFileTooLarge,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_PIXELS,
  remainingSlots,
} from "../../src/utils/limits";

describe("input limits (Q2: 100 MB, 50 files, 50 MP; decimal units)", () => {
  it("has the agreed values", () => {
    expect(MAX_FILE_BYTES).toBe(100_000_000);
    expect(MAX_FILES).toBe(50);
    expect(MAX_PIXELS).toBe(50_000_000);
  });

  it.each([
    [MAX_FILE_BYTES - 1, false],
    [MAX_FILE_BYTES, false],
    [MAX_FILE_BYTES + 1, true],
  ])("file of %d bytes too large: %s", (size, tooLarge) => {
    expect(isFileTooLarge(size)).toBe(tooLarge);
  });

  it.each([
    [8064, 6048, false], // 48.8 MP iPhone ProRAW-size HEIC
    [10_000, 5_000, false], // exactly 50 MP
    [10_000, 5_001, true],
    [7_072, 7_071, true], // 50,006,112 px
  ])("%d × %d over the pixel limit: %s", (w, h, over) => {
    expect(exceedsPixelLimit(w, h)).toBe(over);
  });

  it.each([
    [0, 50],
    [49, 1],
    [50, 0],
    [60, 0],
  ])("with %d images in the list, %d more fit", (current, left) => {
    expect(remainingSlots(current)).toBe(left);
  });
});
