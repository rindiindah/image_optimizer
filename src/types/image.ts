/**
 * Input image types (M2): what a file turned out to be, what we show about it, and why it
 * may have been refused. Sizes are bytes (decimal units, D4).
 */

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
}
