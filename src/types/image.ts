/**
 * Input image types (M2): what a file turned out to be, what we show about it, and why it
 * may have been refused. Sizes are bytes (decimal units, D4). M3 adds settings, job and result.
 */
import type { Progress } from "../engine/optimize";
import type {
  Dimensions,
  Mode,
  OptimizationResult,
  OutputFormat,
  Rect,
  Rotation,
  SizeGoal,
} from "./engine";
import type { SizeUnit } from "../utils/file-size";
import type { EngineErrorCode } from "../workers/protocol";

/** Formats accepted as input. HEIF files with HEVC images count as "heic". */
export type InputFormat = "jpeg" | "png" | "webp" | "gif" | "bmp" | "avif" | "heic";

/** Plain-language notices shown next to an image. Never errors: the image is usable. */
export type ImageNotice =
  /** GIF/BMP (or an animated file): only the first frame is used. */
  | { code: "first_frame_only" }
  /** 10-bit or higher (e.g. HDR) converted to 8-bit; matches the `hdr_tone_mapped` flag. */
  | { code: "hdr_converted" }
  /** The name's extension doesn't match the content (e.g. a PNG named `.jpg`). Q3: accepted. */
  | { code: "extension_mismatch"; extension: string };

export interface ImageMetadata {
  /** Display-safe name (see `utils/filename.ts`); always rendered as text, never as HTML. */
  name: string;
  format: InputFormat;
  /** MIME type detected from the content, not the browser's guess from the name. */
  mime: string;
  /** Lower-case extension from the name, without the dot; "" when there is none. */
  extension: string;
  sizeBytes: number;
  /** Width × height as displayed (after orientation). */
  width: number;
  height: number;
  /** At least one pixel isn't fully opaque (checked from the decoded pixels). */
  hasAlpha: boolean;
  notices: ImageNotice[];
}

/**
 * What the worker found out by decoding a file (no name: the worker never receives one).
 * The UI adds the name, extension and any `extension_mismatch` notice.
 */
export interface ImageInfo {
  format: InputFormat;
  mime: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  notices: ImageNotice[];
}

/**
 * Why a file in the list can't be used. Checked on the main thread before decoding (first four)
 * or in the worker while decoding. Codes only: no file names or image data. (Files over the
 * 50-image limit never enter the list; the status announcement reports them.)
 */
export type ImageErrorCode =
  | "empty_file"
  | "file_too_large"
  | "unsupported_format"
  | "svg_not_supported"
  | "decode_failed"
  | "megapixel_limit"
  | "blank_decode"
  | "unsupported_browser"
  /** The worker stopped while reading (e.g. the browser ran out of memory). */
  | "worker_crashed";

/** A size as the user typed it (validated by `parseSize`, D16). */
export interface SizeField {
  text: string;
  unit: SizeUnit;
}

/**
 * What the user chose for one image (M3 Q1: per image), kept as typed so the form can show it.
 * `toOptimizeSettings` (features/settings/settings.ts) turns it into the engine's settings.
 */
export interface ImageSettings {
  mode: Mode;
  /** Maximum: the limit · Range: the maximum · Target: the target. */
  size: SizeField;
  /** Range only: the minimum. */
  min: SizeField;
  format: OutputFormat;
  /** "" = no minimum quality. JPEG/WebP only. */
  minQuality: string;
  allowDimensionReduction: boolean;
  /** PNG only. Off by default (product invariant). */
  allowColorReduction: boolean;
  /** JPEG with a transparent source: the fill colour the user chose; null = not chosen yet. */
  background: string | null;
  /** Output size as typed (M4); both empty = keep the edited size. */
  resize: { width: string; height: string; keepAspect: boolean };
  /** "Allow smaller dimensions": never below this (as typed; empty = no minimum). */
  minSize: { width: string; height: string };
  /**
   * D22: when the image is unedited, keeps its format and already fits, the original file is the
   * result (pass-through). On by default; off forces a re-encode (removes photo details).
   */
  keepOriginal: boolean;
}

/** Crop editor presets (blueprint 5.3, M4 Q3/Q4). */
export type RatioPreset = "free" | "original" | "1:1" | "4:3" | "3:2" | "16:9" | "exact";

/** What the user applied in the crop editor (M4). Engine form: `ImageEdits`. */
export interface EditSettings {
  /** In source pixels after orientation, before rotation; null = whole image. */
  crop: Rect | null;
  rotation: Rotation;
  ratio: RatioPreset;
  /** 4:3 → 3:4 etc. (Q4). */
  portrait: boolean;
  /** "Exact size" (Q3): the output is exactly this size; the crop keeps its ratio. */
  exact: Dimensions | null;
}

export type ItemJob =
  | { status: "idle" }
  /** Waiting for a free slot in the batch (M6). */
  | { status: "queued" }
  | { status: "running"; progress: Progress | null }
  /** The last run failed with this engine code. */
  | { status: "error"; code: EngineErrorCode }
  /** The user cancelled it (M6); an earlier result, if any, stays as it was. */
  | { status: "cancelled" }
  /** Not started: its settings are incomplete or invalid (M6, D23 Q3). */
  | { status: "skipped" };

/** A finished run. Owns one object URL per candidate file; the store revokes them. */
export interface ItemResult {
  result: OptimizationResult;
  /** The size goal the run used (the settings on screen may have changed since). */
  goal: SizeGoal;
  files: Blob[];
  urls: string[];
  /** Index into `result.candidates` the user chose; null when there's no output file. */
  selected: number | null;
  /** A setting changed after the run: shown, but not downloadable (M3 Q8). */
  outdated: boolean;
}

/** One entry in the image list. The original `file` is never changed (product invariant). */
export interface QueueItem {
  /** Stable for the item's lifetime; never derived from the name. */
  id: string;
  file: File;
  /** Display-safe name (`utils/filename.ts`). */
  name: string;
  /** Lower-case extension from the name; "" when there is none. */
  extension: string;
  sizeBytes: number;
  status: "reading" | "ready" | "error";
  /** Notices known before decoding (e.g. `extension_mismatch`). */
  notices: ImageNotice[];
  /** Set when `status` is "ready". */
  metadata: ImageMetadata | null;
  /** Object URLs of the display-only thumbnail and preview; revoked when the item goes. */
  thumbnailUrl: string | null;
  previewUrl: string | null;
  /** Set when `status` is "error". */
  error: ImageErrorCode | null;
  /** Set (to the defaults) when the image becomes ready. */
  settings: ImageSettings | null;
  /** Set (no edits) when the image becomes ready. */
  edits: EditSettings | null;
  job: ItemJob;
  result: ItemResult | null;
}
