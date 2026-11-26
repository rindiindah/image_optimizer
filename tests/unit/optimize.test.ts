import { describe, expect, it } from "vitest";
import {
  InvalidSettingsError,
  MAX_ENCODES_PER_PHASE,
  stopMargin,
  optimize,
  type OptimizeInput,
} from "../../src/engine/optimize";
import type { OptimizeSettings, SizeGoal } from "../../src/types/engine";
import {
  createFakeEncoder,
  exponentialSizes,
  type FakeEncoderOptions,
} from "./helpers/fake-encoder";

const SOURCE = { width: 4000, height: 3000 };

function settings(goal: SizeGoal, overrides: Partial<OptimizeSettings> = {}): OptimizeSettings {
  return {
    goal,
    format: "image/jpeg",
    minQuality: null,
    allowDimensionReduction: false,
    minDimensions: null,
    allowColorReduction: false,
    background: null,
    ...overrides,
  };
}

function run(
  encoderOptions: FakeEncoderOptions,
  s: OptimizeSettings,
  extra: Partial<OptimizeInput<string>> = {},
) {
  const encoder = createFakeEncoder({ source: SOURCE, ...encoderOptions });
  const promise = optimize({
    encoder,
    source: SOURCE,
    sourceBytes: 10_000_000,
    settings: s,
    signal: new AbortController().signal,
    ...extra,
  });
  return { encoder, promise };
}

// 1 → 50 KB, 100 → 5 MB at 4000×3000.
const photo = exponentialSizes(50_000, 5_000_000);

describe("Maximum mode", () => {
  it("finds the highest quality at or under the limit, within the budget", async () => {
    const { encoder, promise } = run(
      { sizeAt: photo },
      settings({ mode: "maximum", maxBytes: 1_000_000 }),
    );
    const result = await promise;
    expect(result.outcome).toBe("met");
    expect(result.candidates).toHaveLength(1);
    const best = result.candidates[0];
    expect(best?.bytes).toBeLessThanOrEqual(1_000_000);
    // The next quality up must be over the limit (or the search stopped within stopMargin).
    expect(photo((best?.quality ?? 0) + 1) > 1_000_000 || (best?.bytes ?? 0) >= 980_000).toBe(true);
    expect(encoder.calls.length).toBeLessThanOrEqual(MAX_ENCODES_PER_PHASE);
    expect(result.attempts).toBe(encoder.calls.length);
    expect(result.selected).toBe(0);
  });

  it("returns the top quality when it already fits", async () => {
    const { promise } = run({ sizeAt: photo }, settings({ mode: "maximum", maxBytes: 9_000_000 }));
    const result = await promise;
    expect(result.candidates[0]?.quality).toBe(100);
  });

  it("never reports success over the limit and gives no file when nothing fits", async () => {
    const { promise } = run({ sizeAt: photo }, settings({ mode: "maximum", maxBytes: 10_000 }));
    const result = await promise;
    expect(result.outcome).toBe("unreachable");
    expect(result.candidates).toEqual([]);
    expect(result.selected).toBeNull();
    expect(result.closest?.bytes).toBe(photo(1));
  });

  it("keeps the best candidate seen, not the last one (non-monotonic sizes)", async () => {
    // Sizes jump around: q=90 is smaller than q=80.
    const table: Record<number, number> = {
      1: 100_000,
      75: 900_000,
      76: 1_200_000,
      100: 3_000_000,
    };
    const sizeAt = (q: number | null) =>
      table[q ?? 100] ?? (q !== null && q > 75 ? 1_500_000 : 800_000);
    const { promise } = run({ sizeAt }, settings({ mode: "maximum", maxBytes: 1_000_000 }));
    const result = await promise;
    expect(result.outcome).toBe("met");
    expect(result.candidates[0]?.bytes).toBeLessThanOrEqual(1_000_000);
    expect(result.candidates[0]?.quality).toBe(75);
  });

  it("respects the minimum quality and flags quality_floor_reached", async () => {
    const { encoder, promise } = run(
      { sizeAt: photo },
      settings({ mode: "maximum", maxBytes: 200_000 }, { minQuality: 60 }),
    );
    const result = await promise;
    expect(encoder.calls.every((c) => (c.quality ?? 100) >= 60)).toBe(true);
    expect(result.outcome).toBe("unreachable");
    expect(result.closest?.flags).toContain("quality_floor_reached");
  });

  it("encodes once for encoders without a quality setting (lossless PNG)", async () => {
    const { encoder, promise } = run(
      { sizeAt: () => 400_000, qualityRange: null, mime: "image/png" },
      settings({ mode: "maximum", maxBytes: 500_000 }, { format: "image/png" }),
    );
    const result = await promise;
    expect(encoder.calls).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      bytes: 400_000,
      quality: null,
      mime: "image/png",
    });
  });

  it("passes encoder flags through and flags larger_than_source", async () => {
    const { promise } = run(
      { sizeAt: () => 12_000_000, qualityRange: null, flags: ["format_fallback"] },
      settings({ mode: "maximum", maxBytes: 20_000_000 }),
    );
    const result = await promise;
    expect(result.candidates[0]?.flags).toEqual(
      expect.arrayContaining(["format_fallback", "larger_than_source"]),
    );
  });
});

