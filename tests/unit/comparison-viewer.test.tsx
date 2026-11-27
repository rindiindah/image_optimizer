import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { strings } from "../../src/content/strings";
import { ComparisonViewer, type Renderer } from "../../src/features/results/ComparisonViewer";
import type { Candidate } from "../../src/types/engine";
import type { RenderOutcome } from "../../src/workers/engine-client";
import { readyItem } from "./helpers/items";

const t = strings.result.compare;

const candidate: Candidate = {
  side: "below",
  bytes: 400_000,
  mime: "image/jpeg",
  width: 2000,
  height: 1500,
  quality: 72,
  outcome: "met",
  flags: [],
};

/** A renderer the test settles; records the abort signal of each call. */
function fakeRenderer() {
  const calls: { args: unknown[]; signal: AbortSignal | undefined }[] = [];
  let settle: (outcome: RenderOutcome) => void = () => undefined;
  const render = vi.fn((...args: Parameters<Renderer["render"]>) => {
    calls.push({ args: args.slice(0, 3), signal: args[3] });
    return new Promise<RenderOutcome>((resolve) => {
      settle = resolve;
    });
  });
  return {
    renderer: { render } satisfies Renderer,
    render,
    calls,
    finish: async (outcome: RenderOutcome) => {
      await act(async () => {
        settle(outcome);
        await Promise.resolve();
      });
    },
  };
}

// jsdom has no ImageData; the viewer only reads width, height and (on a real canvas) data.
const pixels = (width: number, height: number) =>
  ({ width, height, data: new Uint8ClampedArray(0) }) as unknown as ImageData;

function show(renderer: Renderer, patch: Parameters<typeof readyItem>[3] = {}) {
  const item = readyItem("a", "photo.jpg", {}, patch);
  return render(
    <ComparisonViewer item={item} candidate={candidate} url="blob:out" renderer={renderer} />,
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });

describe("comparison viewer (M5, D22)", () => {
  it("starts as a slider at Fit; the divider moves by keyboard/pointer input and clips the output", () => {
    const fake = fakeRenderer();
    show(fake.renderer);
    expect(radio(t.slider)).toHaveProperty("checked", true);
    expect(radio(t.fit)).toHaveProperty("checked", true);
    expect(screen.getByText(t.original)).toBeTruthy();
    expect(screen.getByText(t.optimized)).toBeTruthy();
    const divider = screen.getByRole("slider", { name: t.divider });
    expect(divider.getAttribute("aria-valuetext")).toBe(t.dividerValue(50));
    fireEvent.change(divider, { target: { value: "30" } });
    expect(divider.getAttribute("aria-valuetext")).toBe(t.dividerValue(30));
    const after = screen.getByRole("img", { name: strings.result.previewAlt });
    expect(after.style.clipPath).toMatch(/^inset\(0(px)? 0(px)? 0(px)? 30%\)$/);
    expect(screen.getByRole("img", { name: t.original })).toBeTruthy();
    // Fit never asks for the full-size original.
    expect(fake.render).not.toHaveBeenCalled();
  });

  it("side by side: two labelled figures, no divider, the output isn't clipped", () => {
    show(fakeRenderer().renderer);
    fireEvent.click(radio(t.sideBySide));
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getAllByRole("figure")).toHaveLength(2);
    expect(screen.getByRole("img", { name: strings.result.previewAlt }).style.clipPath).toBe("");
  });

  it("an edited image is labelled as cropped and rotated", () => {
    show(fakeRenderer().renderer, {
      edits: {
        crop: { x: 0, y: 0, width: 10, height: 10 },
        rotation: 90,
        ratio: "free",
        portrait: false,
        exact: null,
      },
    });
    expect(screen.getByText(t.originalEdited)).toBeTruthy();
  });

  it("100 %: renders the full-size original on demand at the output size, and drops it at Fit", async () => {
    const fake = fakeRenderer();
    const crop = { x: 5, y: 6, width: 3000, height: 2250 };
    show(fake.renderer, {
      edits: { crop, rotation: 0, ratio: "free", portrait: false, exact: null },
    });
    fireEvent.click(radio(t.full));
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(fake.calls[0]?.args.slice(1)).toEqual([
      { crop, rotation: 0, resize: null },
      { width: 2000, height: 1500 },
    ]);
    expect(screen.getByText(t.preparing)).toBeTruthy();
    await fake.finish({ status: "done", image: pixels(2000, 1500) });
    expect(screen.queryByText(t.preparing)).toBeNull();
    const full = screen.getByTestId("compare-full-original");
    expect([full.getAttribute("width"), full.getAttribute("height")]).toEqual(["2000", "1500"]);
    // 1:1: the box is exactly the output's pixels, inside a pannable, focusable viewport.
    const box = screen.getByTestId("compare-box");
    expect([box.style.width, box.style.height]).toEqual(["2000px", "1500px"]);
    expect(screen.getByTestId("compare-viewport").tabIndex).toBe(0);

    fireEvent.click(radio(t.fit));
    expect(screen.queryByTestId("compare-full-original")).toBeNull();
  });

  it("leaving 100 % or closing while it renders aborts the render (its worker is stopped)", () => {
    const fake = fakeRenderer();
    const { unmount } = show(fake.renderer);
    fireEvent.click(radio(t.full));
    fireEvent.click(radio(t.fit));
    expect(fake.calls[0]?.signal?.aborted).toBe(true);
    fireEvent.click(radio(t.full));
    unmount();
    expect(fake.calls[1]?.signal?.aborted).toBe(true);
  });

  it("a render error is explained and falls back to Fit", async () => {
    const fake = fakeRenderer();
    show(fake.renderer);
    fireEvent.click(radio(t.full));
    await fake.finish({ status: "error", code: "worker_crashed" });
    expect(screen.getByText(t.failed(strings.process.errors.worker_crashed.what))).toBeTruthy();
    expect(radio(t.fit)).toHaveProperty("checked", true);
  });
});
