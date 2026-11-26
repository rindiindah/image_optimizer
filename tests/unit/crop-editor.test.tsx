import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";
import type { EditSettings } from "../../src/types/image";
import { readyItem } from "./helpers/items";

vi.mock("../../src/features/process/run", () => ({
  optimizeImage: vi.fn(),
  cancelOptimize: vi.fn(),
}));

const t = strings.edit;
const state = () => useQueue.getState();
const edits = () => state().items[0]?.edits;

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  URL.revokeObjectURL = vi.fn();
});

/** A 4000 × 3000 image, editor opened. */
function openEditor(patch: Partial<EditSettings> = {}) {
  state().add([
    readyItem(
      "a",
      "photo.jpg",
      {},
      {
        edits: { crop: null, rotation: 0, ratio: "free", portrait: false, exact: null, ...patch },
      },
    ),
  ]);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: strings.preview.edit }));
}

const field = (label: string) => screen.getByLabelText(label, { exact: true });
const type = (label: string, value: string) => {
  fireEvent.change(field(label), { target: { value } });
};
const values = () => [t.x, t.y, t.width, t.height].map((l) => (field(l) as HTMLInputElement).value);
const apply = () => screen.getByRole("button", { name: t.apply });

describe("crop editor (M4)", () => {
  it("opens with labelled controls, focus on its heading, the whole image selected", () => {
    openEditor();
    const heading = screen.getByRole("heading", { name: t.heading });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByLabelText(t.ratioLabel)).toHaveProperty("value", "free");
    for (const name of [t.rotateLeft, t.rotateRight, t.apply, t.cancel, t.reset]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("img", { name: t.imageLabel })).toBeTruthy();
    expect(values()).toEqual(["0", "0", "4000", "3000"]);
    expect(screen.getByText(t.whole(4000, 3000))).toBeTruthy();
  });

  it("typed fields set an exact crop in source pixels; Apply stores it and labels the preview", () => {
    openEditor();
    type(t.x, "100");
    type(t.y, "200");
    type(t.width, "1200");
    type(t.height, "900");
    expect(screen.getByText(t.selected(1200, 900))).toBeTruthy();
    fireEvent.click(apply());
    expect(edits()?.crop).toEqual({ x: 100, y: 200, width: 1200, height: 900 });
    // Back on the preview: the edited view, labelled, with Show original.
    expect(screen.queryByRole("heading", { name: t.heading })).toBeNull();
    expect(screen.getByRole("img", { name: strings.preview.editedAlt("photo.jpg") })).toBeTruthy();
    expect(
      screen.getByText(strings.preview.edited(strings.queue.dimensions(1200, 900), 0)),
    ).toBeTruthy();
    const original = screen.getByRole("button", { name: strings.preview.showOriginal });
    fireEvent.click(original);
    expect(original.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: strings.preview.alt("photo.jpg") })).toBeTruthy();
  });

  it("a selection outside the image can't be applied, and says why", () => {
    openEditor();
    type(t.x, "3999"); // with width 4000 it no longer fits
    expect(screen.getByText(t.fieldError(4000, 3000))).toBeTruthy();
    expect(field(t.x).getAttribute("aria-invalid")).toBe("true");
    expect(apply()).toHaveProperty("disabled", true);
    type(t.width, "1");
    expect(screen.queryByText(t.fieldError(4000, 3000))).toBeNull();
    expect(apply()).toHaveProperty("disabled", false);
    type(t.width, "0");
    expect(apply()).toHaveProperty("disabled", true);
  });

  it("rotating keeps the crop on the same content (Q2); stored un-rotated", () => {
    openEditor();
    type(t.x, "100");
    type(t.y, "200");
    type(t.width, "1200");
    type(t.height, "900");
    fireEvent.click(screen.getByRole("button", { name: t.rotateRight }));
    // Shown image is now 3000 × 4000; the same area is at x = 3000 − (200 + 900), y = 100.
    expect(values()).toEqual(["1900", "100", "900", "1200"]);
    fireEvent.click(apply());
    expect(edits()).toMatchObject({
      crop: { x: 100, y: 200, width: 1200, height: 900 },
      rotation: 90,
    });
  });

  it("rotate left from no crop: the whole image, rotated 270°", () => {
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: t.rotateLeft }));
    expect(screen.getByText(t.whole(3000, 4000))).toBeTruthy();
    fireEvent.click(apply());
    expect(edits()).toMatchObject({ crop: null, rotation: 270 });
  });

  it("a ratio fits the largest centred selection; portrait flips it (Q4)", () => {
    openEditor();
    fireEvent.change(screen.getByLabelText(t.ratioLabel), { target: { value: "1:1" } });
    expect(values()).toEqual(["500", "0", "3000", "3000"]);
    fireEvent.change(screen.getByLabelText(t.ratioLabel), { target: { value: "16:9" } });
    expect(values()).toEqual(["0", "375", "4000", "2250"]); // largest 16:9 in the whole image
    fireEvent.click(screen.getByLabelText(t.portrait));
    expect(values()).toEqual(["1156", "0", "1688", "3000"]); // 9:16
    // With a fixed shape, typing one side sets the other.
    type(t.width, "900");
    expect(values()[3]).toBe("1600");
  });

  it("Exact size: shape locked, refused when larger than the selection (Q3)", () => {
    openEditor();
    fireEvent.change(screen.getByLabelText(t.ratioLabel), { target: { value: "exact" } });
    expect(apply()).toHaveProperty("disabled", true); // no size yet
    type(t.exactWidth, "600");
    type(t.exactHeight, "800");
    expect(values()).toEqual(["875", "0", "2250", "3000"]); // 3:4, centred
    fireEvent.click(apply());
    expect(edits()).toMatchObject({ ratio: "exact", exact: { width: 600, height: 800 } });

    fireEvent.click(screen.getByRole("button", { name: strings.preview.edit }));
    type(t.exactWidth, "6000");
    type(t.exactHeight, "8000");
    expect(screen.getByText(t.exactTooLarge(2250, 3000))).toBeTruthy();
    expect(apply()).toHaveProperty("disabled", true);
  });

  it("Cancel keeps the applied edits; Reset goes back to no crop, no rotation", () => {
    openEditor({ crop: { x: 10, y: 10, width: 100, height: 100 }, rotation: 180 });
    type(t.width, "50");
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(edits()).toMatchObject({
      crop: { x: 10, y: 10, width: 100, height: 100 },
      rotation: 180,
    });

    fireEvent.click(screen.getByRole("button", { name: strings.preview.edit }));
    fireEvent.click(screen.getByRole("button", { name: t.reset }));
    expect(screen.getByText(t.whole(4000, 3000))).toBeTruthy();
    fireEvent.click(apply());
    expect(edits()).toMatchObject({ crop: null, rotation: 0, ratio: "free" });
  });

  it("applying an edit after a result marks the result outdated", () => {
    state().add([
      readyItem(
        "a",
        "photo.jpg",
        {},
        {
          result: {
            result: {
              mode: "maximum",
              outcome: "met",
              candidates: [
                {
                  side: "below",
                  bytes: 1,
                  mime: "image/jpeg",
                  width: 4000,
                  height: 3000,
                  quality: 80,
                  outcome: "met",
                  flags: [],
                },
              ],
              selected: 0,
              closest: null,
              attempts: 1,
            },
            goal: { mode: "maximum", maxBytes: 10 },
            files: [new Blob(["x"])],
            urls: ["blob:r"],
            selected: 0,
            outdated: false,
          },
        },
      ),
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: strings.preview.edit }));
    fireEvent.click(screen.getByRole("button", { name: t.rotateRight }));
    fireEvent.click(apply());
    expect(screen.getByText(strings.result.outdated)).toBeTruthy();
  });

  it("while the image is processing, editing is disabled and says why", () => {
    state().add([readyItem("a", "photo.jpg", {}, { job: { status: "running", progress: null } })]);
    render(<App />);
    expect(screen.getByRole("button", { name: strings.preview.edit })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(strings.preview.editBusy)).toBeTruthy();
  });

  it("removing the image while its editor is open closes the editor", () => {
    openEditor();
    const list = screen.getByRole("region", { name: strings.queue.heading });
    fireEvent.click(
      within(list).getByRole("button", { name: strings.queue.removeLabel("photo.jpg") }),
    );
    expect(screen.queryByRole("heading", { name: t.heading })).toBeNull();
  });
});
