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
import { readyItem } from "./helpers/items";
import { defaultSettings } from "../../src/features/settings/settings";

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

describe("pass-through (D22): the original file is kept when it already fits", () => {
  const BYTES = 400_000;
  const file = (name = "p.jpg") => new File([new Uint8Array(BYTES)], name);
  type Meta = Parameters<typeof readyItem>[2];
  const add = (meta: Meta = {}, patch: Partial<QueueItem> = {}) => {
    const it = readyItem("p", "p.jpg", { sizeBytes: BYTES, ...meta }, { file: file(), ...patch });
    state().add([it]);
    return it;
  };
  const withGoal = (
    goal: OptimizeSettings["goal"],
    format = settings.format,
  ): OptimizeSettings => ({
    ...settings,
    goal,
    format,
  });

  it("unedited, same format, fits: the original File itself, passthrough, 0 encodes, no worker", async () => {
    const original = add();
    const fake = fakeEngine();
    await optimizeImage("p", withGoal({ mode: "maximum", maxBytes: BYTES }), NO_EDITS, fake.engine);
    expect(fake.optimize).not.toHaveBeenCalled();
    const stored = get("p")?.result;
    expect(stored?.files[0]).toBe(original.file); // byte-identical: the same object
    const c = stored?.result.candidates[0];
    expect(c).toMatchObject({
      bytes: BYTES,
      mime: "image/jpeg",
      width: 4000,
      height: 3000,
      quality: null,
    });
    expect(c?.flags).toEqual(["passthrough"]);
    expect(stored?.result).toMatchObject({ outcome: "met", attempts: 0, selected: 0 });
    expect(get("p")?.job.status).toBe("idle");
    expect(state().announcement).toBe(strings.process.announce.done);
  });

  it("Range inside the bounds and Target within 2 % pass through too", async () => {
    add();
    const fake = fakeEngine();
    await optimizeImage(
      "p",
      withGoal({ mode: "range", minBytes: BYTES, maxBytes: BYTES + 1 }),
      NO_EDITS,
      fake.engine,
    );
    expect(get("p")?.result?.result.attempts).toBe(0);
    // 400,000 vs 392,157: 2.0 % above → met; the side is "above".
    await optimizeImage(
      "p",
      withGoal({ mode: "target", targetBytes: 392_157 }),
      NO_EDITS,
      fake.engine,
    );
    expect(get("p")?.result?.result.candidates[0]?.side).toBe("above");
    expect(fake.optimize).not.toHaveBeenCalled();
  });

  const crop = { x: 0, y: 0, width: 10, height: 10 };
  const cases: [string, () => void, OptimizeSettings, ImageEdits][] = [
    [
      "setting off",
      () =>
        add(
          {},
          {
            settings: {
              ...defaultSettings({ format: "jpeg", hasAlpha: false }),
              keepOriginal: false,
            },
          },
        ),
      withGoal({ mode: "maximum", maxBytes: BYTES }),
      NO_EDITS,
    ],
    [
      "cropped",
      () => add(),
      withGoal({ mode: "maximum", maxBytes: BYTES }),
      { crop, rotation: 0, resize: null },
    ],
    [
      "rotated",
      () => add(),
      withGoal({ mode: "maximum", maxBytes: BYTES }),
      { crop: null, rotation: 90, resize: null },
    ],
    [
      "resized (incl. Exact size)",
      () => add(),
      withGoal({ mode: "maximum", maxBytes: BYTES }),
      { crop: null, rotation: 0, resize: { width: 10, height: 10 } },
    ],
    [
      "other output format",
      () => add(),
      withGoal({ mode: "maximum", maxBytes: BYTES }, "image/webp"),
      NO_EDITS,
    ],
    [
      "HEIC input",
      () => add({ format: "heic", mime: "image/heic" }),
      withGoal({ mode: "maximum", maxBytes: BYTES }),
      NO_EDITS,
    ],
    [
      "renamed file whose real format differs",
      () => add({ format: "png", mime: "image/png", extension: "jpg" }),
      withGoal({ mode: "maximum", maxBytes: BYTES }),
      NO_EDITS,
    ],
    [
      "animated (first frame only)",
      () => add({ format: "webp", mime: "image/webp", notices: [{ code: "first_frame_only" }] }),
      withGoal({ mode: "maximum", maxBytes: BYTES }, "image/webp"),
      NO_EDITS,
    ],
    [
      "Maximum over by 1 B",
      () => add(),
      withGoal({ mode: "maximum", maxBytes: BYTES - 1 }),
      NO_EDITS,
    ],
    [
      "Range: below the minimum",
      () => add(),
      withGoal({ mode: "range", minBytes: BYTES + 1, maxBytes: BYTES + 10 }),
      NO_EDITS,
    ],
    [
      "Range: above the maximum",
      () => add(),
      withGoal({ mode: "range", minBytes: 1_000, maxBytes: BYTES - 1 }),
      NO_EDITS,
    ],
    [
      "Target just outside 2 %",
      () => add(),
      withGoal({ mode: "target", targetBytes: 392_000 }),
      NO_EDITS,
    ],
  ];
  it.each(cases)(
    "not taken when %s: the engine runs",
    async (_label, setup, goalSettings, edits) => {
      setup();
      const fake = fakeEngine();
      const run = optimizeImage("p", goalSettings, edits, fake.engine);
      expect(fake.optimize).toHaveBeenCalledTimes(1);
      fake.finish({ status: "cancelled" });
      await run;
    },
  );
});
