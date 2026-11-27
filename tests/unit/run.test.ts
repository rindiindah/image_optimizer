import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strings } from "../../src/content/strings";
import {
  cancelAll,
  cancelImage,
  configureRunner,
  optimizeImages,
  passThrough,
  whenIdle,
  type Engine,
} from "../../src/features/process/run";
import { useQueue } from "../../src/features/queue/store";
import { defaultSettings } from "../../src/features/settings/settings";
import {
  NO_EDITS,
  type ImageEdits,
  type OptimizationResult,
  type OptimizeSettings,
} from "../../src/types/engine";
import type { ImageMetadata, QueueItem } from "../../src/types/image";
import type { ClientOutcome, OptimizeOptions } from "../../src/workers/engine-client";
import { readyItem } from "./helpers/items";

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

interface Pending {
  file: Blob;
  settings: OptimizeSettings;
  options: OptimizeOptions;
  finish: (outcome: ClientOutcome) => void;
}

/** Fake engines that wait until the test settles each job, and honour the abort signal. */
function fakeEngines() {
  const pending: Pending[] = [];
  let created = 0;
  let disposed = 0;
  let throwNext = false;
  const factory = (): Engine => {
    created += 1;
    return {
      optimize: (file, settings, options) => {
        if (throwNext) {
          throwNext = false;
          return Promise.reject(new Error("crashed"));
        }
        return new Promise<ClientOutcome>((resolve) => {
          pending.push({ file, settings, options, finish: resolve });
          options.signal?.addEventListener("abort", () => {
            resolve({ status: "cancelled" });
          });
        });
      },
      dispose: () => {
        disposed += 1;
      },
    };
  };
  return {
    factory,
    pending,
    /** The pending job for the image whose file is `file`. */
    jobFor: (file: Blob) => {
      const job = pending.find((p) => p.file === file);
      if (!job) throw new Error("no job for that file");
      return job;
    },
    created: () => created,
    disposed: () => disposed,
    throwOnNext: () => {
      throwNext = true;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const createUrl = vi.fn<(blob: Blob) => string>();
const state = () => useQueue.getState();
const get = (id: string) => state().items.find((i) => i.id === id);
const fileOf = (id: string) => {
  const item = get(id);
  if (!item) throw new Error(`no item ${id}`);
  return item.file;
};
const done = (): ClientOutcome => ({
  status: "done",
  result,
  files: [new Blob(["abc"], { type: "image/jpeg" })],
});

/**
 * A ready image with a valid 500 KB maximum, so it can run. "Keep original" is off: these tiny
 * files already fit, so they would otherwise pass through without an engine (D22).
 */
function image(
  id: string,
  meta: Partial<ImageMetadata> = {},
  patch: Partial<QueueItem> = {},
  keepOriginal = false,
) {
  const base = readyItem(id, `${id}.jpg`, meta, { file: new File([id], `${id}.jpg`), ...patch });
  const settings = base.settings && {
    ...base.settings,
    size: { text: "500", unit: "KB" as const },
    keepOriginal,
  };
  return { ...base, settings };
}

let fake: ReturnType<typeof fakeEngines>;

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  createUrl.mockReset().mockReturnValue("blob:result");
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = vi.fn();
  fake = fakeEngines();
  configureRunner({ engine: fake.factory, concurrency: 2 });
});

afterEach(async () => {
  cancelAll();
  await whenIdle();
});

describe("optimizing one image", () => {
  it("reports progress, then stores the result with its files and goal", async () => {
    state().add([image("a")]);
    optimizeImages(["a"]);
    expect(get("a")?.job).toEqual({ status: "running", progress: null });
    const job = fake.jobFor(fileOf("a"));
    expect(job.settings.goal).toEqual({ mode: "maximum", maxBytes: 500_000 });

    job.options.onProgress?.({ phase: 1, attempt: 3, maxAttempts: 8 });
    expect(get("a")?.job).toEqual({
      status: "running",
      progress: { phase: 1, attempt: 3, maxAttempts: 8 },
    });

    const outcome = done();
    job.finish(outcome);
    await whenIdle();
    expect(get("a")?.job).toEqual({ status: "idle" });
    expect(get("a")?.result).toMatchObject({
      result,
      goal: { mode: "maximum", maxBytes: 500_000 },
      urls: ["blob:result"],
      selected: 0,
      outdated: false,
    });
    expect(state().announcement).toBe(strings.process.announce.done);
  });

  it("sends the image's edits with the run, in engine form (M4)", async () => {
    state().add([
      image(
        "a",
        {},
        {
          edits: {
            crop: { x: 1, y: 2, width: 300, height: 400 },
            rotation: 90,
            ratio: "free",
            portrait: false,
            exact: null,
          },
        },
      ),
    ]);
    optimizeImages(["a"]);
    const edits: ImageEdits = {
      crop: { x: 1, y: 2, width: 300, height: 400 },
      rotation: 90,
      resize: null,
    };
    expect(fake.jobFor(fileOf("a")).options.edits).toEqual(edits);
    cancelImage("a");
    await whenIdle();
    expect(get("a")?.job).toEqual({ status: "cancelled" });
    expect(get("a")?.result).toBeNull();
  });

  it("an engine error is stored as its code; a throwing engine counts as a crash", async () => {
    state().add([image("a"), image("b")]);
    optimizeImages(["a"]);
    fake.jobFor(fileOf("a")).finish({ status: "error", code: "encode_failed" });
    await whenIdle();
    expect(get("a")?.job).toEqual({ status: "error", code: "encode_failed" });
    expect(state().announcement).toBe(strings.process.announce.error);

    fake.throwOnNext();
    optimizeImages(["b"]);
    await whenIdle();
    expect(get("b")?.job).toEqual({ status: "error", code: "worker_crashed" });
  });

  it("a settings or edits change while it ran makes the new result outdated at once", async () => {
    state().add([image("a")]);
    optimizeImages(["a"]);
    state().updateEdits("a", {
      crop: null,
      rotation: 180,
      ratio: "free",
      portrait: false,
      exact: null,
    });
    fake.jobFor(fileOf("a")).finish(done());
    await whenIdle();
    expect(get("a")?.result?.outdated).toBe(true);
  });
});

describe("batch (M6)", () => {
  it("runs at most the concurrency at once, in list order; a freed slot starts the next", async () => {
    state().add([image("a"), image("b"), image("c")]);
    optimizeImages(["c", "a", "b"]);
    expect(get("a")?.job.status).toBe("running");
    expect(get("b")?.job.status).toBe("running");
    expect(get("c")?.job.status).toBe("queued");
    fake.jobFor(fileOf("a")).finish(done());
    await flush();
    expect(get("c")?.job.status).toBe("running");
  });

  it("concurrency 1 runs one at a time", () => {
    configureRunner({ concurrency: 1 });
    state().add([image("a"), image("b")]);
    optimizeImages(["a", "b"]);
    expect(get("a")?.job.status).toBe("running");
    expect(get("b")?.job.status).toBe("queued");
  });

  it("a HEIC image runs alone, and nothing starts next to it", async () => {
    state().add([image("h", { format: "heic", mime: "image/heic" }), image("a"), image("b")]);
    optimizeImages(["h", "a", "b"]);
    expect(get("h")?.job.status).toBe("running");
    expect(get("a")?.job.status).toBe("queued");
    fake.jobFor(fileOf("h")).finish(done());
    await flush();
    expect(get("a")?.job.status).toBe("running");
    expect(get("b")?.job.status).toBe("running");
  });

  it("the running jobs' pixels stay within 50 MP", () => {
    state().add([
      image("big", { width: 8000, height: 5000 }), // 40 MP
      image("a", { width: 6000, height: 4000 }), // 24 MP
    ]);
    optimizeImages(["big", "a"]);
    expect(get("big")?.job.status).toBe("running");
    expect(get("a")?.job.status).toBe("queued");
  });

  it("one failure and one crash affect only their own images; the others keep their results", async () => {
    configureRunner({ concurrency: 1 }); // one after another, so the crash hits exactly "b"
    state().add([image("a"), image("b"), image("c"), image("d")]);
    optimizeImages(["a", "b", "c", "d"]);
    const first = done();
    fake.jobFor(fileOf("a")).finish(first);
    await flush();
    const keptA = get("a")?.result;
    fake.jobFor(fileOf("b")).finish({ status: "error", code: "image_too_large" });
    fake.throwOnNext(); // "c" crashes
    await flush();
    await flush();
    fake.jobFor(fileOf("d")).finish(done());
    await whenIdle();

    expect(get("a")?.result).toBe(keptA); // unchanged, same object
    expect(get("a")?.job.status).toBe("idle");
    expect(get("b")?.job).toEqual({ status: "error", code: "image_too_large" });
    expect(get("c")?.job).toEqual({ status: "error", code: "worker_crashed" });
    expect(get("d")?.result?.outdated).toBe(false);
    expect(state().announcement).toBe(strings.process.announce.batchDone(2, 2, 0));
  });

  it("a crashed engine is disposed and not reused; the pool is disposed when the batch ends", async () => {
    configureRunner({ concurrency: 1 });
    state().add([image("a"), image("b")]);
    fake.throwOnNext();
    optimizeImages(["a", "b"]);
    await flush();
    fake.jobFor(fileOf("b")).finish(done());
    await whenIdle();
    expect(fake.created()).toBe(2); // "b" didn't get the crashed engine
    expect(fake.disposed()).toBe(2); // the crashed one, then the pool at the end
  });

  it("cancelling one running image leaves the other running; it then finishes normally", async () => {
    state().add([image("a"), image("b")]);
    optimizeImages(["a", "b"]);
    cancelImage("a");
    await flush();
    expect(get("a")?.job).toEqual({ status: "cancelled" });
    expect(get("b")?.job.status).toBe("running");
    fake.jobFor(fileOf("b")).finish(done());
    await whenIdle();
    expect(get("b")?.result).not.toBeNull();
    expect(get("a")?.result).toBeNull();
  });

  it("cancelling a queued image takes it out of the queue; it never starts", async () => {
    configureRunner({ concurrency: 1 });
    state().add([image("a"), image("b")]);
    optimizeImages(["a", "b"]);
    cancelImage("b");
    expect(get("b")?.job).toEqual({ status: "cancelled" });
    fake.jobFor(fileOf("a")).finish(done());
    await whenIdle();
    expect(fake.pending).toHaveLength(1);
  });

  it("Cancel all: nothing shows as done", async () => {
    configureRunner({ concurrency: 1 });
    state().add([image("a"), image("b")]);
    optimizeImages(["a", "b"]);
    cancelAll();
    await whenIdle();
    expect(get("a")?.job).toEqual({ status: "cancelled" });
    expect(get("b")?.job).toEqual({ status: "cancelled" });
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("removing a queued or running image stops it and keeps nothing", async () => {
    configureRunner({ concurrency: 1 });
    state().add([image("a"), image("b"), image("c")]);
    optimizeImages(["a", "b", "c"]);
    state().remove("b"); // queued
    state().remove("a"); // running
    await flush();
    expect(get("c")?.job.status).toBe("running");
    fake.jobFor(fileOf("c")).finish(done());
    await whenIdle();
    expect(fake.pending).toHaveLength(2); // "b" never started
    expect(createUrl).toHaveBeenCalledTimes(1); // only "c"'s result
  });

  it("Retry queues a failed image again with its current settings", async () => {
    state().add([image("a")]);
    optimizeImages(["a"]);
    fake.jobFor(fileOf("a")).finish({ status: "error", code: "encode_failed" });
    await whenIdle();
    state().updateSettings("a", { size: { text: "300", unit: "KB" } });
    optimizeImages(["a"]);
    expect(fake.pending[1]?.settings.goal).toEqual({ mode: "maximum", maxBytes: 300_000 });
  });

  it("skips incomplete settings (with the reason) and, for Optimize selected, up-to-date results", async () => {
    state().add([image("a"), image("b"), readyItem("empty", "empty.jpg")]);
    optimizeImages(["a"]);
    fake.jobFor(fileOf("a")).finish(done());
    await whenIdle();

    optimizeImages(["a", "b", "empty"], { skipUpToDate: true });
    expect(get("a")?.job.status).toBe("idle"); // up to date: left alone
    expect(get("empty")?.job).toEqual({ status: "skipped" });
    expect(get("b")?.job.status).toBe("running");
    expect(state().announcement).toBe(strings.process.announce.batchStart(1, 1, 1));
    // A settings change clears the "skipped" reason.
    state().updateSettings("empty", { size: { text: "500", unit: "KB" } });
    expect(get("empty")?.job).toEqual({ status: "idle" });
  });

  it("a pass-through image finishes at once without an engine (D22)", async () => {
    state().add([image("p", { sizeBytes: 1 }, {}, true)]);
    optimizeImages(["p"]);
    await whenIdle();
    expect(fake.created()).toBe(0);
    expect(get("p")?.result?.files[0]).toBe(fileOf("p")); // the original File itself
    expect(get("p")?.result?.result).toMatchObject({ attempts: 0, outcome: "met" });
  });
});

describe("pass-through (D22): the original file is kept when it already fits", () => {
  const BYTES = 400_000;
  const settings: OptimizeSettings = {
    goal: { mode: "maximum", maxBytes: BYTES },
    format: "image/jpeg",
    minQuality: null,
    allowDimensionReduction: false,
    minDimensions: null,
    allowColorReduction: false,
    background: null,
  };
  const make = (meta: Partial<ImageMetadata> = {}, patch: Partial<QueueItem> = {}) =>
    readyItem(
      "p",
      "p.jpg",
      { sizeBytes: BYTES, ...meta },
      { file: new File([new Uint8Array(BYTES)], "p.jpg"), ...patch },
    );
  const withGoal = (goal: OptimizeSettings["goal"], format = settings.format) => ({
    ...settings,
    goal,
    format,
  });

  it("unedited, same format, fits: one passthrough candidate, 0 encodes", () => {
    const kept = passThrough(make(), settings, NO_EDITS);
    expect(kept?.candidates[0]).toMatchObject({
      bytes: BYTES,
      mime: "image/jpeg",
      width: 4000,
      height: 3000,
      quality: null,
      flags: ["passthrough"],
    });
    expect(kept).toMatchObject({ outcome: "met", attempts: 0, selected: 0 });
  });

  it("Range inside the bounds and Target within 2 % pass through too", () => {
    expect(
      passThrough(
        make(),
        withGoal({ mode: "range", minBytes: BYTES, maxBytes: BYTES + 1 }),
        NO_EDITS,
      ),
    ).not.toBeNull();
    // 400,000 vs 392,157: 2.0 % above → met; the side is "above".
    const target = passThrough(
      make(),
      withGoal({ mode: "target", targetBytes: 392_157 }),
      NO_EDITS,
    );
    expect(target?.candidates[0]?.side).toBe("above");
  });

  const crop = { x: 0, y: 0, width: 10, height: 10 };
  const off = {
    settings: { ...defaultSettings({ format: "jpeg", hasAlpha: false }), keepOriginal: false },
  };
  const max = withGoal({ mode: "maximum", maxBytes: BYTES });
  const cases: [string, QueueItem, OptimizeSettings, ImageEdits][] = [
    ["setting off", make({}, off), max, NO_EDITS],
    ["cropped", make(), max, { crop, rotation: 0, resize: null }],
    ["rotated", make(), max, { crop: null, rotation: 90, resize: null }],
    [
      "resized (incl. Exact size)",
      make(),
      max,
      { crop: null, rotation: 0, resize: { width: 10, height: 10 } },
    ],
    ["other output format", make(), withGoal(max.goal, "image/webp"), NO_EDITS],
    ["HEIC input", make({ format: "heic", mime: "image/heic" }), max, NO_EDITS],
    [
      "renamed file whose real format differs",
      make({ format: "png", mime: "image/png", extension: "jpg" }),
      max,
      NO_EDITS,
    ],
    [
      "animated (first frame only)",
      make({ format: "webp", mime: "image/webp", notices: [{ code: "first_frame_only" }] }),
      withGoal(max.goal, "image/webp"),
      NO_EDITS,
    ],
    ["Maximum over by 1 B", make(), withGoal({ mode: "maximum", maxBytes: BYTES - 1 }), NO_EDITS],
    [
      "Range: below the minimum",
      make(),
      withGoal({ mode: "range", minBytes: BYTES + 1, maxBytes: BYTES + 10 }),
      NO_EDITS,
    ],
    [
      "Range: above the maximum",
      make(),
      withGoal({ mode: "range", minBytes: 1_000, maxBytes: BYTES - 1 }),
      NO_EDITS,
    ],
    [
      "Target just outside 2 %",
      make(),
      withGoal({ mode: "target", targetBytes: 392_000 }),
      NO_EDITS,
    ],
  ];
  it.each(cases)("not taken when %s", (_label, item, goalSettings, edits) => {
    expect(passThrough(item, goalSettings, edits)).toBeNull();
  });
});
