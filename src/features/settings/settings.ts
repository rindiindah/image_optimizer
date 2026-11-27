/**
 * Per-image settings (M3 Q1): defaults for a new image, and the check that turns what the
 * user typed into the engine's `OptimizeSettings` and the output size (M4). Pure: no UI, no I/O.
 */
import { strings } from "../../content/strings";
import type {
  Dimensions,
  ImageEdits,
  OptimizeSettings,
  OutputFormat,
  SizeGoal,
} from "../../types/engine";
import type { EditSettings, ImageMetadata, ImageSettings, QueueItem } from "../../types/image";
import { editedSize, linkedSide } from "../../utils/edits";
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
    resize: { width: "", height: "", keepAspect: true },
    minSize: { width: "", height: "" },
    keepOriginal: true,
  };
}

/** No crop, no rotation (M4). */
export function defaultEdits(): EditSettings {
  return { crop: null, rotation: 0, ratio: "free", portrait: false, exact: null };
}

export type SizeError = Exclude<ParseSizeResult, { ok: true }>["reason"];

export interface SettingsErrors {
  size?: SizeError;
  /** `min_not_below_max`: Range minimum ≥ maximum (D7). */
  min?: SizeError | "min_not_below_max";
  minQuality?: "invalid";
  /** Transparent source → JPEG without a fill colour (never dropped silently). */
  background?: "required";
  /** Output size: not whole positive pixels, or larger than the edited image (never enlarge). */
  resize?: "invalid" | "too_large";
  /** Minimum size for "Allow smaller dimensions": invalid, or larger than the output size. */
  minSize?: "invalid" | "too_large";
}

export type SettingsCheck =
  | { ok: true; settings: OptimizeSettings; outputSize: Dimensions }
  | { ok: false; errors: SettingsErrors };

/** What the edits leave: the edited size, and an "Exact size" output if one is set. */
export interface EditFrame {
  edited: Dimensions;
  exact: Dimensions | null;
}

/** "image/jpeg" → "JPEG" (also for an output whose real type differs after a fallback). */
export const formatName = (mime: string): string =>
  strings.formats[mime.slice("image/".length) as "jpeg" | "png" | "webp"];

/** Formats that have an encoder quality the user can set a minimum for. */
export const hasQuality = (format: OutputFormat): boolean => format !== "image/png";

/** Whether the user must choose a background before starting. */
export const needsBackground = (settings: ImageSettings, hasAlpha: boolean): boolean =>
  hasAlpha && settings.format === "image/jpeg";

/** "" → null; a whole number ≥ 1 → that number; anything else → NaN. */
export function parsePixels(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) && Number(t) >= 1 ? Number(t) : Number.NaN;
}

const fits = (size: Dimensions, within: Dimensions) =>
  size.width <= within.width && size.height <= within.height;

/**
 * The output size: an Exact size if set, else the typed resize (with "Keep aspect ratio" a
 * missing side follows the ratio), else the edited size. Never larger than the edited size.
 */
function outputSizeOf(
  settings: ImageSettings,
  frame: EditFrame,
): Dimensions | "invalid" | "too_large" {
  const { edited, exact } = frame;
  let size: Dimensions | null;
  if (exact) size = exact;
  else {
    const w = parsePixels(settings.resize.width);
    const h = parsePixels(settings.resize.height);
    if (w === null && h === null) size = edited;
    else if (Number.isNaN(w) || Number.isNaN(h)) size = null;
    else if (w !== null && h !== null) size = { width: w, height: h };
    else if (!settings.resize.keepAspect)
      size = null; // one side only, without the ratio
    else if (w !== null) size = { width: w, height: linkedSide(w, edited.width, edited.height) };
    else size = { width: linkedSide(h ?? 1, edited.height, edited.width), height: h ?? 1 };
  }
  if (!size) return "invalid";
  return fits(size, edited) ? size : "too_large";
}

/** Engine form of the edits for a run. */
export function toImageEdits(
  edits: EditSettings,
  edited: Dimensions,
  output: Dimensions,
): ImageEdits {
  const same = output.width === edited.width && output.height === edited.height;
  return { crop: edits.crop, rotation: edits.rotation, resize: same ? null : output };
}

export function toOptimizeSettings(
  settings: ImageSettings,
  hasAlpha: boolean,
  frame: EditFrame,
): SettingsCheck {
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

  const output = outputSizeOf(settings, frame);
  if (typeof output === "string") errors.resize = output;

  let minDimensions: Dimensions | null = null;
  if (settings.allowDimensionReduction) {
    const w = parsePixels(settings.minSize.width);
    const h = parsePixels(settings.minSize.height);
    if (Number.isNaN(w) || Number.isNaN(h)) errors.minSize = "invalid";
    else if (w !== null || h !== null) {
      minDimensions = { width: w ?? 1, height: h ?? 1 };
      if (typeof output !== "string" && !fits(minDimensions, output)) {
        errors.minSize = "too_large";
      }
    }
  }

  if (!goal || typeof output === "string" || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    outputSize: output,
    settings: {
      goal,
      format: settings.format,
      minQuality,
      allowDimensionReduction: settings.allowDimensionReduction,
      minDimensions,
      allowColorReduction: settings.format === "image/png" && settings.allowColorReduction,
      background,
    },
  };
}

export type ItemCheck =
  | { ok: true; settings: OptimizeSettings; edits: ImageEdits; outputSize: Dimensions }
  | { ok: false; errors: SettingsErrors };

/** What the edits leave for an image: its edited size and any Exact size. */
export function editFrame(item: QueueItem): EditFrame {
  const meta = item.metadata;
  const source = { width: meta?.width ?? 1, height: meta?.height ?? 1 };
  const edits = item.edits;
  return {
    edited: editedSize(source, edits ?? { crop: null, rotation: 0 }),
    exact: edits?.ratio === "exact" ? edits.exact : null,
  };
}

/**
 * The one check before a run (M6): the same rule for the panel's Optimize button and the batch.
 * Not ok for an image that isn't ready (no metadata, settings or edits yet).
 */
export function checkItem(item: QueueItem): ItemCheck {
  if (!item.metadata || !item.settings || !item.edits) return { ok: false, errors: {} };
  const frame = editFrame(item);
  const check = toOptimizeSettings(item.settings, item.metadata.hasAlpha, frame);
  if (!check.ok) return check;
  return {
    ok: true,
    settings: check.settings,
    outputSize: check.outputSize,
    edits: toImageEdits(item.edits, frame.edited, check.outputSize),
  };
}

/**
 * "Apply to selected" groups (D23 Q2). Pixel values (crop, rotation, Exact size, output W/H,
 * minimum W × H) are never in a group: they belong to one image's dimensions.
 */
export const APPLY_GROUPS = {
  size: ["mode", "size", "min"],
  format: ["format", "background"],
  more: ["minQuality", "allowDimensionReduction", "allowColorReduction", "keepOriginal"],
} as const satisfies Record<string, readonly (keyof ImageSettings)[]>;

export type ApplyGroup = keyof typeof APPLY_GROUPS;

/** The fields of `from` in the chosen groups, as a patch for another image's settings. */
export function applyPatch(from: ImageSettings, groups: ApplyGroup[]): Partial<ImageSettings> {
  const patch: Partial<Record<keyof ImageSettings, unknown>> = {};
  for (const group of groups) for (const key of APPLY_GROUPS[group]) patch[key] = from[key];
  // A source without a fill colour doesn't clear a colour the other image already chose.
  if (patch.background === null) delete patch.background;
  return patch as Partial<ImageSettings>;
}
