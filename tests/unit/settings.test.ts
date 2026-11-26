import { describe, expect, it } from "vitest";
import {
  defaultFormat,
  defaultSettings,
  toImageEdits,
  toOptimizeSettings as check,
  type EditFrame,
} from "../../src/features/settings/settings";
import type { ImageSettings } from "../../src/types/image";

const base = (patch: Partial<ImageSettings> = {}): ImageSettings => ({
  ...defaultSettings({ format: "jpeg", hasAlpha: false }),
  ...patch,
});
const kb = (text: string) => ({ text, unit: "KB" as const });
/** A 4000 × 3000 image with no edits. */
const frame: EditFrame = { edited: { width: 4000, height: 3000 }, exact: null };
const toOptimizeSettings = (settings: ImageSettings, hasAlpha: boolean) =>
  check(settings, hasAlpha, frame);

describe("default settings (Q2, Q3)", () => {
  it("starts in Maximum mode with no size, nothing allowed", () => {
    expect(defaultSettings({ format: "png", hasAlpha: true })).toEqual({
      mode: "maximum",
      size: { text: "", unit: "KB" },
      min: { text: "", unit: "KB" },
      format: "image/png",
      minQuality: "",
      allowDimensionReduction: false,
      allowColorReduction: false,
      background: null,
      resize: { width: "", height: "", keepAspect: true },
      minSize: { width: "", height: "" },
    });
  });

  it("keeps JPEG/PNG/WebP; others become JPEG, or WebP when transparent", () => {
    expect(defaultFormat({ format: "jpeg", hasAlpha: false })).toBe("image/jpeg");
    expect(defaultFormat({ format: "png", hasAlpha: false })).toBe("image/png");
    expect(defaultFormat({ format: "webp", hasAlpha: true })).toBe("image/webp");
    for (const format of ["heic", "avif", "gif", "bmp"] as const) {
      expect(defaultFormat({ format, hasAlpha: false })).toBe("image/jpeg");
      expect(defaultFormat({ format, hasAlpha: true })).toBe("image/webp");
    }
  });
});

