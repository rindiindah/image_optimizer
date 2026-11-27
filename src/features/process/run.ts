/**
 * Runs images through the engine (M3), with their edits (M4), as a batch (M6). Each running image
 * has its own EngineClient (separate from the one that reads added files), so one failure or
 * crash stays with that image. Which queued image starts next is decided in `batch.ts`.
 * Cancel terminates that image's worker: a cancelled job never shows a result.
 */
import {
  EngineClient,
  type ClientOutcome,
  type OptimizeOptions,
} from "../../workers/engine-client";
import type {
  ImageEdits,
  OptimizationResult,
  OptimizeSettings,
  SizeGoal,
} from "../../types/engine";
import type { QueueItem } from "../../types/image";
import { classifyTarget, fitsMaximum, fitsRange } from "../../engine/policy";
import { strings } from "../../content/strings";
import { useQueue } from "../queue/store";
import { checkItem } from "../settings/settings";
import { canStart, detectConcurrency, type BatchJob } from "./batch";

export interface Engine {
  optimize(
    file: Blob,
    settings: OptimizeSettings,
    options: OptimizeOptions,
  ): Promise<ClientOutcome>;
  dispose?(): void;
}

const fitsGoal = (goal: SizeGoal, bytes: number): boolean =>
  goal.mode === "maximum"
    ? fitsMaximum(bytes, goal.maxBytes)
    : goal.mode === "range"
      ? fitsRange(bytes, goal.minBytes, goal.maxBytes)
      : classifyTarget(bytes, goal.targetBytes) === "met";

/**
 * D22 pass-through: the original file itself is the result when "Keep the original" is on, the
 * image is unedited, the output format is its real (detected) format, it isn't a first-frame-only
 * input (animated), and its size already meets the goal. Null otherwise. Nothing is re-encoded.
 */
export function passThrough(
  item: QueueItem,
  settings: OptimizeSettings,
  edits: ImageEdits,
): OptimizationResult | null {
  const meta = item.metadata;
  const bytes = item.file.size;
  const { goal } = settings;
  if (
    !meta ||
    !item.settings?.keepOriginal ||
    edits.crop !== null ||
    edits.rotation !== 0 ||
    edits.resize !== null ||
    meta.mime !== settings.format ||
    meta.notices.some((notice) => notice.code === "first_frame_only") ||
    !fitsGoal(goal, bytes)
  ) {
    return null;
  }
  const side = goal.mode === "target" && bytes > goal.targetBytes ? "above" : "below";
  return {
    mode: goal.mode,
    outcome: "met",
    candidates: [
      {
        side,
        bytes,
        mime: meta.mime,
        width: meta.width,
        height: meta.height,
        quality: null,
        outcome: "met",
        flags: ["passthrough"],
      },
    ],
    selected: 0,
    closest: null,
    attempts: 0,
  };
}

let createEngine: () => Engine = () => new EngineClient();
let concurrency: number | null = null;
/** Clients kept for the next job while a batch goes on; disposed when it's over (frees memory). */
const free: Engine[] = [];
const running = new Map<string, { controller: AbortController; job: BatchJob }>();
/** Counts for the end-of-batch announcement. */
let tally = { started: 0, done: 0, failed: 0, cancelled: 0 };
let drained: (() => void)[] = [];

/** Tests: a fake engine and a fixed concurrency. Resets the pool. */
export function configureRunner(options: { engine?: () => Engine; concurrency?: number }): void {
  if (options.engine) createEngine = options.engine;
  if (options.concurrency !== undefined) concurrency = options.concurrency;
  free.length = 0;
}

/** Resolves once nothing is queued or running. */
export function whenIdle(): Promise<void> {
  const busy =
    running.size > 0 || useQueue.getState().items.some((item) => item.job.status === "queued");
  return busy ? new Promise((resolve) => drained.push(resolve)) : Promise.resolve();
}

const isBusy = (item: QueueItem) => item.job.status === "queued" || item.job.status === "running";

/**
 * Queues images to optimize, in list order (M6). Images that aren't ready or are already busy are
 * ignored; incomplete/invalid settings → skipped (D23 Q3). `skipUpToDate` (Optimize selected)
 * also leaves images whose result is current alone; the panel's Optimize button always re-runs.
 */