describe("Phase 2: dimension reduction", () => {
  it("never reduces dimensions without permission", async () => {
    const { encoder, promise } = run(
      { sizeAt: photo },
      settings({ mode: "maximum", maxBytes: 20_000 }),
    );
    await promise;
    expect(encoder.calls.every((c) => c.width === SOURCE.width && c.height === SOURCE.height)).toBe(
      true,
    );
  });

  it("reduces dimensions with permission, flags it, and never enlarges", async () => {
    const { encoder, promise } = run(
      { sizeAt: photo },
      settings({ mode: "maximum", maxBytes: 20_000 }, { allowDimensionReduction: true }),
    );
    const result = await promise;
    expect(result.outcome).toBe("met");
    const best = result.candidates[0];
    expect(best?.flags).toContain("dimensions_reduced");
    expect(best?.width).toBeLessThan(SOURCE.width);
    expect(encoder.calls.every((c) => c.width <= SOURCE.width && c.height <= SOURCE.height)).toBe(
      true,
    );
    // Aspect ratio is kept (within rounding).
    expect(Math.abs((best?.width ?? 0) / (best?.height ?? 1) - 4 / 3)).toBeLessThan(0.01);
  });

  it("never goes below the user's minimum dimensions and stops after at most 3 rounds", async () => {
    const minDimensions = { width: 3000, height: 2250 };
    const { encoder, promise } = run(
      { sizeAt: photo },
      settings(
        { mode: "maximum", maxBytes: 1_000 },
        { allowDimensionReduction: true, minDimensions },
      ),
    );
    const result = await promise;
    expect(result.outcome).toBe("unreachable");
    expect(encoder.calls.every((c) => c.width >= 3000 && c.height >= 2250)).toBe(true);
    const sizes = new Set(encoder.calls.map((c) => `${String(c.width)}x${String(c.height)}`));
    expect(sizes.size).toBeLessThanOrEqual(4);
  });
});

describe("Range mode (D7, D13)", () => {
  it("finds the highest quality inside the range", async () => {
    const { promise } = run(
      { sizeAt: photo },
      settings({ mode: "range", minBytes: 500_000, maxBytes: 1_000_000 }),
    );
    const result = await promise;
    expect(result.outcome).toBe("met");
    const bytes = result.candidates[0]?.bytes ?? 0;
    expect(bytes).toBeGreaterThanOrEqual(500_000);
    expect(bytes).toBeLessThanOrEqual(1_000_000);
  });

  it("D13: below the minimum even at the highest quality → unreachable, no file, no upscaling", async () => {
    const { encoder, promise } = run(
      { sizeAt: exponentialSizes(10_000, 300_000) },
      settings(
        { mode: "range", minBytes: 500_000, maxBytes: 1_000_000 },
        { allowDimensionReduction: true },
      ),
    );
    const result = await promise;
    expect(result.outcome).toBe("unreachable");
    expect(result.candidates).toEqual([]);
    expect(result.closest?.bytes).toBe(300_000);
    expect(encoder.calls.every((c) => c.width === SOURCE.width)).toBe(true);
  });

  it("rejects min ≥ max", async () => {
    const { promise } = run(
      { sizeAt: photo },
      settings({ mode: "range", minBytes: 1_000_000, maxBytes: 1_000_000 }),
    );
    await expect(promise).rejects.toBeInstanceOf(InvalidSettingsError);
  });
});

