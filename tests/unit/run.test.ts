import { beforeEach, describe, expect, it, vi } from "vitest";
import { strings } from "../../src/content/strings";
import { cancelOptimize, optimizeImage, type Engine } from "../../src/features/process/run";
import { useQueue } from "../../src/features/queue/store";
import {
  NO_EDITS,
  type ImageEdits,
  type OptimizationResult,
  type OptimizeSettings,
} from "../../src/types/engine";
import type { QueueItem } from "../../src/types/image";
import type { ClientOutcome, OptimizeOptions } from "../../src/workers/engine-client";

const item = (id: string): QueueItem => ({
  id,
  file: new File(["x"], `${id}.jpg`),
  name: `${id}.jpg`,
  extension: "jpg",
  sizeBytes: 1,
  status: "ready",
  notices: [],
  metadata: null,
  thumbnailUrl: null,
  previewUrl: null,
  error: null,
  settings: null,
  edits: null,
  job: { status: "idle" },
  result: null,
});

const settings: OptimizeSettings = {
  goal: { mode: "maximum", maxBytes: 500_000 },
  format: "image/jpeg",
  minQuality: null,
  allowDimensionReduction: false,
  minDimensions: null,
  allowColorReduction: false,
  background: null,
};

const result: OptimizationResult = {
  mode: "maximum",
  outcome: "met",
  candidates: [
    {
      side: "below",
      bytes: 3,
      mime: "image/jpeg",
      width: 1,
      height: 1,
      quality: 80,
      outcome: "met",
      flags: [],
    },
  ],
  selected: 0,
  closest: null,
  attempts: 2,
};

/** A fake engine that waits until the test settles it, and honours the abort signal. */
function fakeEngine() {
  let finish: (outcome: ClientOutcome) => void = () => undefined;
  let options: OptimizeOptions = {};
  const optimize = vi.fn((_file: Blob, _settings: OptimizeSettings, opts: OptimizeOptions) => {
    options = opts;
    return new Promise<ClientOutcome>((resolve) => {
      finish = resolve;
      opts.signal?.addEventListener("abort", () => {
        resolve({ status: "cancelled" });
      });
    });
  });
  const engine: Engine = { optimize };
  return {
    engine,
    optimize,
    finish: (o: ClientOutcome) => {
      finish(o);
    },
    progress: () => options.onProgress,
  };
}

const createUrl = vi.fn<(blob: Blob) => string>();
const state = () => useQueue.getState();
const get = (id: string) => state().items.find((i) => i.id === id);

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  createUrl.mockReset().mockReturnValue("blob:result");
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = vi.fn();
  state().add([item("a"), item("b")]);
});

describe("optimizeImage", () => {
  it("reports progress, then stores the result with its files and goal", async () => {
    const fake = fakeEngine();
    const run = optimizeImage("a", settings, NO_EDITS, fake.engine);
    expect(get("a")?.job).toEqual({ status: "running", progress: null });

    fake.progress()?.({ phase: 1, attempt: 3, maxAttempts: 8 });
    expect(get("a")?.job).toEqual({
      status: "running",
      progress: { phase: 1, attempt: 3, maxAttempts: 8 },
    });

    const file = new Blob(["abc"], { type: "image/jpeg" });
    fake.finish({ status: "done", result, files: [file] });
    await run;
    expect(get("a")?.job).toEqual({ status: "idle" });
    expect(get("a")?.result).toEqual({
      result,
      goal: settings.goal,
      files: [file],
      urls: ["blob:result"],
      selected: 0,
      outdated: false,
    });
    expect(state().announcement).toBe(strings.process.announce.done);
  });

  it("sends the image's edits with the run (M4)", async () => {
    const fake = fakeEngine();
    const edits: ImageEdits = {
      crop: { x: 1, y: 2, width: 3, height: 4 },
      rotation: 90,
      resize: { width: 2, height: 1 },
    };
    const run = optimizeImage("a", settings, edits, fake.engine);
    expect(fake.optimize).toHaveBeenCalledWith(
      get("a")?.file,
      settings,
      expect.objectContaining({ edits }),
    );
    fake.finish({ status: "cancelled" });
    await run;
  });

  it("runs one image at a time", async () => {
    const fake = fakeEngine();
    const run = optimizeImage("a", settings, NO_EDITS, fake.engine);
    await optimizeImage("b", settings, NO_EDITS, fake.engine);
    expect(fake.optimize).toHaveBeenCalledTimes(1);
    expect(get("b")?.job).toEqual({ status: "idle" });
    fake.finish({ status: "cancelled" });
    await run;
  });

  it("cancel → back to idle, no result", async () => {
    const fake = fakeEngine();
    const run = optimizeImage("a", settings, NO_EDITS, fake.engine);
    cancelOptimize();
    await run;
    expect(get("a")?.job).toEqual({ status: "idle" });
    expect(get("a")?.result).toBeNull();
    expect(state().announcement).toBe(strings.process.announce.cancelled);
  });

  it("an engine error is stored as its code", async () => {
    const fake = fakeEngine();
    const run = optimizeImage("a", settings, NO_EDITS, fake.engine);
    fake.finish({ status: "error", code: "encode_failed" });
    await run;
    expect(get("a")?.job).toEqual({ status: "error", code: "encode_failed" });
    expect(get("a")?.result).toBeNull();
    expect(state().announcement).toBe(strings.process.announce.error);
  });

  it("an engine that throws counts as a crash", async () => {
    const engine: Engine = { optimize: () => Promise.reject(new Error("busy")) };
    await optimizeImage("a", settings, NO_EDITS, engine);
    expect(get("a")?.job).toEqual({ status: "error", code: "worker_crashed" });
  });

  it("removing the image while it runs stops the work and keeps nothing", async () => {
    const fake = fakeEngine();
    const run = optimizeImage("a", settings, NO_EDITS, fake.engine);
    state().remove("a");
    await run;
    expect(get("a")).toBeUndefined();
    expect(createUrl).not.toHaveBeenCalled();
    // The next image can run now.
    const next = fakeEngine();
    const second = optimizeImage("b", settings, NO_EDITS, next.engine);
    expect(next.optimize).toHaveBeenCalledTimes(1);
    next.finish({ status: "cancelled" });
    await second;
  });
});
