import { describe, expect, it } from "vitest";
import {
  classifyTarget,
  closeBand,
  displayBand,
  isValidRange,
  metTolerance,
  percentFromTarget,
  pickTargetCandidates,
} from "../../src/engine/policy";

const c = (bytes: number) => ({ bytes });

describe("tolerances (D5, close = 10%)", () => {
  it("met tolerance is max(2% of target, 5,000 B)", () => {
    expect(metTolerance(1_000_000)).toBe(20_000);
    expect(metTolerance(100_000)).toBe(5_000);
    expect(metTolerance(200_000)).toBe(5_000);
  });

  it("close band is 10% and the display band has a 5,000 B floor", () => {
    expect(closeBand(1_000_000)).toBe(100_000);
    expect(displayBand(1_000_000)).toBe(100_000);
    expect(displayBand(40_000)).toBe(5_000);
  });

  it("classifies against the target", () => {
    expect(classifyTarget(1_020_000, 1_000_000)).toBe("met");
    expect(classifyTarget(980_000, 1_000_000)).toBe("met");
    expect(classifyTarget(1_020_001, 1_000_000)).toBe("close");
    expect(classifyTarget(900_000, 1_000_000)).toBe("close");
    expect(classifyTarget(899_999, 1_000_000)).toBe("unreachable");
    expect(classifyTarget(1_100_001, 1_000_000)).toBe("unreachable");
  });

  it("reports whole-percent distance", () => {
    expect(percentFromTarget(1_150_000, 1_000_000)).toBe(15);
    expect(percentFromTarget(750_000, 1_000_000)).toBe(25);
  });
});

describe("pickTargetCandidates (D14)", () => {
  const T = 1_000_000;

  it("case A: both in the band → both shown, nearer preselected", () => {
    const pick = pickTargetCandidates(c(950_000), c(1_030_000), T);
    expect(pick.case).toBe("both");
    expect(pick.shown.map((x) => x.bytes)).toEqual([950_000, 1_030_000]);
    expect(pick.selected).toBe(1);
    expect(pick.outcome).toBe("close");
  });

  it("case A: shows the second candidate even when one already meets the target", () => {
    const pick = pickTargetCandidates(c(998_000), c(1_060_000), T);
    expect(pick.shown).toHaveLength(2);
    expect(pick.selected).toBe(0);
    expect(pick.outcome).toBe("met");
  });

  it("case A: equally near → the one below is preselected", () => {
    const pick = pickTargetCandidates(c(960_000), c(1_040_000), T);
    expect(pick.selected).toBe(0);
  });

  it("case B: only the one below is in the band → only that one", () => {
    const pick = pickTargetCandidates(c(950_000), c(1_150_000), T);
    expect(pick.case).toBe("one");
    expect(pick.shown.map((x) => x.bytes)).toEqual([950_000]);
    expect(pick.outcome).toBe("close");
  });

  it("case B′: only the one above is in the band → only that one", () => {
    const pick = pickTargetCandidates(c(700_000), c(1_050_000), T);
    expect(pick.shown.map((x) => x.bytes)).toEqual([1_050_000]);
    expect(pick.selected).toBe(0);
  });

  it("case C: neither in the band → the single nearest, unreachable", () => {
    const pick = pickTargetCandidates(null, c(1_150_000), T);
    expect(pick).toMatchObject({ case: "nearest", outcome: "unreachable", selected: 0 });
    expect(pick.shown.map((x) => x.bytes)).toEqual([1_150_000]);

    const both = pickTargetCandidates(c(800_000), c(1_150_000), T);
    expect(both.shown.map((x) => x.bytes)).toEqual([1_150_000]);
  });

  it("case C: owner's example, 15% and 25% above → 15% above is shown", () => {
    // Only the smallest file above the target is passed in; the 25% one is never "above".
    const pick = pickTargetCandidates(null, c(1_150_000), T);
    expect(pick.shown[0]?.bytes).toBe(1_150_000);
  });

  it("case C: image too small even at the highest quality → nearest below, no upscaling", () => {
    const pick = pickTargetCandidates(c(600_000), null, T);
    expect(pick).toMatchObject({ case: "nearest", outcome: "unreachable" });
    expect(pick.shown[0]?.bytes).toBe(600_000);
  });

  it("case C tie → below", () => {
    const pick = pickTargetCandidates(c(800_000), c(1_200_000), T);
    expect(pick.shown[0]?.bytes).toBe(800_000);
  });

  it("targets under 50 KB keep 'met' results visible (5,000 B floor)", () => {
    // 10% of 40 KB is 4,000 B, but 44,500 B is within the D5 tolerance (5,000 B).
    const pick = pickTargetCandidates(null, c(44_500), 40_000);
    expect(pick).toMatchObject({ case: "one", outcome: "met" });
  });

  it("no candidates → none", () => {
    expect(pickTargetCandidates(null, null, T)).toMatchObject({ case: "none", selected: null });
  });

  it("rejects candidates on the wrong side", () => {
    expect(() => pickTargetCandidates(c(T + 1), null, T)).toThrow(RangeError);
    expect(() => pickTargetCandidates(null, c(T), T)).toThrow(RangeError);
  });
});

describe("Range validation (D7)", () => {
  it("requires 0 < min < max", () => {
    expect(isValidRange(100, 200)).toBe(true);
    expect(isValidRange(200, 200)).toBe(false);
    expect(isValidRange(300, 200)).toBe(false);
    expect(isValidRange(0, 200)).toBe(false);
    expect(isValidRange(-1, 200)).toBe(false);
  });
});
