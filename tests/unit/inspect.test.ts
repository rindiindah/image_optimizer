import { describe, expect, it } from "vitest";
import { fitWithin, PREVIEW_MAX_SIDE, THUMBNAIL_MAX_SIDE } from "../../src/workers/inspect";

describe("fitWithin (thumbnail and preview sizes, never enlarged)", () => {
  it.each([
    [{ width: 3024, height: 4032 }, THUMBNAIL_MAX_SIDE, { width: 144, height: 192 }],
    [{ width: 3024, height: 4032 }, PREVIEW_MAX_SIDE, { width: 1536, height: 2048 }],
    [{ width: 6000, height: 4000 }, PREVIEW_MAX_SIDE, { width: 2048, height: 1365 }],
    [{ width: 1280, height: 960 }, PREVIEW_MAX_SIDE, { width: 1280, height: 960 }],
    [{ width: 1, height: 1 }, THUMBNAIL_MAX_SIDE, { width: 1, height: 1 }],
    [{ width: 10_000, height: 10 }, THUMBNAIL_MAX_SIDE, { width: 192, height: 1 }],
  ])("%o within %d → %o", (size, max, expected) => {
    expect(fitWithin(size, max)).toEqual(expected);
  });
});
