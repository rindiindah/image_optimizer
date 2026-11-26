/**
 * Runs one image through the engine (M3). Uses its own EngineClient, separate from the one
 * that reads added files, so adding images keeps working while one is being optimized.
 * One image at a time (Q7). Cancel terminates the worker: a cancelled job never shows a result.
 */
import {
  EngineClient,
  type ClientOutcome,
  type OptimizeOptions,
} from "../../workers/engine-client";
import type { OptimizeSettings } from "../../types/engine";
import { strings } from "../../content/strings";
import { useQueue } from "../queue/store";

export interface Engine {
  optimize(
    file: Blob,
    settings: OptimizeSettings,
    options: OptimizeOptions,
  ): Promise<ClientOutcome>;
}

let defaultEngine: EngineClient | null = null;
let current: { id: string; controller: AbortController } | null = null;

export async function optimizeImage(
  id: string,
  settings: OptimizeSettings,
  engine: Engine = (defaultEngine ??= new EngineClient()),
): Promise<void> {
  const item = useQueue.getState().items.find((other) => other.id === id);
  if (!item || current) return;
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
