/**
 * Per-image settings (M3 Q1): defaults for a new image, and the check that turns what the
 * user typed into the engine's `OptimizeSettings`. Pure: no UI, no I/O.
 */
import { strings } from "../../content/strings";
import type { OptimizeSettings, OutputFormat, SizeGoal } from "../../types/engine";
import type { ImageMetadata, ImageSettings } from "../../types/image";
import { parseSize, type ParseSizeResult } from "../../utils/file-size";

/** Q3: JPEG/PNG/WebP keep their format; anything else → JPEG, or WebP when transparent. */
export function defaultFormat(meta: Pick<ImageMetadata, "format" | "hasAlpha">): OutputFormat {
  if (meta.format === "jpeg") return "image/jpeg";
  if (meta.format === "png") return "image/png";
  if (meta.format === "webp") return "image/webp";
  return meta.hasAlpha ? "image/webp" : "image/jpeg";
}

/** Q2: no pre-filled size; Maximum is the default mode (D6). */
export function defaultSettings(meta: Pick<ImageMetadata, "format" | "hasAlpha">): ImageSettings {
  return {
    mode: "maximum",
    size: { text: "", unit: "KB" },
    min: { text: "", unit: "KB" },
    format: defaultFormat(meta),
    minQuality: "",
    allowDimensionReduction: false,
    allowColorReduction: false,
    background: null,
  };
}

export type SizeError = Exclude<ParseSizeResult, { ok: true }>["reason"];

export interface SettingsErrors {
  size?: SizeError;
  /** `min_not_below_max`: Range minimum ≥ maximum (D7). */
  min?: SizeError | "min_not_below_max";
  minQuality?: "invalid";
  /** Transparent source → JPEG without a fill colour (never dropped silently). */
  background?: "required";
}

export type SettingsCheck =
  { ok: true; settings: OptimizeSettings } | { ok: false; errors: SettingsErrors };

/** "image/jpeg" → "JPEG" (also for an output whose real type differs after a fallback). */
export const formatName = (mime: string): string =>
  strings.formats[mime.slice("image/".length) as "jpeg" | "png" | "webp"];

/** Formats that have an encoder quality the user can set a minimum for. */
export const hasQuality = (format: OutputFormat): boolean => format !== "image/png";

/** Whether the user must choose a background before starting. */
export const needsBackground = (settings: ImageSettings, hasAlpha: boolean): boolean =>
  hasAlpha && settings.format === "image/jpeg";

export function toOptimizeSettings(settings: ImageSettings, hasAlpha: boolean): SettingsCheck {
  const errors: SettingsErrors = {};

  const size = parseSize(settings.size.text, settings.size.unit);
  if (!size.ok) errors.size = size.reason;

  let goal: SizeGoal | null = null;
  if (size.ok) {
    if (settings.mode === "maximum") goal = { mode: "maximum", maxBytes: size.bytes };
    else if (settings.mode === "target") goal = { mode: "target", targetBytes: size.bytes };
  }
  if (settings.mode === "range") {
    const min = parseSize(settings.min.text, settings.min.unit);
    if (!min.ok) errors.min = min.reason;
    else if (size.ok && min.bytes >= size.bytes) errors.min = "min_not_below_max";
    else if (size.ok) goal = { mode: "range", minBytes: min.bytes, maxBytes: size.bytes };
  }

  let minQuality: number | null = null;
  if (hasQuality(settings.format) && settings.minQuality.trim() !== "") {
    const text = settings.minQuality.trim();
    const value = Number(text);
    if (/^\d+$/.test(text) && value >= 1 && value <= 100) minQuality = value;
    else errors.minQuality = "invalid";
  }

  const background = needsBackground(settings, hasAlpha) ? settings.background : null;
  if (needsBackground(settings, hasAlpha) && !background) errors.background = "required";

  if (!goal || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      goal,
      format: settings.format,
      minQuality,
      allowDimensionReduction: settings.allowDimensionReduction,
      minDimensions: null, // M4: a minimum width/height comes with resizing
      allowColorReduction: settings.format === "image/png" && settings.allowColorReduction,
      background,
    },
  };
}
