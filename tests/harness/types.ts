/** Types shared by the harness page and the Playwright tests (no runtime imports). */
import type { OptimizationResult, OptimizeSettings } from "../../src/types/engine";
import type { EncoderPreference } from "../../src/workers/protocol";

export type HarnessSource =
  | { kind: "url"; url: string }
  | {
      kind: "generated";
      width: number;
      height: number;
      transparent: boolean;
      type: "image/png" | "image/jpeg";
    };

export interface HarnessRun {
  source: HarnessSource;
  settings: OptimizeSettings;
  encoderPreference?: EncoderPreference;
}

export interface HarnessFile {
  size: number;
  type: string;
  /** First 16 bytes, to check the real file signature. */
  head: number[];
}

export interface HarnessReport {
  status: "done" | "cancelled" | "error";
  code?: string;
  result?: OptimizationResult;
  files: HarnessFile[];
  sourceBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  ms: number;
}

export interface EngineHarness {
  run: (spec: HarnessRun) => Promise<HarnessReport>;
  /** Runs a given file with Maximum 100 KB JPEG settings (no test-image generation needed). */
  runBlob: (blob: Blob) => Promise<HarnessReport>;
  capabilities: () => Promise<unknown>;
}
