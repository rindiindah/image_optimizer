/**
 * Runs one image through the engine (M3), with its crop/rotate/resize edits (M4). Uses its own EngineClient, separate from the one
 * that reads added files, so adding images keeps working while one is being optimized.
 * One image at a time (Q7). Cancel terminates the worker: a cancelled job never shows a result.
 */
import {
  EngineClient,
  type ClientOutcome,
  type OptimizeOptions,
} from "../../workers/engine-client";
import {
  NO_EDITS,
  type ImageEdits,
  type OptimizationResult,
  type OptimizeSettings,
  type SizeGoal,
} from "../../types/engine";
import type { QueueItem } from "../../types/image";
import { classifyTarget, fitsMaximum, fitsRange } from "../../engine/policy";
import { strings } from "../../content/strings";
import { useQueue } from "../queue/store";

export interface Engine {
  optimize(
    file: Blob,
    settings: OptimizeSettings,
    options: OptimizeOptions,
  ): Promise<ClientOutcome>;
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

let defaultEngine: EngineClient | null = null;
let current: { id: string; controller: AbortController } | null = null;

export async function optimizeImage(
  id: string,
  settings: OptimizeSettings,
  edits: ImageEdits = NO_EDITS,
  engine: Engine = (defaultEngine ??= new EngineClient()),
): Promise<void> {
  const item = useQueue.getState().items.find((other) => other.id === id);
  if (!item || current) return;
  const kept = passThrough(item, settings, edits);
  if (kept) {
    const queue = useQueue.getState();
    queue.startJob(id);
    queue.finishJob(id, kept, settings.goal, [item.file]); // the original File itself: byte-identical
    queue.announce(strings.process.announce.done);
    return;
  }
  const controller = new AbortController();
  current = { id, controller };
  const queue = useQueue.getState();
  queue.startJob(id);
  // Removing the image while it runs stops the work.
  const unsubscribe = useQueue.subscribe((state) => {
    if (!state.items.some((other) => other.id === id)) controller.abort();
  });

  try {
    const outcome = await engine.optimize(item.file, settings, {
      signal: controller.signal,
      edits,
      onProgress: (progress) => {
        useQueue.getState().setProgress(id, progress);
      },
    });
    const now = useQueue.getState();
    if (outcome.status === "done") now.finishJob(id, outcome.result, settings.goal, outcome.files);
    else if (outcome.status === "error") now.failJob(id, outcome.code);
    else now.cancelJob(id);
    now.announce(strings.process.announce[outcome.status]);
  } catch {
    useQueue.getState().failJob(id, "worker_crashed");
    useQueue.getState().announce(strings.process.announce.error);
  } finally {
    unsubscribe();
    current = null;
  }
}

export function cancelOptimize(): void {
  current?.controller.abort();
}
