import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";
import { readyItem } from "./helpers/items";

const run = vi.hoisted(() => ({ optimizeImage: vi.fn(), cancelOptimize: vi.fn() }));
vi.mock("../../src/features/process/run", () => run);

const s = strings.settings;
const state = () => useQueue.getState();

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  URL.revokeObjectURL = vi.fn();
  run.optimizeImage.mockReset();
  run.cancelOptimize.mockReset();
});

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
    expect(run.optimizeImage).toHaveBeenCalledWith("a", {
      goal: { mode: "maximum", maxBytes: 500_000 },
      format: "image/jpeg",
      minQuality: null,
      allowDimensionReduction: false,
      minDimensions: null,
      allowColorReduction: false,
      background: null,
    });
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
    expect(run.cancelOptimize).toHaveBeenCalled();
  });

  it("another image running: Optimize explains why it waits", () => {
    state().add([
      readyItem("a", "photo.jpg", {}, { job: { status: "running", progress: null } }),
      readyItem("b", "other.jpg"),
    ]);
    state().select("b");
    render(<App />);
    type(sizeInput(), "500");
    expect(optimize()).toHaveProperty("disabled", true);
    expect(screen.getByText(strings.process.otherRunning)).toBeTruthy();
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
