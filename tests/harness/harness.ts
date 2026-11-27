/**
 * Test-only bridge: lets Playwright run the real engine (worker + WASM codecs) under the
 * production CSP. Exposes `window.engineHarness`; renders nothing.
 */
import { EngineClient } from "../../src/workers/engine-client";
import type {
  CropCheckReport,
  EngineHarness,
  HarnessReport,
  HarnessRun,
  HarnessSource,
  HarnessPicture,
  HeicSpikeReport,
  InspectReport,
  PixelsReport,
  RenderCheckReport,
} from "./types";

/** A photo-like test image: smooth gradients plus fine noise (compresses like a photo, not a flat graphic). */
async function generate(source: Extract<HarnessSource, { kind: "generated" }>): Promise<Blob> {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  const pattern = source.pattern ?? "photo";
  if (pattern === "flat") {
    context.fillStyle = "#3a7bd5";
    context.fillRect(0, 0, source.width, source.height);
    return canvas.convertToBlob({ type: source.type, quality: 0.95 });
  }
  if (pattern === "empty") return canvas.convertToBlob({ type: source.type }); // untouched: all zero
  if (pattern === "quadrants") {
    const halfW = Math.floor(source.width / 2);
    const halfH = Math.floor(source.height / 2);
    const fill = (colour: string, x: number, y: number, w: number, h: number) => {
      context.fillStyle = colour;
      context.fillRect(x, y, w, h);
    };
    fill("#ff0000", 0, 0, halfW, halfH);
    fill("#00ff00", halfW, 0, source.width - halfW, halfH);
    fill("#0000ff", 0, halfH, halfW, source.height - halfH);
    fill("#ffffff", halfW, halfH, source.width - halfW, source.height - halfH);
    return canvas.convertToBlob({ type: source.type, quality: 0.95 });
  }
  if (pattern === "coords") {
    const image = context.createImageData(source.width, source.height);
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1)
        image.data.set(coordColour(x, y), (y * source.width + x) * 4);
    }
    context.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: "image/png" }); // lossless, so every pixel survives
  }
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
  if (source.kind === "bytes")
    return new Blob([new Uint8Array(source.bytes)], { type: source.type });
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`fixture missing (HTTP ${String(response.status)})`);
  return response.blob();
}

/** The colour of pixel (x, y) in a "coords" image: unique for images up to 4096 × 4096. */
function coordColour(x: number, y: number): [number, number, number, number] {
  return [x & 255, y & 255, ((x >> 8) & 15) | (((y >> 8) & 15) << 4), 255];
}

