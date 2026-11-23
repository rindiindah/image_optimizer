/**
 * Main-thread client for the engine worker (typed postMessage, no dependency; owner Q1).
 * One job at a time per client. Cancelling terminates the worker immediately, so a
 * cancelled job can never report success; a fresh worker is started for the next job.
 */
import type { Progress } from "../engine/optimize";
import type { OptimizationResult, OptimizeSettings } from "../types/engine";
import type {
  CodecCapability,
  EncoderPreference,
  EngineErrorCode,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

export type ClientOutcome =
  | { status: "done"; result: OptimizationResult; files: Blob[] }
  | { status: "cancelled" }
  | { status: "error"; code: EngineErrorCode };

export interface OptimizeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
  /** "native" forces the browser encoder (tests / environments without WASM). */
  encoderPreference?: EncoderPreference;
}

export class EngineClient {
  #worker: Worker | null = null;
  #nextJobId = 1;
  #busy = false;

  #getWorker(): Worker {
    this.#worker ??= new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    return this.#worker;
  }

  #terminate(): void {
    this.#worker?.terminate();
    this.#worker = null;
  }

  #run<T>(
    request: WorkerRequest,
    onMessage: (message: WorkerResponse, settle: (value: T) => void) => void,
    onCrash: () => T,
    signal?: AbortSignal,
    onAbort?: () => T,
  ): Promise<T> {
    if (this.#busy) return Promise.reject(new Error("EngineClient is busy"));
    this.#busy = true;
    const worker = this.#getWorker();

    return new Promise<T>((resolve) => {
      let settled = false;
      const settle = (value: T) => {
        if (settled) return;
        settled = true;
        this.#busy = false;
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        signal?.removeEventListener("abort", handleAbort);
        resolve(value);
      };
      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.jobId === request.jobId) onMessage(event.data, settle);
      };
      const handleError = (event: ErrorEvent) => {
        event.preventDefault();
        this.#terminate();
        settle(onCrash());
      };
      const handleAbort = () => {
        this.#terminate();
        if (onAbort) settle(onAbort());
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      signal?.addEventListener("abort", handleAbort, { once: true });

      worker.postMessage(request);
    });
  }

  optimize(
    file: Blob,
    settings: OptimizeSettings,
    options: OptimizeOptions = {},
  ): Promise<ClientOutcome> {
    const request: WorkerRequest = {
      type: "optimize",
      jobId: this.#nextJobId++,
      file,
      sourceBytes: file.size,
      settings,
      encoderPreference: options.encoderPreference ?? "wasm",
    };
    return this.#run<ClientOutcome>(
      request,
      (message, settle) => {
        if (message.type === "progress") options.onProgress?.(message.progress);
        else if (message.type === "error") settle({ status: "error", code: message.code });
        else if (message.type === "result") {
          const files = message.files.map(
            (data, i) => new Blob([data], { type: message.result.candidates[i]?.mime ?? "" }),
          );
          settle({ status: "done", result: message.result, files });
        }
      },
      () => ({ status: "error", code: "worker_crashed" }),
      options.signal,
      () => ({ status: "cancelled" }),
    );
  }

  capabilities(): Promise<CodecCapability[] | null> {
    const request: WorkerRequest = { type: "capabilities", jobId: this.#nextJobId++ };
    return this.#run<CodecCapability[] | null>(
      request,
      (message, settle) => {
        if (message.type === "capabilities") settle(message.capabilities);
      },
      () => null,
    );
  }

  dispose(): void {
    this.#terminate();
  }
}
