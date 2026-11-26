/** Types shared by the harness page and the Playwright tests (no runtime imports). */
import type { ImageEdits, OptimizationResult, OptimizeSettings } from "../../src/types/engine";
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
      /**
       * "photo" (default): gradients + noise · "flat": one colour (fast, tiny file) · "empty": every
       * pixel transparent black · "coords": every pixel encodes its own (x, y), see `coordColour`
       * · "quadrants": four flat colours (red, green, blue, white), survives JPEG.
       */
      pattern?: "photo" | "flat" | "empty" | "coords" | "quadrants";
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
  edits?: ImageEdits;
}

/** M4 exit check: every output pixel compared with the source pixel it must come from. */
export interface CropCheckReport {
  report: HarnessReport;
  width: number;
  height: number;
  mismatches: number;
  firstMismatch?: { x: number; y: number; got: number[]; expected: number[] };
}

/** Output pixels read back at given points (for lossy formats: compare with a tolerance). */
export interface PixelsReport {
  report: HarnessReport;
  width: number;
  height: number;
  colours: number[][];
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
  /** Runs a "coords" image (must be lossless PNG settings) and checks every output pixel. */
  cropCheck: (spec: HarnessRun) => Promise<CropCheckReport>;
  /** Runs, decodes the output and returns its pixels at `points` ([x, y] in output pixels). */
  runPixels: (spec: HarnessRun, points: [number, number][]) => Promise<PixelsReport>;
  /** Runs a given file with Maximum 100 KB JPEG settings (no test-image generation needed). */
  runBlob: (blob: Blob) => Promise<HarnessReport>;
  capabilities: () => Promise<unknown>;
}