describe("toOptimizeSettings", () => {
  it("Maximum, Target and Range goals in bytes (KB and MB, decimal)", () => {
    expect(toOptimizeSettings(base({ size: kb("500") }), false)).toMatchObject({
      ok: true,
      settings: { goal: { mode: "maximum", maxBytes: 500_000 } },
    });
    expect(
      toOptimizeSettings(base({ mode: "target", size: { text: "1.5", unit: "MB" } }), false),
    ).toMatchObject({ ok: true, settings: { goal: { mode: "target", targetBytes: 1_500_000 } } });
    expect(
      toOptimizeSettings(base({ mode: "range", min: kb("200"), size: kb("300") }), false),
    ).toMatchObject({
      ok: true,
      settings: { goal: { mode: "range", minBytes: 200_000, maxBytes: 300_000 } },
    });
  });

  it("the full engine settings for a plain JPEG", () => {
    expect(toOptimizeSettings(base({ size: kb("500") }), false)).toEqual({
      ok: true,
      outputSize: { width: 4000, height: 3000 },
      settings: {
        goal: { mode: "maximum", maxBytes: 500_000 },
        format: "image/jpeg",
        minQuality: null,
        allowDimensionReduction: false,
        minDimensions: null,
        allowColorReduction: false,
        background: null,
      },
    });
  });

  it("size errors from parseSize, incl. the D16 limits", () => {
    const errorFor = (text: string, unit: "KB" | "MB" = "KB") => {
      const check = toOptimizeSettings(base({ size: { text, unit } }), false);
      return check.ok ? null : check.errors.size;
    };
    expect(errorFor("")).toBe("empty");
    expect(errorFor("abc")).toBe("not_a_number");
    expect(errorFor("-5")).toBe("not_positive");
    expect(errorFor("0.5")).toBe("too_small");
    expect(errorFor("1001", "MB")).toBe("too_large");
    expect(errorFor("1")).toBeNull();
    expect(errorFor("1000", "MB")).toBeNull();
  });

  it("Range: the minimum must be below the maximum; Maximum ignores the minimum field", () => {
    const range = (min: string, max: string) =>
      toOptimizeSettings(base({ mode: "range", min: kb(min), size: kb(max) }), false);
    expect(range("300", "300")).toEqual({ ok: false, errors: { min: "min_not_below_max" } });
    expect(range("400", "300")).toEqual({ ok: false, errors: { min: "min_not_below_max" } });
    expect(range("", "300")).toEqual({ ok: false, errors: { min: "empty" } });
    expect(toOptimizeSettings(base({ min: kb("x"), size: kb("300") }), false).ok).toBe(true);
  });

  it("minimum quality: empty = none, 1–100 whole numbers only", () => {
    const q = (minQuality: string) =>
      toOptimizeSettings(base({ size: kb("500"), minQuality }), false);
    expect(q("")).toMatchObject({ ok: true, settings: { minQuality: null } });
    expect(q(" 60 ")).toMatchObject({ ok: true, settings: { minQuality: 60 } });
    expect(q("1")).toMatchObject({ ok: true, settings: { minQuality: 1 } });
    expect(q("100")).toMatchObject({ ok: true, settings: { minQuality: 100 } });
    for (const bad of ["0", "101", "50.5", "abc", "-1"]) {
      expect(q(bad)).toEqual({ ok: false, errors: { minQuality: "invalid" } });
    }
  });

  it("PNG ignores minimum quality; colour reduction only applies to PNG", () => {
    expect(
      toOptimizeSettings(
        base({
          format: "image/png",
          size: kb("500"),
          minQuality: "abc",
          allowColorReduction: true,
        }),
        false,
      ),
    ).toMatchObject({ ok: true, settings: { minQuality: null, allowColorReduction: true } });
    expect(
      toOptimizeSettings(base({ size: kb("500"), allowColorReduction: true }), false),
    ).toMatchObject({ ok: true, settings: { allowColorReduction: false } });
  });

  it("transparent source → JPEG needs a fill colour; PNG/WebP keep transparency", () => {
    expect(toOptimizeSettings(base({ size: kb("500") }), true)).toEqual({
      ok: false,
      errors: { background: "required" },
    });
    expect(
      toOptimizeSettings(base({ size: kb("500"), background: "#ffffff" }), true),
    ).toMatchObject({ ok: true, settings: { background: "#ffffff" } });
    // A background chosen earlier isn't sent for an opaque source or a format with alpha.
    expect(
      toOptimizeSettings(base({ size: kb("500"), background: "#ffffff" }), false),
    ).toMatchObject({ ok: true, settings: { background: null } });
    expect(
      toOptimizeSettings(
        base({ format: "image/webp", size: kb("500"), background: "#ffffff" }),
        true,
      ),
    ).toMatchObject({ ok: true, settings: { background: null } });
  });

  it("smaller dimensions only when allowed, never with a minimum yet (M4)", () => {
    expect(
      toOptimizeSettings(base({ size: kb("500"), allowDimensionReduction: true }), false),
    ).toMatchObject({ ok: true, settings: { allowDimensionReduction: true, minDimensions: null } });
  });
});

