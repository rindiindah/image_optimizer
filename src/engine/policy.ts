/**
 * Pure size rules (no I/O). Decisions: D20 (met tolerance and display band, replacing D5's
 * formula), "close" = 10%, D13, D14. All values are bytes.
 */
import type { CandidateOutcome } from "../types/engine";

/** D20: |actual − target| ≤ 2% of the target counts as "met", at every target size. */
export function metTolerance(targetBytes: number): number {
  return 0.02 * targetBytes;
}

/** "Close" threshold (confirmed 2026-11-18): within 10% of the target. */
export function closeBand(targetBytes: number): number {
  return 0.1 * targetBytes;
}

/**
 * D14 display band, 10% of the target (D20). It used to have a 5,000 B floor, needed only
 * while the "met" tolerance could be wider than 10%.
 */
export function displayBand(targetBytes: number): number {
  return closeBand(targetBytes);
}

export function classifyTarget(bytes: number, targetBytes: number): CandidateOutcome {
  const distance = Math.abs(bytes - targetBytes);
  if (distance <= metTolerance(targetBytes)) return "met";
  if (distance <= closeBand(targetBytes)) return "close";
  return "unreachable";
}

/** Whole-percent distance from the target, for "15% above the target". */
export function percentFromTarget(bytes: number, targetBytes: number): number {
  return Math.round((Math.abs(bytes - targetBytes) / targetBytes) * 100);
}

export interface SidedSize {
  bytes: number;
}

export interface TargetPick<T> {
  /** Shown candidates, "below" first. */
  shown: T[];
  /** Index into `shown` of the preselected candidate; null when nothing exists. */
  selected: number | null;
  outcome: CandidateOutcome | null;
  /** "both" (case A), "one" (case B/B′), "nearest" (case C), "none" (no candidate at all). */
  case: "both" | "one" | "nearest" | "none";
}

/** Nearer of two candidates to the target; equally near → the one below (D5). */
function nearer<T extends SidedSize>(below: T, above: T, targetBytes: number): "below" | "above" {
  const dBelow = targetBytes - below.bytes;
  const dAbove = above.bytes - targetBytes;
  return dAbove < dBelow ? "above" : "below";
}

/**
 * D14: choose which Target-mode candidates to show.
 * `below` must have bytes ≤ target, `above` bytes > target (either may be missing).
 */
export function pickTargetCandidates<T extends SidedSize>(
  below: T | null,
  above: T | null,
  targetBytes: number,
): TargetPick<T> {
  if (below && below.bytes > targetBytes)
    throw new RangeError("below candidate is over the target");
  if (above && above.bytes <= targetBytes)
    throw new RangeError("above candidate is not over the target");

  const band = displayBand(targetBytes);
  // Plain booleans (not type guards): "not in band" must not narrow a candidate to null.
  const inBand = (c: T): boolean => Math.abs(c.bytes - targetBytes) <= band;
  const belowIn = below !== null && inBand(below) ? below : null;
  const aboveIn = above !== null && inBand(above) ? above : null;

  if (belowIn && aboveIn) {
    const pick = nearer(belowIn, aboveIn, targetBytes);
    const chosen = pick === "below" ? belowIn : aboveIn;
    return {
      shown: [belowIn, aboveIn],
      selected: pick === "below" ? 0 : 1,
      outcome: classifyTarget(chosen.bytes, targetBytes),
      case: "both",
    };
  }
  const only = belowIn ?? aboveIn;
  if (only) {
    return {
      shown: [only],
      selected: 0,
      outcome: classifyTarget(only.bytes, targetBytes),
      case: "one",
    };
  }

  // Case C: neither in band → the single nearest one that exists, labelled unreachable.
  let nearest: T | null;
  if (below && above) nearest = nearer(below, above, targetBytes) === "below" ? below : above;
  else nearest = below ?? above;
  if (!nearest) return { shown: [], selected: null, outcome: null, case: "none" };
  return { shown: [nearest], selected: 0, outcome: "unreachable", case: "nearest" };
}

/** D7: Range bounds must satisfy 0 < min < max. */
export function isValidRange(minBytes: number, maxBytes: number): boolean {
  return (
    Number.isFinite(minBytes) && Number.isFinite(maxBytes) && minBytes > 0 && minBytes < maxBytes
  );
}

export function fitsMaximum(bytes: number, maxBytes: number): boolean {
  return bytes <= maxBytes;
}

export function fitsRange(bytes: number, minBytes: number, maxBytes: number): boolean {
  return bytes >= minBytes && bytes <= maxBytes;
}
