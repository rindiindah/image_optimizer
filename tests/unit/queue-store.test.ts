import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQueue } from "../../src/features/queue/store";
import type { Candidate, OptimizationResult } from "../../src/types/engine";
import type { ImageInfo, QueueItem } from "../../src/types/image";

const revoke = vi.fn();
const createUrl = vi.fn<(blob: Blob) => string>();

function item(id: string, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    file: new File(["x"], `${id}.png`),
    name: `${id}.png`,
    extension: "png",
    sizeBytes: 1,
    status: "reading",
    notices: [],
    metadata: null,
    thumbnailUrl: null,
    previewUrl: null,
    error: null,
    settings: null,
    edits: null,
    job: { status: "idle" },
    result: null,
    ...overrides,
  };
}

const info: ImageInfo = {
  format: "heic",
  mime: "image/heic",
  width: 3024,
  height: 4032,
  hasAlpha: false,
  notices: [{ code: "hdr_converted" }],
};

const state = () => useQueue.getState();
const ids = () => state().items.map((i) => i.id);

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  revoke.mockReset();
  URL.revokeObjectURL = revoke;
});

describe("image list store", () => {
  it("adds items in order and selects the first one when nothing is selected", () => {
    state().add([item("a"), item("b")]);
    expect(ids()).toEqual(["a", "b"]);
    expect(state().selectedId).toBe("a");
    state().select("b");
    state().add([item("c")]);
    expect(state().selectedId).toBe("b");
  });

  it("ignores selecting an id that isn't in the list", () => {
    state().add([item("a")]);
    state().select("nope");
    expect(state().selectedId).toBe("a");
  });

  it("marks an item ready with merged metadata and notices, keeping its id", () => {
    state().add([item("a", { notices: [{ code: "extension_mismatch", extension: "jpg" }] })]);
    state().setReady("a", info, "blob:t", "blob:p");
    const ready = state().items[0];
    expect(ready).toMatchObject({
      id: "a",
      status: "ready",
      thumbnailUrl: "blob:t",
      previewUrl: "blob:p",
    });
    expect(ready?.metadata).toEqual({
      ...info,
      name: "a.png",
      extension: "png",
      sizeBytes: 1,
      notices: [{ code: "extension_mismatch", extension: "jpg" }, { code: "hdr_converted" }],
    });
  });

  it("marks an item as failed with its error code", () => {
    state().add([item("a")]);
    state().setError("a", "decode_failed");
    expect(state().items[0]).toMatchObject({ status: "error", error: "decode_failed" });
  });

  it("revokes an item's object URLs when it is removed", () => {
    state().add([item("a")]);
    state().setReady("a", info, "blob:t", "blob:p");
    state().remove("a");
    expect(revoke).toHaveBeenCalledWith("blob:t");
    expect(revoke).toHaveBeenCalledWith("blob:p");
    expect(ids()).toEqual([]);
    expect(state().selectedId).toBeNull();
  });

  it("revokes the URLs of a result that arrives after its item was removed", () => {
    state().add([item("a")]);
    state().remove("a");
    state().setReady("a", info, "blob:late-t", "blob:late-p");
    expect(revoke).toHaveBeenCalledWith("blob:late-t");
    expect(revoke).toHaveBeenCalledWith("blob:late-p");
    expect(ids()).toEqual([]);
  });

  it("removing the selected item selects the next one, else the previous one", () => {
    state().add([item("a"), item("b"), item("c")]);
    state().select("b");
    state().remove("b");
    expect(state().selectedId).toBe("c");
    state().remove("c");
    expect(state().selectedId).toBe("a");
  });

  it("removing another item keeps the selection", () => {
    state().add([item("a"), item("b")]);
    state().remove("b");
    expect(state().selectedId).toBe("a");
  });
});

