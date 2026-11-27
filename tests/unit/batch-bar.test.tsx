import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";
import type { OptimizationResult } from "../../src/types/engine";
import type { ItemResult } from "../../src/types/image";
import { readyItem } from "./helpers/items";

const run = vi.hoisted(() => ({
  optimizeImages: vi.fn(),
  cancelImage: vi.fn(),
  cancelAll: vi.fn(),
}));
vi.mock("../../src/features/process/run", () => run);

const zip = vi.hoisted(() => ({ buildZip: vi.fn(), saveBlob: vi.fn() }));
vi.mock("../../src/features/download/zip", async (importActual) => ({
  ...(await importActual<typeof import("../../src/features/download/zip")>()),
  ...zip,
}));

const b = strings.batch;
const q = strings.queue;
const state = () => useQueue.getState();

const result = (patch: Partial<ItemResult> = {}): ItemResult => {
  const r: OptimizationResult = {
    mode: "maximum",
    outcome: "met",
    candidates: [
      {
        side: "below",
        bytes: 480_000,
        mime: "image/jpeg",
        width: 10,
        height: 10,
        quality: 80,
        outcome: "met",
        flags: [],
      },
    ],
    selected: 0,
    closest: null,
    attempts: 3,
  };
  return {
    result: r,
    goal: { mode: "maximum", maxBytes: 500_000 },
    files: [new Blob(["x"], { type: "image/jpeg" })],
    urls: ["blob:r"],
    selected: 0,
    outdated: false,
    ...patch,
  };
};

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  URL.revokeObjectURL = vi.fn();
  for (const fn of [...Object.values(run), ...Object.values(zip)]) fn.mockReset();
});

describe("image rows (D23 Q1, Q9)", () => {
  it("each row has a labelled checkbox; Select all / Clear selection with a count", () => {
    state().add([readyItem("a", "a.jpg"), readyItem("b", "b.jpg")]);
    render(<App />);
    expect(screen.getByText(b.selected(0))).toBeTruthy();
    fireEvent.click(screen.getByLabelText(q.checkLabel("a.jpg")));
    expect(screen.getByText(b.selected(1))).toBeTruthy();
    fireEvent.click(button(b.selectAll));
    expect(state().checked).toEqual(["a", "b"]);
    expect(button(b.selectAll)).toHaveProperty("disabled", true);
    fireEvent.click(button(b.clear));
    expect(state().checked).toEqual([]);
    // Clicking the row still opens the image.
    fireEvent.click(button(q.selectLabel("b.jpg")));
    expect(state().selectedId).toBe("b");
  });

  it("the status is in words, with Cancel on busy rows and Retry on failed/cancelled ones", () => {
    state().add([
      readyItem("w", "w.jpg", {}, { job: { status: "queued" } }),
      readyItem(
        "r",
        "r.jpg",
        {},
        { job: { status: "running", progress: { phase: 1, attempt: 3, maxAttempts: 8 } } },
      ),
      readyItem("f", "f.jpg", {}, { job: { status: "error", code: "image_too_large" } }),
      readyItem("c", "c.jpg", {}, { job: { status: "cancelled" } }),
      readyItem("s", "s.jpg", {}, { job: { status: "skipped" } }),
      readyItem("d", "d.jpg", {}, { result: result() }),
      readyItem("o", "o.jpg", {}, { result: result({ outdated: true }) }),
      readyItem("n", "n.jpg", {}, { result: result({ selected: null, files: [], urls: [] }) }),
    ]);
    render(<App />);
    const t = q.job;
    expect(screen.getByText(t.waiting)).toBeTruthy();
    expect(screen.getByText(t.attempt(3, 8))).toBeTruthy();
    expect(screen.getByText(t.failed(strings.process.errors.image_too_large.what))).toBeTruthy();
    expect(screen.getByText(t.cancelled)).toBeTruthy();
    expect(screen.getByText(t.skipped)).toBeTruthy();
    expect(screen.getByText(t.done("480 KB"))).toBeTruthy();
    expect(screen.getByText(t.outdated)).toBeTruthy();
    expect(screen.getByText(t.noFile)).toBeTruthy();

    fireEvent.click(button(q.cancelLabel("w.jpg")));
    expect(run.cancelImage).toHaveBeenCalledWith("w");
    expect(screen.getByRole("button", { name: q.cancelLabel("r.jpg") })).toBeTruthy();
    fireEvent.click(button(q.retryLabel("f.jpg")));
    expect(run.optimizeImages).toHaveBeenLastCalledWith(["f"]);
    expect(screen.getByRole("button", { name: q.retryLabel("c.jpg") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: q.retryLabel("d.jpg") })).toBeNull();
  });
});

describe("batch actions (D23 Q3, Q5)", () => {
  it("Optimize selected runs the checked images, skipping up-to-date ones; Cancel all when busy", () => {
    state().add([readyItem("a", "a.jpg"), readyItem("b", "b.jpg")]);
    render(<App />);
    expect(button(b.optimize)).toHaveProperty("disabled", true);
    act(() => {
      state().setAllChecked(["b", "a"]);
    });
    fireEvent.click(button(b.optimize));
    expect(run.optimizeImages).toHaveBeenCalledWith(["b", "a"], { skipUpToDate: true });
    expect(screen.queryByRole("button", { name: b.cancelAll })).toBeNull();
    act(() => {
      state().queueJob("a");
    });
    fireEvent.click(button(b.cancelAll));
    expect(run.cancelAll).toHaveBeenCalled();
  });

  it("the ZIP button says which selected images it leaves out, and why", () => {
    state().add([
      readyItem("ok", "ok.jpg", {}, { result: result() }),
      readyItem("new", "new.jpg"),
      readyItem("old", "old.jpg", {}, { result: result({ outdated: true }) }),
    ]);
    render(<App />);
    expect(button(b.zip)).toHaveProperty("disabled", true);
    act(() => {
      state().setAllChecked(["new"]);
    });
    expect(button(b.zip)).toHaveProperty("disabled", true);
    expect(screen.getByText(b.zipNone)).toBeTruthy();
    act(() => {
      state().setAllChecked(["ok", "new", "old"]);
    });
    expect(button(b.zip)).toHaveProperty("disabled", false);
    expect(
      screen.getByText(b.leftOut(2, 3, [b.reasons.noResult(1), b.reasons.outdated(1)])),
    ).toBeTruthy();
  });

  it("downloads the ZIP with progress, and a failure keeps single downloads", async () => {
    state().add([readyItem("ok", "ok.jpg", {}, { result: result() })]);
    state().setAllChecked(["ok"]);
    const archive = new Blob(["zip"]);
    zip.buildZip.mockImplementation(
      (_entries: unknown, onProgress: (d: number, t: number) => void) => {
        onProgress(0, 1);
        return Promise.resolve(archive);
      },
    );
    render(<App />);
    await act(async () => {
      fireEvent.click(button(b.zip));
      await Promise.resolve();
    });
    expect(zip.buildZip).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "ok-optimized.jpg" })],
      expect.any(Function),
    );
    expect(zip.saveBlob).toHaveBeenCalledWith(archive, "optimized-images.zip");
    expect(screen.getAllByText(b.zipReady(1)).length).toBeGreaterThan(0);

    zip.buildZip.mockRejectedValue(new Error("no memory"));
    await act(async () => {
      fireEvent.click(button(b.zip));
      await Promise.resolve();
    });
    expect(screen.getByRole("alert").textContent).toBe(b.zipFailed);
    expect(screen.getByRole("link", { name: strings.result.download })).toBeTruthy();
  });
});
