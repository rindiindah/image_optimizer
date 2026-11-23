/**
 * The optimizer: searches encoder settings (and, only with permission, smaller dimensions)
 * for the best file under the user's size goal. Pure: all I/O goes through the Encoder.
 *
 * Rules: CLAUDE.md "Product invariants", D5, D13, D14, 05-weaknesses-and-gaps.md §1.
 * - Sizes are always the encoder's measured bytes.
 * - The best candidates seen are kept, not the last ones (sizes can be non-monotonic).
 * - Dimensions are never reduced without permission and never enlarged.
 */
import type {
  Candidate,
  CandidateOutcome,
  Dimensions,
  Flag,
  OptimizationResult,
  OptimizeSettings,
} from "../types/engine";
import type { EncodeOutput, Encoder } from "./encoder";
import {
  classifyTarget,
  displayBand,
  fitsMaximum,
  fitsRange,
  isValidRange,
  metTolerance,
  pickTargetCandidates,
} from "./policy";

export const MAX_ENCODES_PER_PHASE = 8;
export const MAX_REDUCTION_ROUNDS = 3;
export const TIME_LIMIT_MS = 60_000;
/** First quality tried; a common sweet spot for MozJPEG/libwebp. */
export const START_QUALITY = 75;
/** Each dimension-reduction round shrinks by at least this factor, so the search always progresses. */
const MAX_ROUND_SCALE = 0.95;
/** Aim slightly below the goal when estimating a new scale. */
const SCALE_MARGIN = 0.97;

export interface Progress {
  /** 1 = encoding search at the current size, 2 = after reducing dimensions. */
  phase: 1 | 2;
  /** Encode number within this phase. */
  attempt: number;
  maxAttempts: number;
}

export interface OptimizeInput<P> {
  encoder: Encoder<P>;
  /** Dimensions after the user's own edits (the starting point; never enlarged). */
  source: Dimensions;
  /** Size of the original file, for the "larger_than_source" flag. */
  sourceBytes: number;
  settings: OptimizeSettings;
  signal: AbortSignal;
  /** Flags that apply to every output (e.g. "transparency_flattened"). */
  baseFlags?: readonly Flag[];
  onProgress?: (progress: Progress) => void;
  now?: () => number;
  timeLimitMs?: number;
}

export interface EngineCandidate<P> extends Candidate {
  payload: P;
}

export interface EngineResult<P> extends OptimizationResult {
  candidates: EngineCandidate<P>[];
}

/** The candidate's public metadata, without the encoded file. */
export function withoutPayload<P>(candidate: EngineCandidate<P>): Candidate {
  const { side, bytes, mime, width, height, quality, outcome, flags } = candidate;
  return { side, bytes, mime, width, height, quality, outcome, flags };
}

export class InvalidSettingsError extends Error {
  override name = "InvalidSettingsError";
}

interface Sample<P> {
  quality: number | null;
  dims: Dimensions;
  reduced: boolean;
  out: EncodeOutput<P>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Optimization cancelled", "AbortError");
}

function validate(settings: OptimizeSettings, source: Dimensions): void {
  const { goal } = settings;
  const positive = (n: number) => Number.isFinite(n) && n > 0;
  if (goal.mode === "maximum" && !positive(goal.maxBytes))
    throw new InvalidSettingsError("maxBytes");
  if (goal.mode === "target" && !positive(goal.targetBytes))
    throw new InvalidSettingsError("targetBytes");
  if (goal.mode === "range" && !isValidRange(goal.minBytes, goal.maxBytes)) {
    throw new InvalidSettingsError("range");
  }
  if (settings.minQuality !== null && !(settings.minQuality >= 1 && settings.minQuality <= 100)) {
    throw new InvalidSettingsError("minQuality");
  }
  if (!(source.width >= 1 && source.height >= 1)) throw new InvalidSettingsError("source");
}

/** The size the quality search brackets: the limit (Maximum/Range) or the target. */
function thresholdOf(settings: OptimizeSettings): number {
  const { goal } = settings;
  return goal.mode === "target" ? goal.targetBytes : goal.maxBytes;
}

