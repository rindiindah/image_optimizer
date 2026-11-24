/// <reference lib="webworker" />
/**
 * Test-only worker for the M2 Step 1 gate: decodes a HEIC file with libheif-js in a worker
 * under the production CSP and reports what came out. Not part of the app build.
 */
import { decodeHeic } from "../../src/workers/heic";
import type { HeicSpikeReport } from "./types";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  const started = performance.now();
  try {
    const { image, topLevelImages, primaryIndex } = await decodeHeic(event.data);
    const { data, width, height } = image;
    let opaque = true;
    let nonBlank = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) opaque = false;
      if (!nonBlank && (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0)) nonBlank = true;
    }
    const report: HeicSpikeReport = {
      status: "done",
      width,
      height,
      topLevelImages,
      primaryIndex,
      opaque,
      nonBlank,
      ms: Math.round(performance.now() - started),
    };
    self.postMessage(report);
  } catch (error) {
    const report: HeicSpikeReport = {
      status: "error",
      error: error instanceof Error ? error.name : "unknown",
      ms: Math.round(performance.now() - started),
    };
    self.postMessage(report);
  }
};
