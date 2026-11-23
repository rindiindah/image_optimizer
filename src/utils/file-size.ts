/**
 * Size parsing and display (decision D4).
 * - Internally everything is bytes, decimal units: 1 KB = 1,000 B, 1 MB = 1,000,000 B.
 * - Users see KB/MB only: whole KB below 1 MB, MB with 2 decimals from 1 MB.
 * - A size above a target/limit is rounded up; a size below a Range minimum is rounded down,
 *   so a displayed size never appears on the wrong side of a bound. Otherwise normal rounding.
 */

export const KB = 1_000;
export const MB = 1_000_000;

export type SizeUnit = "KB" | "MB";

/** Smallest and largest sizes a user can ask for. */
export const MIN_SIZE_BYTES = 1 * KB;
export const MAX_SIZE_BYTES = 1_000 * MB;

export type ParseSizeResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: "empty" | "not_a_number" | "not_positive" | "too_small" | "too_large" };

const NUMBER_PATTERN = /^\d+(?:\.\d+)?$|^\.\d+$/;

export function parseSize(input: string, unit: SizeUnit): ParseSizeResult {
  const text = input.trim().replace(/,/g, "");
  if (text === "") return { ok: false, reason: "empty" };
  if (text.startsWith("-")) {
    return NUMBER_PATTERN.test(text.slice(1))
      ? { ok: false, reason: "not_positive" }
      : { ok: false, reason: "not_a_number" };
  }
  if (!NUMBER_PATTERN.test(text)) return { ok: false, reason: "not_a_number" };

  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "not_a_number" };
  if (value <= 0) return { ok: false, reason: "not_positive" };

  const bytes = Math.round(value * (unit === "MB" ? MB : KB));
  if (bytes < MIN_SIZE_BYTES) return { ok: false, reason: "too_small" };
  if (bytes > MAX_SIZE_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, bytes };
}

/**
 * The bound a size is shown against.
 * - "upper": a target or a maximum. Sizes above it round up.
 * - "lower": a Range minimum. Sizes below it round down.
 */
export interface SizeBound {
  kind: "upper" | "lower";
  bytes: number;
}

type RoundingMode = "nearest" | "up" | "down";

function roundingFor(bytes: number, bound: SizeBound | undefined): RoundingMode {
  if (!bound) return "nearest";
  if (bound.kind === "upper" && bytes > bound.bytes) return "up";
  if (bound.kind === "lower" && bytes < bound.bytes) return "down";
  return "nearest";
}

/** Rounds `value / step` to an integer count of steps, using integer maths only. */
function roundSteps(value: number, step: number, mode: RoundingMode): number {
  const whole = Math.floor(value / step);
  const remainder = value - whole * step;
  if (remainder === 0) return whole;
  if (mode === "up") return whole + 1;
  if (mode === "down") return whole;
  return remainder * 2 >= step ? whole + 1 : whole;
}

const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const megabyteFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats bytes for display: "950 KB", "1,000 KB", "1.15 MB". */
export function formatSize(bytes: number, bound?: SizeBound): string {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new RangeError("formatSize expects a non-negative integer byte count");
  }
  const mode = roundingFor(bytes, bound);
  if (bytes < MB) {
    return `${integerFormat.format(roundSteps(bytes, KB, mode))} KB`;
  }
  // MB with 2 decimals = steps of 10,000 bytes.
  const hundredths = roundSteps(bytes, 10_000, mode);
  return `${megabyteFormat.format(hundredths / 100)} MB`;
}