export async function optimize<P>(input: OptimizeInput<P>): Promise<EngineResult<P>> {
  const { encoder, source, settings, signal } = input;
  validate(settings, source);

  const now = input.now ?? (() => Date.now());
  const deadline = now() + (input.timeLimitMs ?? TIME_LIMIT_MS);
  const threshold = thresholdOf(settings);
  const samples: Sample<P>[] = [];
  let floorBlocked = false;

  const range = encoder.qualityRange;
  const floor = range
    ? Math.min(range.max, Math.max(range.min, settings.minQuality ?? range.min))
    : null;

  const encodeAt = async (
    dims: Dimensions,
    quality: number | null,
    phase: 1 | 2,
    attempt: number,
  ) => {
    throwIfAborted(signal);
    input.onProgress?.({ phase, attempt, maxAttempts: range ? MAX_ENCODES_PER_PHASE : 1 });
    const out = await encoder.encode({ width: dims.width, height: dims.height, quality }, signal);
    throwIfAborted(signal);
    const sample: Sample<P> = {
      quality,
      dims,
      reduced: dims.width < source.width || dims.height < source.height,
      out,
    };
    samples.push(sample);
    return sample;
  };

  /** Quality search at fixed dimensions. Returns the samples taken in this phase. */
  const searchAt = async (dims: Dimensions, phase: 1 | 2): Promise<Sample<P>[]> => {
    const local: Sample<P>[] = [];
    if (!range || floor === null) {
      local.push(await encodeAt(dims, null, phase, 1));
      return local;
    }
    const top = range.max;
    const fits = (s: Sample<P>) => s.out.bytes <= threshold;
    const tried = new Set<number>();
    let next: number | null = Math.min(top, Math.max(floor, START_QUALITY));
    // Safeguard: when interpolation doesn't at least halve the bracket, bisect next time.
    let previousWidth = Number.POSITIVE_INFINITY;

    while (next !== null && local.length < MAX_ENCODES_PER_PHASE) {
      tried.add(next);
      local.push(await encodeAt(dims, next, phase, local.length + 1));
      if (now() >= deadline) break;

      // Recompute the bracket from all samples (robust to non-monotonic sizes).
      let lowFit: Sample<P> | null = null;
      for (const s of local)
        if (fits(s) && (lowFit === null || (s.quality ?? 0) > (lowFit.quality ?? 0))) lowFit = s;
      let highOver: Sample<P> | null = null;
      for (const s of local) {
        if (fits(s)) continue;
        if (lowFit && (s.quality ?? 0) <= (lowFit.quality ?? 0)) continue;
        if (highOver === null || (s.quality ?? 0) < (highOver.quality ?? 0)) highOver = s;
      }

      if (lowFit?.quality === top) break; // best quality already fits
      if (!lowFit && tried.has(floor)) break; // even the lowest allowed quality is too big
      if (
        settings.goal.mode !== "target" &&
        lowFit &&
        lowFit.out.bytes >= threshold - metTolerance(threshold)
      ) {
        break; // close enough under the limit; more encodes would barely change quality
      }

      let candidate: number;
      if (!lowFit) candidate = floor;
      else if (!highOver) candidate = top;
      else {
        const lo = lowFit.quality ?? floor;
        const hi = highOver.quality ?? top;
        const width = hi - lo;
        if (width <= 1) break;
        const bisect = width > previousWidth / 2;
        previousWidth = width;
        const logLo = Math.log(Math.max(1, lowFit.out.bytes));
        const logHi = Math.log(Math.max(1, highOver.out.bytes));
        const t = bisect || logHi <= logLo ? 0.5 : (Math.log(threshold) - logLo) / (logHi - logLo);
        candidate = Math.round(lo + Math.min(1, Math.max(0, t)) * width);
        candidate = Math.min(hi - 1, Math.max(lo + 1, candidate));
      }
      next = tried.has(candidate)
        ? nearestUntried(candidate, tried, floor, top, lowFit, highOver)
        : candidate;
    }
    const floorSample = local.find((s) => s.quality === floor);
    floorBlocked = settings.minQuality !== null && floorSample !== undefined && !fits(floorSample);
    return local;
  };

  try {
    let dims: Dimensions = { width: source.width, height: source.height };
    let phaseSamples = await searchAt(dims, 1);

    let rounds = 0;
    while (
      settings.allowDimensionReduction &&
      rounds < MAX_REDUCTION_ROUNDS &&
      now() < deadline &&
      needsSmallerDimensions(phaseSamples, settings)
    ) {
      const next = reduceDimensions(dims, source, phaseSamples, threshold, settings);
      if (!next) break;
      dims = next;
      rounds += 1;
      phaseSamples = await searchAt(dims, 2);
    }
  } catch (error) {
    if (isAbortError(error)) return cancelled(settings);
    throw error;
  }

  return buildResult(samples, input, floorBlocked);
}

function nearestUntried<P>(
  wanted: number,
  tried: Set<number>,
  floor: number,
  top: number,
  lowFit: Sample<P> | null,
  highOver: Sample<P> | null,
): number | null {
  const lo = lowFit?.quality ?? floor;
  const hi = highOver?.quality ?? top;
  for (let d = 1; d <= top - floor; d += 1) {
    for (const q of [wanted - d, wanted + d]) {
      if (q > lo && q < hi && !tried.has(q)) return q;
    }
  }
  return null;
}

/** Phase 2 runs only if nothing acceptable exists at the current dimensions. */
function needsSmallerDimensions<P>(phase: Sample<P>[], settings: OptimizeSettings): boolean {
  const { goal } = settings;
  const smallest = Math.min(...phase.map((s) => s.out.bytes));
  if (goal.mode === "maximum") return !phase.some((s) => fitsMaximum(s.out.bytes, goal.maxBytes));
  if (goal.mode === "range") return smallest > goal.maxBytes;
  return smallest > goal.targetBytes + displayBand(goal.targetBytes);
}

