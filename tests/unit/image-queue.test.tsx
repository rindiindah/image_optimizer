import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";
import type { QueueItem } from "../../src/types/image";

const revoke = vi.fn();

const base = (id: string, name: string): QueueItem => ({
  id,
  file: new File(["x"], name),
  name,
  extension: name.split(".").pop() ?? "",
  sizeBytes: 1_169_044,
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
});

const ready: QueueItem = {
  ...base("a", "flower.heic"),
  status: "ready",
  thumbnailUrl: "blob:thumb-a",
  previewUrl: "blob:preview-a",
  metadata: {
    name: "flower.heic",
    format: "heic",
    mime: "image/heic",
    extension: "heic",
    sizeBytes: 1_169_044,
    width: 3024,
    height: 4032,
    hasAlpha: false,
    notices: [{ code: "hdr_converted" }],
  },
};
const renamed: QueueItem = {
  ...base("b", "photo.jpg"),
  sizeBytes: 2_000,
  status: "ready",
  thumbnailUrl: "blob:thumb-b",
  previewUrl: "blob:preview-b",
  metadata: {
    name: "photo.jpg",
    format: "png",
    mime: "image/png",
    extension: "jpg",
    sizeBytes: 2_000,
    width: 64,
    height: 48,
    hasAlpha: true,
    notices: [{ code: "extension_mismatch", extension: "jpg" }],
  },
};
const failed: QueueItem = { ...base("c", "logo.svg"), status: "error", error: "svg_not_supported" };
const reading: QueueItem = base("d", "<img src=x onerror=alert(1)>.png");

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  revoke.mockReset();
  URL.revokeObjectURL = revoke;
  useQueue.getState().add([ready, renamed, failed, reading]);
});

const row = (name: string) =>
  screen
    .getByRole("button", { name: strings.queue.selectLabel(name) })
    .closest("li") as HTMLElement;

describe("image list", () => {
  it("shows name, type, size, dimensions and status for each image", () => {
    render(<App />);
    const flower = within(row("flower.heic"));
    expect(flower.getByText("HEIC · 1.17 MB · 3024 × 4032 px")).toBeTruthy();
    expect(flower.getByText(strings.queue.status.ready)).toBeTruthy();
    expect(flower.getByText(strings.notices.hdr_converted)).toBeTruthy();
    expect(within(row("logo.svg")).getByText(strings.queue.status.error)).toBeTruthy();
    expect(screen.getByText(strings.queue.count(4))).toBeTruthy();
  });

  it("a renamed file shows its real type, transparency and a notice", () => {
    render(<App />);
    const photo = within(row("photo.jpg"));
    expect(photo.getByText(`PNG · 2 KB · 64 × 48 px · ${strings.queue.transparent}`)).toBeTruthy();
    expect(photo.getByText(strings.notices.extension_mismatch("PNG", "jpg"))).toBeTruthy();
  });

  it("an error says what happened, that the original is safe, and what to do next", () => {
    render(<App />);
    const svg = within(row("logo.svg"));
    expect(svg.getByText(strings.imageErrors.svg_not_supported.what)).toBeTruthy();
    expect(svg.getByText(strings.imageErrors.originalSafe)).toBeTruthy();
    expect(svg.getByText(strings.imageErrors.svg_not_supported.next)).toBeTruthy();
  });

  it("names are shown as text, never as HTML", () => {
    const { container } = render(<App />);
    expect(screen.getByText("<img src=x onerror=alert(1)>.png")).toBeTruthy();
    expect(container.querySelector("img[src='x']")).toBeNull();
  });

  it("selecting an image shows its preview; the selection is not shown by colour alone", () => {
    render(<App />);
    const flower = screen.getByRole("button", { name: strings.queue.selectLabel("flower.heic") });
    expect(flower.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: strings.preview.alt("flower.heic") })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: strings.queue.selectLabel("photo.jpg") }));
    expect(flower.getAttribute("aria-pressed")).toBe("false");
    const preview = screen.getByRole("img", { name: strings.preview.alt("photo.jpg") });
    expect(preview.getAttribute("src")).toBe("blob:preview-b");
  });

  it("remove takes the image out of the list and releases its previews", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: strings.queue.removeLabel("flower.heic") }));
    expect(
      screen.queryByRole("button", { name: strings.queue.selectLabel("flower.heic") }),
    ).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:thumb-a");
    expect(revoke).toHaveBeenCalledWith("blob:preview-a");
    // The next image becomes selected.
    expect(
      screen
        .getByRole("button", { name: strings.queue.selectLabel("photo.jpg") })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("removing every image returns to the empty workspace", () => {
    render(<App />);
    for (const name of [
      "flower.heic",
      "photo.jpg",
      "logo.svg",
      "<img src=x onerror=alert(1)>.png",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: strings.queue.removeLabel(name) }));
    }
    expect(
      screen.getByRole("heading", { level: 1, name: strings.workspace.emptyHeading }),
    ).toBeTruthy();
  });

  it("output settings appear only once an image is ready (none while reading or failed)", () => {
    const { container } = render(<App />);
    const settingsShown = () => screen.queryByRole("region", { name: strings.settings.heading });
    for (const name of ["logo.svg", "<img src=x onerror=alert(1)>.png"]) {
      fireEvent.click(screen.getByRole("button", { name: strings.queue.selectLabel(name) }));
      expect(settingsShown()).toBeNull();
      expect(container.querySelectorAll("select, textarea, input:not([type=file])")).toHaveLength(
        0,
      );
      expect(screen.queryByRole("button", { name: /optimi[sz]e|download/i })).toBeNull();
    }
    // The selected image finishes reading: its settings (with defaults) appear.
    act(() => {
      useQueue
        .getState()
        .setReady(
          "d",
          { format: "png", mime: "image/png", width: 8, height: 8, hasAlpha: false, notices: [] },
          "blob:t-d",
          "blob:p-d",
        );
    });
    expect(settingsShown()).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.process.optimize })).toBeTruthy();
    expect(screen.getByLabelText(strings.settings.formatLabel)).toHaveProperty(
      "value",
      "image/png",
    );
  });
});
