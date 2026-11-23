/**
 * Engine types shared by the engine, the worker and (later) the UI.
 * Rules behind them: docs/analysis/00-DECISION-ANALYSIS.md (D4, D5, D13, D14, D15).
 * All sizes are bytes (decimal units, D4).
 */

export type Mode = "maximum" | "range" | "target";

export type Outcome = "met" | "close" | "unreachable" | "failed" | "cancelled";

export type Flag =
  | "dimensions_reduced"
  | "quality_floor_reached"
  | "format_fallback"
  | "transparency_flattened"
  | "colors_reduced"
  | "larger_than_source"
  | "passthrough"
  | "hdr_tone_mapped";

export type OutputFormat = "image/jpeg" | "image/webp" | "image/png";

/** Status of a single candidate. "met"/"close" only apply to Target mode; Maximum/Range use "met". */
export type CandidateOutcome = "met" | "close" | "unreachable";

export interface Candidate {
  /** "below" = bytes ≤ target (Maximum/Range: always "below"). */
  side: "below" | "above";
  /** blob.size of the generated file, never estimated. */
  bytes: number;
  /** MIME type of the generated file (may differ from the request after a native fallback). */
  mime: string;
  width: number;
  height: number;
  /** Encoder quality used; for PNG, 100 means lossless (no colour reduction). */
  quality: number | null;
  outcome: CandidateOutcome;
  flags: Flag[];
}

export interface OptimizationResult {
  mode: Mode;
  outcome: Outcome;
  /** Target: 0–2 · Maximum/Range: 0–1. */
  candidates: Candidate[];
  /** Index into `candidates`; null when there is no output. */
  selected: number | null;
  /**
   * Maximum/Range when nothing fits: the closest file that was tried, for information only.
   * It is never offered as a download.
   */
  closest: Candidate | null;
  /** Number of encodes performed (for honest progress/reporting). */
  attempts: number;
}

export type SizeGoal =
  | { mode: "maximum"; maxBytes: number }
  | { mode: "range"; minBytes: number; maxBytes: number }
  | { mode: "target"; targetBytes: number };

export interface Dimensions {
  width: number;
  height: number;
}

export interface OptimizeSettings {
  goal: SizeGoal;
  format: OutputFormat;
  /** Minimum encoder quality (1–100). null = no minimum (default, owner decision 2026-11-18). */
  minQuality: number | null;
  /** Phase 2: reduce dimensions only when the user allowed it. */
  allowDimensionReduction: boolean;
  /** Never reduce below this size (each side). null = no user minimum. */
  minDimensions: Dimensions | null;
  /** PNG only: allow palette reduction (libimagequant). Off by default. */
  allowColorReduction: boolean;
  /**
   * JPEG only: background colour (CSS hex, e.g. "#ffffff") used to flatten transparency.
   * Required when the source has transparency and the output is JPEG.
   */
  background: string | null;
}
