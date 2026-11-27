/// <reference lib="webworker" />
/**
 * Engine worker: decode → (flatten) → optimize → transfer the kept files back.
 * Never logs image data or file names.
 */
import { InvalidSettingsError, optimize, withoutPayload } from "../engine/optimize";
import type { Candidate, Flag, OutputFormat } from "../types/engine";
import {
  CodecLoadError,
  loadJpeg,
  loadOxipng,
  loadQuantizer,
  loadWebp,
  quantizeToPng,
} from "./codecs/wasm-codecs";
import { MAX_PIXELS } from "../utils/limits";
import { applyEdits, InvalidEditsError, outputSize } from "./edit";
import { InspectError, inspectFile } from "./inspect";
import {
  DecodeError,
  decodeImage,
  encodeNative,
  hasTransparency,
  pixelsAt,
  type DecodedImage,
} from "./pixels";
import type { CodecCapability, EngineErrorCode, WorkerRequest, WorkerResponse } from "./protocol";
import { createWorkerEncoder, ImageTooLargeError } from "./worker-encoder";

declare const self: DedicatedWorkerGlobalScope;

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

/** Decodes the file, or posts the error code and returns null. */
async function decodeOrReport(jobId: number, file: Blob): Promise<DecodedImage | null> {
  try {
    return await decodeImage(file, MAX_PIXELS);
  } catch (error) {
    post({
      type: "error",
      jobId,
      code: error instanceof DecodeError ? error.code : "decode_failed",
    });
    return null;
  }
}

async function handleOptimize(
  request: Extract<WorkerRequest, { type: "optimize" }>,
): Promise<void> {
  const { jobId, settings } = request;
  if (typeof OffscreenCanvas === "undefined") {
    post({ type: "error", jobId, code: "unsupported_browser" });
    return;
  }
  const decoded = await decodeOrReport(jobId, request.file);
  if (!decoded) return;
  const { bitmap, highBitDepth } = decoded;

  let edited: ImageBitmap = bitmap;
  try {
    // Orient (decode) → crop → rotate; the optimizer starts from the resize size (never larger).
    const size = outputSize({ width: bitmap.width, height: bitmap.height }, request.edits);
    edited = applyEdits(bitmap, request.edits);

    const baseFlags: Flag[] = highBitDepth ? ["hdr_tone_mapped"] : [];
    let background: string | null = null;
    if (settings.format === "image/jpeg" && hasTransparency(edited)) {
      // Never drop transparency without asking: the user must choose a background colour.
      if (!settings.background) {
        post({ type: "error", jobId, code: "transparency_needs_decision" });
        return;
      }
      background = settings.background;
      baseFlags.push("transparency_flattened");
    }

    const encoder = createWorkerEncoder({
      bitmap: edited,
      format: settings.format,
      allowColorReduction: settings.allowColorReduction,
      background,
      preference: request.encoderPreference,
    });

    const result = await optimize({
      encoder,
      source: size,
      sourceBytes: request.sourceBytes,
      settings,
      signal: new AbortController().signal, // hard cancel = the client terminates this worker
      baseFlags,
      onProgress: (progress) => {
        post({ type: "progress", jobId, progress });
      },
    });

    const files = result.candidates.map((c) => c.payload);
    const candidates: Candidate[] = result.candidates.map(withoutPayload);
    post({ type: "result", jobId, result: { ...result, candidates }, files }, files);
  } catch (error) {
    post({ type: "error", jobId, code: errorCode(error) });
  } finally {
    if (edited !== bitmap) edited.close();
    bitmap.close();
  }
}