/** Next (smaller) dimensions, or null when no further reduction is allowed. Never enlarges. */
function reduceDimensions<P>(
  current: Dimensions,
  source: Dimensions,
  phase: Sample<P>[],
  threshold: number,
  settings: OptimizeSettings,
): Dimensions | null {
  const smallest = Math.min(...phase.map((s) => s.out.bytes));
  const currentFactor = Math.min(current.width / source.width, current.height / source.height);
  const scale = Math.min(MAX_ROUND_SCALE, Math.sqrt(threshold / smallest) * SCALE_MARGIN);
  let factor = currentFactor * scale;

  const minDims = settings.minDimensions;
  const minFactor = Math.max(
    minDims ? Math.max(minDims.width / source.width, minDims.height / source.height) : 0,
    1 / Math.min(source.width, source.height),
  );
  if (factor < minFactor) factor = minFactor;
  if (factor >= currentFactor) return null; // already at the user's minimum

  const next = {
    width: Math.max(1, Math.round(source.width * factor)),
    height: Math.max(1, Math.round(source.height * factor)),
  };
  if (next.width >= current.width && next.height >= current.height) return null;
  return next;
}

function cancelled<P>(settings: OptimizeSettings): EngineResult<P> {
  return {
    mode: settings.goal.mode,
    outcome: "cancelled",
    candidates: [],
    selected: null,
    closest: null,
    attempts: 0,
  };
}

function area(d: Dimensions): number {
  return d.width * d.height;
}

/** Highest quality first; then larger dimensions; then the larger file (more detail kept). */
function compareBest<P>(a: Sample<P>, b: Sample<P>): number {
  const qa = a.quality ?? 0;
  const qb = b.quality ?? 0;
  if (qa !== qb) return qb - qa;
  if (area(a.dims) !== area(b.dims)) return area(b.dims) - area(a.dims);
  return b.out.bytes - a.out.bytes;
}

function buildResult<P>(
  samples: Sample<P>[],
  input: OptimizeInput<P>,
  floorBlocked: boolean,
): EngineResult<P> {
  const { settings, sourceBytes } = input;
  const { goal } = settings;

  const toCandidate = (s: Sample<P>, outcome: CandidateOutcome): EngineCandidate<P> => {
    const flags = new Set<Flag>([...(input.baseFlags ?? []), ...s.out.flags]);
    if (s.reduced) flags.add("dimensions_reduced");
    if (s.out.bytes > sourceBytes) flags.add("larger_than_source");
    if (floorBlocked) flags.add("quality_floor_reached");
    return {
      side: goal.mode === "target" && s.out.bytes > goal.targetBytes ? "above" : "below",
      bytes: s.out.bytes,
      mime: s.out.mime,
      width: s.dims.width,
      height: s.dims.height,
      quality: s.quality,
      outcome,
      flags: [...flags],
      payload: s.out.payload,
    };
  };
  const info = (s: Sample<P>): Candidate => withoutPayload(toCandidate(s, "unreachable"));
  const base = { mode: goal.mode, attempts: samples.length };

  if (goal.mode === "maximum" || goal.mode === "range") {
    const valid = samples.filter((s) =>
      goal.mode === "maximum"
        ? fitsMaximum(s.out.bytes, goal.maxBytes)
        : fitsRange(s.out.bytes, goal.minBytes, goal.maxBytes),
    );
    const best = [...valid].sort(compareBest)[0];
    if (best) {
      return {
        ...base,
        outcome: "met",
        candidates: [toCandidate(best, "met")],
        selected: 0,
        closest: null,
      };
    }
    const lower = goal.mode === "range" ? goal.minBytes : 0;
    const distance = (s: Sample<P>) =>
      s.out.bytes > goal.maxBytes ? s.out.bytes - goal.maxBytes : lower - s.out.bytes;
    const nearest = [...samples].sort((a, b) => distance(a) - distance(b))[0];
    return {
      ...base,
      outcome: "unreachable",
      candidates: [],
      selected: null,
      closest: nearest ? info(nearest) : null,
    };
  }

  // Target mode (D14).
  const target = goal.targetBytes;
  let below: Sample<P> | null = null;
  let above: Sample<P> | null = null;
  for (const s of samples) {
    if (s.out.bytes <= target) {
      if (
        !below ||
        s.out.bytes > below.out.bytes ||
        (s.out.bytes === below.out.bytes && compareBest(s, below) < 0)
      )
        below = s;
    } else if (
      !above ||
      s.out.bytes < above.out.bytes ||
      (s.out.bytes === above.out.bytes && compareBest(s, above) < 0)
    ) {
      above = s;
    }
  }
  const pick = pickTargetCandidates(
    below ? { bytes: below.out.bytes, sample: below } : null,
    above ? { bytes: above.out.bytes, sample: above } : null,
    target,
  );
  if (pick.outcome === null) {
    return { ...base, outcome: "failed", candidates: [], selected: null, closest: null };
  }
  const candidates = pick.shown.map(({ sample }) =>
    toCandidate(
      sample,
      pick.case === "nearest" ? "unreachable" : classifyTarget(sample.out.bytes, target),
    ),
  );
  return { ...base, outcome: pick.outcome, candidates, selected: pick.selected, closest: null };
}