describe("output size and minimum size (M4)", () => {
  const sized = (patch: Partial<ImageSettings>) => base({ size: kb("500"), ...patch });
  const resize = (width: string, height: string, keepAspect = true) => ({
    resize: { width, height, keepAspect },
  });

  it("no resize keeps the edited size; both sides typed are used as they are", () => {
    expect(toOptimizeSettings(sized({}), false)).toMatchObject({
      ok: true,
      outputSize: { width: 4000, height: 3000 },
    });
    expect(toOptimizeSettings(sized(resize("1000", "500")), false)).toMatchObject({
      ok: true,
      outputSize: { width: 1000, height: 500 },
    });
  });

  it("keep aspect ratio fills a missing side; without it, one side alone is refused", () => {
    expect(toOptimizeSettings(sized(resize("1000", "")), false)).toMatchObject({
      outputSize: { width: 1000, height: 750 },
    });
    expect(toOptimizeSettings(sized(resize("", "300")), false)).toMatchObject({
      outputSize: { width: 400, height: 300 },
    });
    expect(toOptimizeSettings(sized(resize("1000", "", false)), false)).toEqual({
      ok: false,
      errors: { resize: "invalid" },
    });
  });

  it("never enlarges, and only whole pixels ≥ 1", () => {
    expect(toOptimizeSettings(sized(resize("4001", "3000")), false)).toEqual({
      ok: false,
      errors: { resize: "too_large" },
    });
    for (const bad of ["0", "-5", "10.5", "abc"]) {
      expect(toOptimizeSettings(sized(resize(bad, "100")), false)).toEqual({
        ok: false,
        errors: { resize: "invalid" },
      });
    }
  });

  it("an Exact size wins over the resize fields, and can't be larger than the edited size", () => {
    const exact = (width: number, height: number) =>
      check(sized(resize("10", "10")), false, { ...frame, exact: { width, height } });
    expect(exact(600, 800)).toMatchObject({ ok: true, outputSize: { width: 600, height: 800 } });
    expect(exact(4001, 10)).toEqual({ ok: false, errors: { resize: "too_large" } });
  });

  it("the edited size (crop + rotate) is the limit", () => {
    const rotated: EditFrame = { edited: { width: 3000, height: 4000 }, exact: null };
    expect(check(sized(resize("3000", "4000")), false, rotated)).toMatchObject({ ok: true });
    expect(check(sized(resize("4000", "3000")), false, rotated)).toEqual({
      ok: false,
      errors: { resize: "too_large" },
    });
  });

  it("minimum size only with 'Allow smaller dimensions'; a missing side means no minimum there", () => {
    const allowed = (width: string, height: string) =>
      sized({ allowDimensionReduction: true, minSize: { width, height } });
    expect(
      toOptimizeSettings(sized({ minSize: { width: "800", height: "600" } }), false),
    ).toMatchObject({ ok: true, settings: { minDimensions: null } });
    expect(toOptimizeSettings(allowed("800", "600"), false)).toMatchObject({
      ok: true,
      settings: { allowDimensionReduction: true, minDimensions: { width: 800, height: 600 } },
    });
    expect(toOptimizeSettings(allowed("800", ""), false)).toMatchObject({
      settings: { minDimensions: { width: 800, height: 1 } },
    });
    expect(toOptimizeSettings(allowed("", ""), false)).toMatchObject({
      settings: { minDimensions: null },
    });
    expect(toOptimizeSettings(allowed("x", ""), false)).toEqual({
      ok: false,
      errors: { minSize: "invalid" },
    });
    // Not above the output size.
    expect(toOptimizeSettings({ ...allowed("2000", ""), ...resize("1000", "") }, false)).toEqual({
      ok: false,
      errors: { minSize: "too_large" },
    });
  });

  it("engine edits: resize only when the output differs from the edited size", () => {
    const edits = {
      crop: { x: 1, y: 2, width: 30, height: 20 },
      rotation: 90 as const,
      ratio: "free" as const,
      portrait: false,
      exact: null,
    };
    expect(toImageEdits(edits, { width: 20, height: 30 }, { width: 20, height: 30 })).toEqual({
      crop: edits.crop,
      rotation: 90,
      resize: null,
    });
    expect(toImageEdits(edits, { width: 20, height: 30 }, { width: 10, height: 15 })).toEqual({
      crop: edits.crop,
      rotation: 90,
      resize: { width: 10, height: 15 },
    });
  });
});