/** Same decode → crop → rotate → stepped downscale as an optimize run, without encoding. */
async function handleRender(request: Extract<WorkerRequest, { type: "render" }>): Promise<void> {
  const { jobId, size } = request;
  if (typeof OffscreenCanvas === "undefined") {
    post({ type: "error", jobId, code: "unsupported_browser" });
    return;
  }
  const decoded = await decodeOrReport(jobId, request.file);
  if (!decoded) return;
  const { bitmap } = decoded;
  let edited: ImageBitmap = bitmap;
  try {
    edited = applyEdits(bitmap, request.edits);
    // Never enlarge, also for display.
    const ok =
      Number.isInteger(size.width) &&
      Number.isInteger(size.height) &&
      size.width >= 1 &&
      size.height >= 1 &&
      size.width <= edited.width &&
      size.height <= edited.height;
    if (!ok) throw new InvalidEditsError("size");
    const { data, width, height } = pixelsAt(edited, size, null);
    post({ type: "rendered", jobId, width, height, data: data.buffer }, [data.buffer]);
  } catch (error) {
    post({ type: "error", jobId, code: errorCode(error) });
  } finally {
    if (edited !== bitmap) edited.close();
    bitmap.close();
  }
}

async function handleInspect(request: Extract<WorkerRequest, { type: "inspect" }>): Promise<void> {
  const { jobId } = request;
  if (typeof OffscreenCanvas === "undefined") {
    post({ type: "error", jobId, code: "unsupported_browser" });
    return;
  }
  try {
    const { info, thumbnail, preview } = await inspectFile(request.file);
    post({ type: "inspected", jobId, info, thumbnail, preview }, [thumbnail.data, preview.data]);
  } catch (error) {
    post({
      type: "error",
      jobId,
      code: error instanceof InspectError ? error.code : "decode_failed",
    });
  }
}

function errorCode(error: unknown): EngineErrorCode {
  if (error instanceof InvalidSettingsError || error instanceof InvalidEditsError)
    return "invalid_settings";
  if (error instanceof ImageTooLargeError) return "image_too_large";
  return "encode_failed";
}

const FORMATS: OutputFormat[] = ["image/jpeg", "image/webp", "image/png"];

/** 1×1 test encode per codec (WASM) plus a MIME check of the native encoder. */
async function detectCapabilities(): Promise<CodecCapability[]> {
  const pixel = new ImageData(new Uint8ClampedArray([200, 100, 50, 255]), 1, 1);
  const wasmWorks = async (format: OutputFormat): Promise<boolean> => {
    try {
      if (format === "image/jpeg") return isJpeg(await (await loadJpeg())(pixel, { quality: 75 }));
      if (format === "image/webp") return isWebp(await (await loadWebp())(pixel, { quality: 75 }));
      const oxipng = await loadOxipng();
      await loadQuantizer();
      const indexed = await quantizeToPng(pixel, 90);
      return isPng(oxipng.optimise(indexed, 2, false, false));
    } catch (error) {
      if (error instanceof CodecLoadError) return false;
      return false;
    }
  };
  const nativeWorks = async (format: OutputFormat): Promise<boolean> => {
    if (typeof OffscreenCanvas === "undefined") return false;
    try {
      return (await encodeNative(pixel, format, 75)).type === format;
    } catch {
      return false;
    }
  };
  return Promise.all(
    FORMATS.map(async (format) => ({
      format,
      wasm: await wasmWorks(format),
      native: await nativeWorks(format),
    })),
  );
}

function bytesOf(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
const isJpeg = (d: ArrayBuffer | Uint8Array) => {
  const b = bytesOf(d);
  return b[0] === 0xff && b[1] === 0xd8;
};
const isPng = (d: ArrayBuffer | Uint8Array) => {
  const b = bytesOf(d);
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
};
const isWebp = (d: ArrayBuffer | Uint8Array) => {
  const b = bytesOf(d);
  return (
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  );
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "optimize") {
    void handleOptimize(request);
  } else if (request.type === "inspect") {
    void handleInspect(request);
  } else if (request.type === "render") {
    void handleRender(request);
  } else {
    void detectCapabilities().then((capabilities) => {
      post({ type: "capabilities", jobId: request.jobId, capabilities });
    });
  }
};
