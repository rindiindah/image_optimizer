/**
 * Messages between the main thread and the engine worker.
 * Privacy: messages never carry file names, and errors carry only a code.
 */
import type { Progress } from "../engine/optimize";
import type { OptimizationResult, OptimizeSettings, OutputFormat } from "../types/engine";

/** "native" forces the browser's encoder (tests, or environments without WASM). */
export type EncoderPreference = "wasm" | "native";

export type EngineErrorCode =
  /** The browser lacks a required API (OffscreenCanvas 2D in workers; Safari ≥ 16.4 has it). */
  | "unsupported_browser"
  | "decode_failed"
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
      encoderPreference: EncoderPreference;
    }
  | { type: "capabilities"; jobId: number };

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
  | { type: "error"; jobId: number; code: EngineErrorCode };
