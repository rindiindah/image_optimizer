/**
 * Messages between the main thread and the engine worker.
 * Privacy: messages never carry file names, and errors carry only a code.
 */
import type { Progress } from "../engine/optimize";
import type {
  Dimensions,
  ImageEdits,
  OptimizationResult,
  OptimizeSettings,
  OutputFormat,
} from "../types/engine";
import type { ImageInfo } from "../types/image";

/** "native" forces the browser's encoder (tests, or environments without WASM). */
export type EncoderPreference = "wasm" | "native";

export type EngineErrorCode =
  /** The browser lacks a required API (OffscreenCanvas 2D in workers; Safari ≥ 16.4 has it). */
  | "unsupported_browser"
  | "decode_failed"
  /** More pixels than the limit (50 MP, M2 Q2), after orientation. */
  | "megapixel_limit"
  /** The decoded image came out completely empty (how iOS fails on canvases too large for it). */
  | "blank_decode"
  | "transparency_needs_decision"
  | "invalid_settings"
  | "image_too_large"
  | "encode_failed"
  | "worker_crashed";

export type WorkerRequest =
  | {
      type: "optimize";
      jobId: number;
      file: Blob;
      sourceBytes: number;
      settings: OptimizeSettings;
      /** Crop/rotate/resize (M4), applied before optimizing. */
      edits: ImageEdits;
      encoderPreference: EncoderPreference;
    }
  | { type: "capabilities"; jobId: number }
  /**
   * The original as cropped and rotated, scaled to `size` (M5 comparison at 100 %, D22).
   * `edits.resize` is ignored: `size` is the output's real size.
   */
  | { type: "render"; jobId: number; file: Blob; edits: ImageEdits; size: Dimensions }
  /** Decode and describe an added file (M2). The worker never receives its name. */
  | { type: "inspect"; jobId: number; file: Blob };

export interface CodecCapability {
  format: OutputFormat;
  /** The WASM codec loaded and produced a valid 1×1 file. */
  wasm: boolean;
  /** The browser's own encoder produced this format (MIME checked), not something else. */
  native: boolean;
}

export type WorkerResponse =
  | { type: "progress"; jobId: number; progress: Progress }
  | {
      type: "result";
      jobId: number;
      result: OptimizationResult;
      /** One encoded file per candidate, same order. */
      files: ArrayBuffer[];
    }
  | { type: "capabilities"; jobId: number; capabilities: CodecCapability[] }
  | {
      type: "inspected";
      jobId: number;
      info: ImageInfo;
      /** Display-only images (transferred): a list thumbnail and a larger preview. */
      thumbnail: { data: ArrayBuffer; mime: string };
      preview: { data: ArrayBuffer; mime: string };
    }
  /** RGBA pixels of a `render` request (transferred). */
  | { type: "rendered"; jobId: number; width: number; height: number; data: ArrayBuffer }
  | { type: "error"; jobId: number; code: EngineErrorCode };
