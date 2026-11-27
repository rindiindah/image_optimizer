import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";
import { checkItem } from "../../src/features/settings/settings";
import { readyItem } from "./helpers/items";

const run = vi.hoisted(() => ({
  optimizeImages: vi.fn(),
  cancelImage: vi.fn(),
  cancelAll: vi.fn(),
}));
vi.mock("../../src/features/process/run", () => run);

const s = strings.settings;
const state = () => useQueue.getState();

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  URL.revokeObjectURL = vi.fn();
  run.optimizeImages.mockReset();
  run.cancelImage.mockReset();
});

/** Optimize queued image "a"; what the run will use is `checkItem` of it (M6). */
const sent = () => {
  expect(run.optimizeImages).toHaveBeenLastCalledWith(["a"]);
  const item = state().items.find((i) => i.id === "a");
  const check = item && checkItem(item);
  if (!check?.ok) throw new Error("settings aren't valid");
  return check;
};

const optimize = () => screen.getByRole("button", { name: strings.process.optimize });
const sizeInput = (label: string = s.sizeLabel.maximum) => screen.getByLabelText(label);
const type = (input: HTMLElement, value: string) => {
  fireEvent.change(input, { target: { value } });
};

describe("settings panel", () => {
  it("Maximum is the default; no size is pre-filled, so Optimize waits for one (Q2)", () => {
    state().add([readyItem("a", "photo.jpg")]);
    render(<App />);
    expect(screen.getByRole("radio", { name: new RegExp(s.modes.maximum.label) })).toHaveProperty(
      "checked",
      true,
    );
    expect(sizeInput()).toHaveProperty("value", "");
    expect(optimize()).toHaveProperty("disabled", true);
    expect(screen.getByText(strings.process.fixFirst)).toBeTruthy();
    // An empty field isn't shown as an error.
    expect(sizeInput().getAttribute("aria-invalid")).toBeNull();
  });

  it("every control is labelled, and mode help is tied to each mode", () => {
    state().add([readyItem("a", "photo.jpg")]);
    render(<App />);
    const maximum = screen.getByRole("radio", { name: new RegExp(s.modes.maximum.label) });
    expect(maximum.getAttribute("aria-describedby")).toBe("mode-maximum-help");
    expect(screen.getByLabelText(s.unitLabel(s.sizeLabel.maximum))).toBeTruthy();
    expect(screen.getByLabelText(s.formatLabel)).toHaveProperty("value", "image/jpeg");
    expect(screen.getByLabelText(s.minQualityLabel)).toBeTruthy();
    expect(screen.getByLabelText(s.allowDimensions)).toHaveProperty("checked", false);
    expect(screen.queryByLabelText(s.allowColors)).toBeNull(); // PNG only
  });

  it("an invalid size shows an inline error tied to its input", () => {
    state().add([readyItem("a", "photo.jpg")]);
    render(<App />);
    type(sizeInput(), "0.5");
    expect(sizeInput().getAttribute("aria-invalid")).toBe("true");
    expect(sizeInput().getAttribute("aria-describedby")).toBe("size-main-error");
    expect(screen.getByText(s.sizeErrors.too_small)).toBeTruthy();
    expect(optimize()).toHaveProperty("disabled", true);
  });

  it("a valid size shows the summary and starts the engine with the parsed settings", () => {
    state().add([readyItem("a", "photo.jpg")]);
    render(<App />);
    type(sizeInput(), "500");
    expect(screen.getByText(s.summary.maximum("500 KB"))).toBeTruthy();
    expect(screen.getByText(s.summary.format("JPEG"))).toBeTruthy();
    expect(screen.getByText(s.summary.dimensionsKept)).toBeTruthy();
    fireEvent.click(optimize());
    expect(sent()).toMatchObject({
      settings: {
        goal: { mode: "maximum", maxBytes: 500_000 },
        format: "image/jpeg",
        minQuality: null,
        allowDimensionReduction: false,
        minDimensions: null,
        allowColorReduction: false,
        background: null,
      },
      edits: { crop: null, rotation: 0, resize: null },
    });
  });

  it("output size: keep aspect ratio fills the other side; never above the image (M4)", () => {
    state().add([readyItem("a", "photo.jpg")]); // 4000 × 3000
    render(<App />);
    type(sizeInput(), "500");
    const width = screen.getByLabelText(s.resizeWidth);
    const height = screen.getByLabelText(s.resizeHeight);
    expect(width.getAttribute("placeholder")).toBe("4000");
    type(width, "1000");
    expect(height).toHaveProperty("value", "750");
    expect(screen.getByText(s.summary.output(1000, 750))).toBeTruthy();
    fireEvent.click(optimize());
    expect(sent().edits).toEqual({
      crop: null,
      rotation: 0,
      resize: { width: 1000, height: 750 },
    });

    type(width, "5000");
    expect(screen.getByText(s.resizeErrors.too_large(4000, 3000))).toBeTruthy();
    expect(optimize()).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText(s.keepAspect));
    type(width, "800");
    expect(height).toHaveProperty("value", "3750"); // unchanged without the link: too large
    type(height, "100");
    expect(screen.getByText(s.summary.output(800, 100))).toBeTruthy();
  });

  it("crop and rotation are summarised and sent with the run, in source pixels (M4)", () => {
    state().add([
      readyItem(
        "a",
        "photo.jpg",
        {},
        {
          edits: {
            crop: { x: 100, y: 200, width: 1200, height: 900 },
            rotation: 90,
            ratio: "free",
            portrait: false,
            exact: null,
          },
        },
      ),
    ]);
    render(<App />);
    type(sizeInput(), "500");
    expect(screen.getByText(s.summary.cropped(1200, 900))).toBeTruthy();
    expect(screen.getByText(s.summary.rotated(90))).toBeTruthy();
    expect(screen.getByText(s.summary.output(900, 1200))).toBeTruthy();
    expect(screen.getByLabelText(s.resizeWidth).getAttribute("placeholder")).toBe("900");
    fireEvent.click(optimize());
    expect(sent().edits).toEqual({
      crop: { x: 100, y: 200, width: 1200, height: 900 },
      rotation: 90,
      resize: null,
    });
  });

  it("Exact size sets the output size; the resize fields give way to it (M4 Q3)", () => {
    state().add([
      readyItem(
        "a",
        "photo.jpg",
        {},
        {
          edits: {
            crop: { x: 0, y: 0, width: 1200, height: 1600 },
            rotation: 0,
            ratio: "exact",
            portrait: false,
            exact: { width: 600, height: 800 },
          },
        },
      ),
    ]);
    render(<App />);
    type(sizeInput(), "500");
    expect(screen.queryByLabelText(s.resizeWidth)).toBeNull();
    expect(screen.getByText(s.resizeExact(600, 800))).toBeTruthy();
    fireEvent.click(optimize());
    expect(sent().edits).toEqual({
      crop: { x: 0, y: 0, width: 1200, height: 1600 },
      rotation: 0,
      resize: { width: 600, height: 800 },
    });
  });

  it("minimum size appears with 'Allow smaller dimensions' and goes to the engine (M4 Q6)", () => {
    state().add([readyItem("a", "photo.jpg")]);
    render(<App />);
    type(sizeInput(), "500");
    expect(screen.queryByLabelText(s.minWidth)).toBeNull();
    fireEvent.click(screen.getByLabelText(s.allowDimensions));
    type(screen.getByLabelText(s.minWidth), "800");
    type(screen.getByLabelText(s.minHeight), "600");
    expect(screen.getByText(s.summary.notBelow(800, 600))).toBeTruthy();
    fireEvent.click(optimize());
    expect(sent().settings).toMatchObject({
      allowDimensionReduction: true,
      minDimensions: { width: 800, height: 600 },
    });
    type(screen.getByLabelText(s.minWidth), "5000");
    expect(screen.getByText(s.minSizeErrors.too_large)).toBeTruthy();
    expect(optimize()).toHaveProperty("disabled", true);
  });

  it("Range shows a minimum and checks min < max", () => {
    state().add([readyItem("a", "photo.jpg")]);
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(s.modes.range.label) }));
    type(screen.getByLabelText(s.minLabel), "600");
    type(sizeInput(s.sizeLabel.range), "500");
    expect(screen.getByText(s.sizeErrors.min_not_below_max)).toBeTruthy();
    type(screen.getByLabelText(s.minLabel), "400");
    expect(screen.getByText(s.summary.range("400 KB", "500 KB"))).toBeTruthy();
    expect(optimize()).toHaveProperty("disabled", false);
  });

  it("a transparent image going to JPEG must get a fill colour first (never dropped silently)", () => {
    state().add([readyItem("a", "logo.gif", { format: "gif", hasAlpha: true })]);
    render(<App />);
    // Default for a transparent GIF is WebP, which keeps transparency (Q3).
    expect(screen.getByLabelText(s.formatLabel)).toHaveProperty("value", "image/webp");
    expect(screen.getByText(s.transparencyKept)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(s.formatLabel), { target: { value: "image/jpeg" } });
    type(sizeInput(), "100");
    const group = screen.getByRole("group", { name: s.transparencyLegend });
    expect(optimize()).toHaveProperty("disabled", true);
    fireEvent.click(within(group).getByLabelText(s.backgrounds["#ffffff"]));
    expect(screen.getByText(s.summary.transparencyFilled("white"))).toBeTruthy();
    expect(optimize()).toHaveProperty("disabled", false);
  });

  it("PNG: no minimum quality, colour reduction off by default, with an honest note", () => {
    state().add([readyItem("a", "logo.png", { format: "png", mime: "image/png" })]);
    render(<App />);
    expect(screen.queryByLabelText(s.minQualityLabel)).toBeNull();
    expect(screen.getByLabelText(s.allowColors)).toHaveProperty("checked", false);
    expect(screen.getByText(s.pngNote)).toBeTruthy();
  });

  it("an invalid minimum quality blocks the start", () => {
    state().add([readyItem("a", "photo.jpg")]);
    render(<App />);
    type(sizeInput(), "500");
    type(screen.getByLabelText(s.minQualityLabel), "150");
    expect(screen.getByText(s.minQualityError)).toBeTruthy();
    expect(optimize()).toHaveProperty("disabled", true);
  });

  it("while running: settings locked, honest attempt count, Cancel", () => {
    state().add([
      readyItem(
        "a",
        "photo.jpg",
        {},
        {
          job: { status: "running", progress: { phase: 1, attempt: 3, maxAttempts: 8 } },
        },
      ),
    ]);
    render(<App />);
    expect(screen.getByText("Attempt 3 of up to 8")).toBeTruthy();
    expect(sizeInput().matches(":disabled")).toBe(true); // inside the disabled fieldset
    fireEvent.click(screen.getByRole("button", { name: strings.process.cancel }));
    expect(run.cancelImage).toHaveBeenCalledWith("a");
  });

  it("another image running doesn't block Optimize; a queued image says it waits (M6)", () => {
    state().add([
      readyItem("a", "photo.jpg", {}, { job: { status: "running", progress: null } }),
      readyItem("b", "other.jpg"),
    ]);
    state().select("b");
    render(<App />);
    type(sizeInput(), "500");
    expect(optimize()).toHaveProperty("disabled", false);
    fireEvent.click(optimize());
    expect(run.optimizeImages).toHaveBeenLastCalledWith(["b"]);
    act(() => {
      state().queueJob("b");
    });
    expect(screen.getByText(strings.process.waiting)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: strings.process.cancel }));
    expect(run.cancelImage).toHaveBeenCalledWith("b");
  });

  it("an engine error says what happened, that the original is safe, and what next", () => {
    state().add([
      readyItem("a", "photo.jpg", {}, { job: { status: "error", code: "image_too_large" } }),
    ]);
    render(<App />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(strings.process.errors.image_too_large.what);
    expect(alert.textContent).toContain(strings.result.originalSafe);
    expect(alert.textContent).toContain(strings.process.errors.image_too_large.next);
  });

  it("settings are per image (Q1)", () => {
    state().add([readyItem("a", "photo.jpg"), readyItem("b", "other.jpg")]);
    render(<App />);
    type(sizeInput(), "500");
    fireEvent.click(screen.getByRole("button", { name: strings.queue.selectLabel("other.jpg") }));
    expect(sizeInput()).toHaveProperty("value", "");
  });
});