async function decodePixels(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

const client = new EngineClient();
/** Output files of the last run, for the pixel checks. */
let lastFiles: Blob[] = [];

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
  // The main thread can't decode every format (HEIC in Chrome/Firefox): 0 × 0 then.
  let width = 0;
  let height = 0;
  try {
    const bitmap = await createImageBitmap(blob);
    ({ width, height } = bitmap);
    bitmap.close();
  } catch {
    // not decodable here; the worker decodes it
  }

  const started = performance.now();
  const outcome = await client.optimize(blob, spec.settings, {
    encoderPreference: spec.encoderPreference ?? "wasm",
    ...(spec.edits ? { edits: spec.edits } : {}),
  });
  lastFiles = outcome.status === "done" ? outcome.files : [];
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

async function heicSpike(url: string): Promise<HeicSpikeReport> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fixture missing (HTTP ${String(response.status)})`);
  const bytes = await response.arrayBuffer();
  const worker = new Worker(new URL("./heic-spike.worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    return await new Promise<HeicSpikeReport>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<HeicSpikeReport>) => {
        resolve(event.data);
      };
      worker.onerror = () => {
        reject(new Error("HEIC spike worker crashed"));
      };
      worker.postMessage(bytes, [bytes]);
    });
  } finally {
    worker.terminate();
  }
}

async function picture(blob: Blob): Promise<HarnessPicture> {
  const bitmap = await createImageBitmap(blob);
  const result = { size: blob.size, type: blob.type, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}

async function inspect(source: HarnessSource): Promise<InspectReport> {
  const blob = await sourceBlob(source);
  const started = performance.now();
  const outcome = await client.inspect(blob);
  const ms = Math.round(performance.now() - started);
  if (outcome.status === "cancelled") return { status: "cancelled", ms };
  if (outcome.status === "error") return { status: "error", code: outcome.code, ms };
  return {
    status: "done",
    info: outcome.info,
    thumbnail: await picture(outcome.thumbnail),
    preview: await picture(outcome.preview),
    ms,
  };
}

async function bytesOf(source: HarnessSource): Promise<number[]> {
  return [...new Uint8Array(await (await sourceBlob(source)).arrayBuffer())];
}

/** Every pixel of `out` against the "coords" source pixel it must come from (crop, then rotation). */
function compareCoords(
  out: ImageData,
  sourceSize: { width: number; height: number },
  edits: HarnessRun["edits"],
): Pick<CropCheckReport, "mismatches" | "firstMismatch"> {
  const crop = edits?.crop ?? { x: 0, y: 0, ...sourceSize };
  const rotation = edits?.rotation ?? 0;
  const cw = crop.width;
  const ch = crop.height;
  let mismatches = 0;
  let firstMismatch: CropCheckReport["firstMismatch"];
  for (let Y = 0; Y < out.height; Y += 1) {
    for (let X = 0; X < out.width; X += 1) {
      // Where output pixel (X, Y) comes from inside the crop: the inverse of the rotation.
      const [u, v] =
        rotation === 90
          ? [Y, ch - 1 - X]
          : rotation === 180
            ? [cw - 1 - X, ch - 1 - Y]
            : rotation === 270
              ? [cw - 1 - Y, X]
              : [X, Y];
      const expected = coordColour(crop.x + u, crop.y + v);
      const i = (Y * out.width + X) * 4;
      const got = [...out.data.subarray(i, i + 4)];
      if (got.some((value, k) => value !== expected[k])) {
        mismatches += 1;
        firstMismatch ??= { x: X, y: Y, got, expected };
      }
    }
  }
  return { mismatches, ...(firstMismatch ? { firstMismatch } : {}) };
}

async function cropCheck(spec: HarnessRun): Promise<CropCheckReport> {
  if (spec.source.kind !== "generated") throw new Error("cropCheck needs a generated source");
  const sourceSize = { width: spec.source.width, height: spec.source.height };
  const report = await run({ ...spec, source: { ...spec.source, pattern: "coords" } });
  const file = lastFiles[0];
  if (!file) return { report, width: 0, height: 0, mismatches: -1 };
  const out = await decodePixels(file);
  return {
    report,
    width: out.width,
    height: out.height,
    ...compareCoords(out, sourceSize, spec.edits),
  };
}

/** M5: the worker's `render` (comparison "before" at 1:1) against the "coords" source pixels. */
async function renderCheck(
  source: Extract<HarnessSource, { kind: "generated" }>,
  edits: NonNullable<HarnessRun["edits"]>,
  size: { width: number; height: number },
): Promise<RenderCheckReport> {
  const blob = await generate({ ...source, pattern: "coords" });
  const outcome = await client.render(blob, edits, size);
  if (outcome.status !== "done") {
    return {
      status: outcome.status,
      code: outcome.status === "error" ? outcome.code : undefined,
      width: 0,
      height: 0,
      mismatches: -1,
    };
  }
  const out = outcome.image;
  return {
    status: "done",
    width: out.width,
    height: out.height,
    ...compareCoords(out, { width: source.width, height: source.height }, edits),
  };
}

async function runPixels(spec: HarnessRun, points: [number, number][]): Promise<PixelsReport> {
  const report = await run(spec);
  const file = lastFiles[0];
  if (!file) return { report, width: 0, height: 0, colours: [] };
  const out = await decodePixels(file);
  const colours = points.map(([x, y]) => {
    const i = (y * out.width + x) * 4;
    return [...out.data.subarray(i, i + 4)];
  });
  return { report, width: out.width, height: out.height, colours };
}

window.engineHarness = {
  run,
  cropCheck,
  renderCheck,
  runPixels,
  runBlob,
  capabilities: () => client.capabilities(),
  heicSpike,
  inspect,
  bytesOf,
};