describe("Target mode (D14)", () => {
  it("returns one candidate on each side when both are in the band", async () => {
    const { promise } = run(
      { sizeAt: photo },
      settings({ mode: "target", targetBytes: 1_000_000 }),
    );
    const result = await promise;
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    for (const candidate of result.candidates) {
      expect(Math.abs(candidate.bytes - 1_000_000)).toBeLessThanOrEqual(100_000);
    }
    if (result.candidates.length === 2) {
      expect(result.candidates[0]?.side).toBe("below");
      expect(result.candidates[1]?.side).toBe("above");
    }
    expect(["met", "close"]).toContain(result.outcome);
  });

  it("case C: only files far above the target → the nearest one, unreachable, still a file", async () => {
    // Coarse encoder: only two sizes exist, both far above the target.
    const sizeAt = (q: number | null) => ((q ?? 100) < 50 ? 1_150_000 : 1_250_000);
    const { promise } = run({ sizeAt }, settings({ mode: "target", targetBytes: 1_000_000 }));
    const result = await promise;
    expect(result.outcome).toBe("unreachable");
    expect(result.candidates.map((c) => c.bytes)).toEqual([1_150_000]);
    expect(result.selected).toBe(0);
  });

  it("case C: image too small even at the highest quality → nearest below, no upscaling", async () => {
    const { encoder, promise } = run(
      { sizeAt: exponentialSizes(10_000, 600_000) },
      settings({ mode: "target", targetBytes: 1_000_000 }, { allowDimensionReduction: true }),
    );
    const result = await promise;
    expect(result.outcome).toBe("unreachable");
    expect(result.candidates.map((c) => c.bytes)).toEqual([600_000]);
    expect(encoder.calls.every((c) => c.width === SOURCE.width)).toBe(true);
  });

  it("case B: never forces a file above the target when only the one below is close", async () => {
    // Big jump between q=70 (950 KB) and q=71 (1.3 MB).
    const sizeAt = (q: number | null) =>
      (q ?? 100) <= 70 ? 950_000 - (70 - (q ?? 0)) * 1_000 : 1_300_000;
    const { encoder, promise } = run(
      { sizeAt },
      settings({ mode: "target", targetBytes: 1_000_000 }),
    );
    const result = await promise;
    expect(result.candidates.map((c) => c.side)).toEqual(["below"]);
    // On a step-shaped curve the budget may stop short of the exact edge (950,000 B);
    // the guarantee is the best file seen below the target, inside the band.
    expect(result.candidates[0]?.bytes).toBeLessThanOrEqual(950_000);
    expect(result.candidates[0]?.bytes).toBeGreaterThanOrEqual(900_000);
    expect(result.outcome).toBe("close");
    expect(encoder.calls.length).toBeLessThanOrEqual(MAX_ENCODES_PER_PHASE);
  });
});

describe("cancellation and limits", () => {
  it("an aborted job is cancelled, never successful", async () => {
    const controller = new AbortController();
    let n = 0;
    const { promise } = run(
      {
        sizeAt: photo,
        onEncode: () => {
          n += 1;
          if (n === 2) controller.abort();
        },
      },
      settings({ mode: "maximum", maxBytes: 1_000_000 }),
      { signal: controller.signal },
    );
    const result = await promise;
    expect(result.outcome).toBe("cancelled");
    expect(result.candidates).toEqual([]);
    expect(result.selected).toBeNull();
  });

  it("stops at the time limit and uses the best result so far", async () => {
    let clock = 0;
    const { encoder, promise } = run(
      { sizeAt: photo, onEncode: () => (clock += 40_000) },
      settings({ mode: "maximum", maxBytes: 1_000_000 }),
      { now: () => clock, timeLimitMs: 60_000 },
    );
    const result = await promise;
    expect(encoder.calls.length).toBeLessThanOrEqual(2);
    expect(["met", "unreachable"]).toContain(result.outcome);
  });

  it("reports progress as attempt n of up to 8", async () => {
    const seen: number[] = [];
    const { promise } = run({ sizeAt: photo }, settings({ mode: "maximum", maxBytes: 1_000_000 }), {
      onProgress: (p) => seen.push(p.attempt) && undefined,
    });
    await promise;
    expect(seen[0]).toBe(1);
    expect(Math.max(...seen)).toBeLessThanOrEqual(MAX_ENCODES_PER_PHASE);
  });
});

describe("Maximum/Range search stop margin (D20 Q-A: a search setting, unchanged)", () => {
  it("keeps the pre-D20 margin, max(2% of the limit, 5,000 B)", () => {
    expect(stopMargin(100_000)).toBe(5_000);
    expect(stopMargin(250_000)).toBe(5_000);
    expect(stopMargin(1_000_000)).toBe(20_000);
  });

  it("stops early on a file within the margin under a small limit, still reporting it as met", async () => {
    // 96 KB fits a 100 KB limit and is within the 5,000 B margin: one encode is enough.
    const { encoder, promise } = run(
      { sizeAt: () => 96_000 },
      settings({ mode: "maximum", maxBytes: 100_000 }),
    );
    const result = await promise;
    expect(encoder.calls).toHaveLength(1);
    expect(result).toMatchObject({ outcome: "met", candidates: [{ bytes: 96_000 }] });
  });
});