describe("settings, jobs and results (M3)", () => {
  const candidate = (side: "below" | "above", bytes: number): Candidate => ({
    side,
    bytes,
    mime: "image/jpeg",
    width: 10,
    height: 10,
    quality: 70,
    outcome: "close",
    flags: [],
  });
  const targetResult: OptimizationResult = {
    mode: "target",
    outcome: "close",
    candidates: [candidate("below", 95_000), candidate("above", 104_000)],
    selected: 1,
    closest: null,
    attempts: 5,
  };
  const goal = { mode: "target" as const, targetBytes: 100_000 };
  const files = [new Blob(["below"]), new Blob(["above"])];

  beforeEach(() => {
    let n = 0;
    createUrl.mockReset().mockImplementation(() => `blob:r${String(++n)}`);
    URL.createObjectURL = createUrl;
    state().add([item("a")]);
    state().setReady("a", { ...info, format: "png", hasAlpha: true }, "blob:t", "blob:p");
  });

  it("a ready image gets default settings from its format and transparency", () => {
    expect(state().items[0]?.settings).toMatchObject({ mode: "maximum", format: "image/png" });
  });

  it("finishing a job stores the files with one URL each; re-running releases the old ones", () => {
    state().startJob("a");
    state().finishJob("a", targetResult, goal, files);
    expect(state().items[0]?.result).toMatchObject({ urls: ["blob:r1", "blob:r2"], selected: 1 });
    expect(state().items[0]?.job).toEqual({ status: "idle" });

    state().finishJob("a", targetResult, goal, files);
    expect(revoke).toHaveBeenCalledWith("blob:r1");
    expect(revoke).toHaveBeenCalledWith("blob:r2");
  });

  it("the user can switch candidates while the result is current", () => {
    state().finishJob("a", targetResult, goal, files);
    state().chooseCandidate("a", 0);
    expect(state().items[0]?.result?.selected).toBe(0);
    state().chooseCandidate("a", 5);
    expect(state().items[0]?.result?.selected).toBe(0);
  });

  it("changing a setting marks the result outdated and keeps only the chosen file (D14)", () => {
    state().finishJob("a", targetResult, goal, files);
    state().chooseCandidate("a", 0);
    state().updateSettings("a", { mode: "maximum" });
    const result = state().items[0]?.result;
    expect(state().items[0]?.settings?.mode).toBe("maximum");
    expect(result).toMatchObject({ outdated: true, selected: 0, urls: ["blob:r1"] });
    expect(result?.files).toEqual([files[0]]);
    expect(result?.result.candidates).toEqual([targetResult.candidates[0]]);
    expect(revoke).toHaveBeenCalledWith("blob:r2");
    expect(revoke).not.toHaveBeenCalledWith("blob:r1");
    // Outdated results can't be switched; further changes don't release more.
    state().chooseCandidate("a", 0);
    state().updateSettings("a", { mode: "range" });
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("a ready image starts without edits; applying edits marks the result outdated (M4)", () => {
    expect(state().items[0]?.edits).toEqual({
      crop: null,
      rotation: 0,
      ratio: "free",
      portrait: false,
      exact: null,
    });
    state().finishJob("a", targetResult, goal, files);
    const edits = {
      crop: { x: 0, y: 0, width: 5, height: 5 },
      rotation: 90 as const,
      ratio: "1:1" as const,
      portrait: false,
      exact: null,
    };
    state().updateEdits("a", edits);
    expect(state().items[0]?.edits).toEqual(edits);
    expect(state().items[0]?.result?.outdated).toBe(true);
    expect(state().items[0]?.result?.urls).toEqual(["blob:r2"]); // the chosen one (index 1)
  });

  it("removing the image releases its result files too", () => {
    state().finishJob("a", targetResult, goal, files);
    state().remove("a");
    expect(revoke).toHaveBeenCalledWith("blob:r1");
    expect(revoke).toHaveBeenCalledWith("blob:r2");
  });

  it("a result for a removed image is dropped without creating URLs", () => {
    state().remove("a");
    state().finishJob("a", targetResult, goal, files);
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("progress only applies to a running job; failures and cancels keep the earlier result", () => {
    state().setProgress("a", { phase: 1, attempt: 1, maxAttempts: 8 });
    expect(state().items[0]?.job).toEqual({ status: "idle" });
    state().finishJob("a", targetResult, goal, files);
    state().startJob("a");
    state().failJob("a", "encode_failed");
    expect(state().items[0]?.job).toEqual({ status: "error", code: "encode_failed" });
    state().startJob("a");
    state().cancelJob("a");
    expect(state().items[0]?.job).toEqual({ status: "cancelled" }); // M6: shown on the row
    expect(state().items[0]?.result?.urls).toEqual(["blob:r1", "blob:r2"]);
  });
});

describe("selection and apply to selected (M6, D23)", () => {
  const ready = (id: string) => {
    state().add([item(id)]);
    state().setReady(
      id,
      { ...info, format: "png", hasAlpha: false },
      `blob:t-${id}`,
      `blob:p-${id}`,
    );
  };
  const settingsOf = (id: string) => state().items.find((i) => i.id === id)?.settings;

  beforeEach(() => {
    createUrl.mockReset().mockReturnValue("blob:r");
    URL.createObjectURL = createUrl;
    for (const id of ["a", "b", "c"]) ready(id);
  });

  it("checkboxes tick and untick ids; unknown ids are ignored; removing drops the id", () => {
    state().setChecked("a", true);
    state().setChecked("b", true);
    state().setChecked("zzz", true);
    state().setChecked("a", false);
    expect(state().checked).toEqual(["b"]);
    state().setAllChecked(["a", "b", "c", "gone"]);
    expect(state().checked).toEqual(["a", "b", "c"]);
    state().remove("b");
    expect(state().checked).toEqual(["a", "c"]);
    state().setAllChecked([]);
    expect(state().checked).toEqual([]);
  });

  it("each group overwrites only its own fields; pixel values are never copied", () => {
    state().updateSettings("a", {
      mode: "range",
      size: { text: "900", unit: "KB" },
      min: { text: "100", unit: "KB" },
      format: "image/webp",
      minQuality: "40",
      allowDimensionReduction: true,
      keepOriginal: false,
      resize: { width: "10", height: "", keepAspect: true },
      minSize: { width: "5", height: "5" },
    });
    expect(state().applySettings("a", ["b"], ["size"])).toBe(1);
    expect(settingsOf("b")).toMatchObject({ mode: "range", format: "image/png", minQuality: "" });
    expect(settingsOf("b")?.size).toEqual({ text: "900", unit: "KB" });

    state().applySettings("a", ["c"], ["format", "more"]);
    const c = settingsOf("c");
    expect(c).toMatchObject({
      mode: "maximum",
      format: "image/webp",
      minQuality: "40",
      allowDimensionReduction: true,
      keepOriginal: false,
    });
    // Never copied (they depend on each image's dimensions).
    expect(c?.resize).toEqual({ width: "", height: "", keepAspect: true });
    expect(c?.minSize).toEqual({ width: "", height: "" });
  });

  it("a source without a fill colour doesn't clear the other image's choice", () => {
    state().updateSettings("b", { format: "image/jpeg", background: "#000000" });
    state().updateSettings("a", { format: "image/jpeg", background: null });
    state().applySettings("a", ["b"], ["format"]);
    expect(settingsOf("b")?.background).toBe("#000000");
  });

  it("running images aren't changed; changed results become outdated; crop/rotation untouched", () => {
    const result: OptimizationResult = {
      mode: "maximum",
      outcome: "met",
      candidates: [{ ...candidateOf(), side: "below" }],
      selected: 0,
      closest: null,
      attempts: 1,
    };
    state().finishJob("c", result, { mode: "maximum", maxBytes: 9 }, [new Blob(["c"])]);
    state().startJob("b");
    state().updateSettings("a", { format: "image/webp" });
    expect(state().applySettings("a", ["a", "b", "c"], ["format"])).toBe(1); // not itself, not b
    expect(settingsOf("b")?.format).toBe("image/png");
    const c = state().items.find((i) => i.id === "c");
    expect(c?.result?.outdated).toBe(true);
    expect(c?.edits).toMatchObject({ crop: null, rotation: 0 });
    expect(state().applySettings("a", ["c"], [])).toBe(0);
  });
});

function candidateOf(): Candidate {
  return {
    side: "below",
    bytes: 1,
    mime: "image/png",
    width: 1,
    height: 1,
    quality: null,
    outcome: "met",
    flags: [],
  };
}
