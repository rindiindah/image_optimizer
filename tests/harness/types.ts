/** Types shared by the harness page and the Playwright tests (no runtime imports). */
import type { OptimizationResult, OptimizeSettings } from "../../src/types/engine";
import type { ImageInfo } from "../../src/types/image";
import type { EncoderPreference } from "../../src/workers/protocol";

export type HarnessSource =
  | { kind: "url"; url: string }
  /** Raw bytes built by the test (e.g. a GIF), with the MIME type the browser would report. */
  | { kind: "bytes"; bytes: number[]; type: string }
  | {
      kind: "generated";
      width: number;
      height: number;
      transparent: boolean;
      type: "image/png" | "image/jpeg" | "image/webp";
      /** "photo" (default): gradients + noise · "flat": one colour (fast, tiny file) · "empty": every pixel transparent black. */
      pattern?: "photo" | "flat" | "empty";
    };

export interface HarnessPicture {
  size: number;
  type: string;
  width: number;
  height: number;
}

/** Result of `EngineClient.inspect` as seen by the test. */
export interface InspectReport {
  status: "done" | "cancelled" | "error";
  code?: string;
  info?: ImageInfo;
  thumbnail?: HarnessPicture;
  preview?: HarnessPicture;
  ms: number;
}

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

/** M2 Step 1 gate: result of decoding a HEIC file with libheif-js in a worker. */
export type HeicSpikeReport =
  | {
      status: "done";
      width: number;
      height: number;
      topLevelImages: number;
      primaryIndex: number;
      opaque: boolean;
      /** At least one pixel isn't pure black (a blank decode would be all zeros). */
      nonBlank: boolean;
      ms: number;
    }
  | { status: "error"; error: string; ms: number };

export interface EngineHarness {
  /** Decodes a fixture (URL) with libheif-js in a fresh test-only worker. */
  heicSpike: (url: string) => Promise<HeicSpikeReport>;
  /** Inspects a source with the real engine worker (M2). */
  inspect: (source: HarnessSource) => Promise<InspectReport>;
  /** The bytes of a source (e.g. a generated JPEG, to add an EXIF tag in the test). */
  bytesOf: (source: HarnessSource) => Promise<number[]>;
  run: (spec: HarnessRun) => Promise<HarnessReport>;
  /** Runs a given file with Maximum 100 KB JPEG settings (no test-image generation needed). */
  runBlob: (blob: Blob) => Promise<HarnessReport>;
  capabilities: () => Promise<unknown>;
}
