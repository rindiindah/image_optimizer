/**
 * Test-only bridge: lets Playwright run the real engine (worker + WASM codecs) under the
 * production CSP. Exposes `window.engineHarness`; renders nothing.
 */
import { EngineClient } from "../../src/workers/engine-client";
import type { EngineHarness, HarnessReport, HarnessRun, HarnessSource } from "./types";

/** A photo-like test image: smooth gradients plus fine noise (compresses like a photo, not a flat graphic). */
async function generate(source: Extract<HarnessSource, { kind: "generated" }>): Promise<Blob> {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  const image = context.createImageData(source.width, source.height);
  const { data } = image;
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const i = (y * source.width + x) * 4;
      const n = (random() - 0.5) * 40;
      data[i] = 128 + 100 * Math.sin(x / 37) + n;
      data[i + 1] = 128 + 100 * Math.cos(y / 23) + n;
      data[i + 2] = 128 + 80 * Math.sin((x + y) / 51) + n;
      data[i + 3] =
        source.transparent && x < source.width / 3
          ? Math.round((x / (source.width / 3)) * 255)
          : 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: source.type, quality: 0.95 });
}

async function sourceBlob(source: HarnessSource): Promise<Blob> {
  if (source.kind === "generated") return generate(source);
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`fixture missing (HTTP ${String(response.status)})`);
  return response.blob();
}

const client = new EngineClient();

async function run(spec: HarnessRun): Promise<HarnessReport> {
  return runFile(await sourceBlob(spec.source), spec);
}

function runBlob(blob: Blob): Promise<HarnessReport> {
  return runFile(blob, {
    source: { kind: "url", url: "" },
    settings: {
      goal: { mode: "maximum", maxBytes: 100_000 },
      format: "image/jpeg",
      minQuality: null,
      allowDimensionReduction: false,
      minDimensions: null,
      allowColorReduction: false,
      background: null,
    },
  });
}

async function runFile(blob: Blob, spec: HarnessRun): Promise<HarnessReport> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();

  const started = performance.now();
  const outcome = await client.optimize(blob, spec.settings, {
    encoderPreference: spec.encoderPreference ?? "wasm",
  });
  const ms = Math.round(performance.now() - started);
  const base = { sourceBytes: blob.size, sourceWidth: width, sourceHeight: height, ms };

  if (outcome.status !== "done") {
    return {
      ...base,
      status: outcome.status,
      files: [],
      ...(outcome.status === "error" ? { code: outcome.code } : {}),
    };
  }
  const files = await Promise.all(
    outcome.files.map(async (file) => ({
      size: file.size,
      type: file.type,
      head: [...new Uint8Array(await file.slice(0, 16).arrayBuffer())],
    })),
  );
  return { ...base, status: "done", result: outcome.result, files };
}

declare global {
  interface Window {
    engineHarness?: EngineHarness;
  }
}

window.engineHarness = {
  run,
  runBlob,
  capabilities: () => client.capabilities(),
};