export function optimizeImages(ids: string[], { skipUpToDate = false } = {}): void {
  const queue = useQueue.getState();
  const wanted = new Set(ids);
  let queued = 0;
  let skipped = 0;
  let upToDate = 0;
  for (const item of queue.items) {
    if (!wanted.has(item.id) || item.status !== "ready" || isBusy(item)) continue;
    if (skipUpToDate && item.result && !item.result.outdated) {
      upToDate += 1;
    } else if (!checkItem(item).ok) {
      queue.skipJob(item.id);
      skipped += 1;
    } else {
      queue.queueJob(item.id);
      queued += 1;
    }
  }
  if (ids.length > 1)
    queue.announce(strings.process.announce.batchStart(queued, skipped, upToDate));
  pump();
}

/** Cancels one image: out of the queue, or its worker terminated. */
export function cancelImage(id: string): void {
  const active = running.get(id);
  if (active) active.controller.abort();
  else if (useQueue.getState().items.find((item) => item.id === id)?.job.status === "queued") {
    useQueue.getState().cancelJob(id);
    tally.cancelled += 1;
    pump();
  }
}

export function cancelAll(): void {
  for (const item of useQueue.getState().items) cancelImage(item.id);
}

function pump(): void {
  const limit = (concurrency ??= detectConcurrency());
  for (const item of useQueue.getState().items) {
    if (item.job.status !== "queued") continue;
    const meta = item.metadata;
    const job: BatchJob = {
      id: item.id,
      pixels: (meta?.width ?? 0) * (meta?.height ?? 0),
      heic: meta?.format === "heic",
    };
    const jobs = [...running.values()].map((other) => other.job);
    if (!canStart(jobs, job, limit)) break; // list order is kept: later images wait their turn
    start(item, job);
  }
  if (running.size === 0 && !useQueue.getState().items.some(isBusy)) finishBatch();
}

function finishBatch(): void {
  for (const engine of free) engine.dispose?.();
  free.length = 0;
  if (tally.started > 1) {
    const { done, failed, cancelled } = tally;
    useQueue.getState().announce(strings.process.announce.batchDone(done, failed, cancelled));
  }
  tally = { started: 0, done: 0, failed: 0, cancelled: 0 };
  const waiting = drained;
  drained = [];
  for (const resolve of waiting) resolve();
}

function start(item: QueueItem, job: BatchJob): void {
  const queue = useQueue.getState();
  const check = checkItem(item); // the settings as they are now, not when it was queued
  if (!check.ok) {
    queue.skipJob(item.id);
    return;
  }
  tally.started += 1;
  const kept = passThrough(item, check.settings, check.edits);
  if (kept) {
    queue.startJob(item.id);
    queue.finishJob(item.id, kept, check.settings.goal, [item.file]); // the original File itself
    queue.announce(strings.process.announce.done);
    tally.done += 1;
    return;
  }
  const controller = new AbortController();
  running.set(item.id, { controller, job });
  queue.startJob(item.id);
  void execute(item, check.settings, check.edits, controller).finally(() => {
    running.delete(item.id);
    pump();
  });
}

async function execute(
  item: QueueItem,
  settings: OptimizeSettings,
  edits: ImageEdits,
  controller: AbortController,
): Promise<void> {
  const { id } = item;
  // Removing the image while it runs stops the work.
  const unsubscribe = useQueue.subscribe((state) => {
    if (!state.items.some((other) => other.id === id)) controller.abort();
  });
  const engine = free.pop() ?? createEngine();
  let reusable = true;
  try {
    const outcome = await engine.optimize(item.file, settings, {
      signal: controller.signal,
      edits,
      onProgress: (progress) => {
        useQueue.getState().setProgress(id, progress);
      },
    });
    const now = useQueue.getState();
    if (outcome.status === "done") {
      const current = now.items.find((other) => other.id === id);
      // Settings or edits changed while it ran (e.g. an editor left open): outdated at once.
      const stale =
        !!current && (current.settings !== item.settings || current.edits !== item.edits);
      now.finishJob(id, outcome.result, settings.goal, outcome.files, stale);
      tally.done += 1;
    } else if (outcome.status === "error") {
      now.failJob(id, outcome.code);
      tally.failed += 1;
    } else {
      now.cancelJob(id);
      tally.cancelled += 1;
    }
    now.announce(strings.process.announce[outcome.status]);
  } catch {
    reusable = false;
    useQueue.getState().failJob(id, "worker_crashed");
    useQueue.getState().announce(strings.process.announce.error);
    tally.failed += 1;
  } finally {
    unsubscribe();
    if (reusable) free.push(engine);
    else engine.dispose?.();
  }
}
