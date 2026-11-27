import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";
import { readyItem } from "./helpers/items";

vi.mock("../../src/features/process/run", () => ({
  optimizeImages: vi.fn(),
  cancelImage: vi.fn(),
  cancelAll: vi.fn(),
}));

const t = strings.apply;
const state = () => useQueue.getState();
const settingsOf = (id: string) => state().items.find((i) => i.id === id)?.settings;

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  URL.revokeObjectURL = vi.fn();
});

describe("Apply to selected images (D23 Q2)", () => {
  it("only offered when other images are selected", () => {
    state().add([readyItem("a", "a.jpg"), readyItem("b", "b.jpg")]);
    state().setAllChecked(["a"]); // only the open image itself
    render(<App />);
    expect(screen.queryByRole("button", { name: t.open })).toBeNull();
  });

  it("says what gets overwritten and what never is; applies the ticked groups", () => {
    state().add([
      readyItem("a", "a.jpg"),
      readyItem("b", "b.jpg"),
      readyItem("r", "r.jpg", {}, { job: { status: "running", progress: null } }),
    ]);
    state().updateSettings("a", { size: { text: "250", unit: "KB" }, format: "image/webp" });
    state().setAllChecked(["a", "b", "r"]);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    const dialog = within(screen.getByRole("dialog", { name: t.heading }));
    expect(dialog.getByText(t.intro("a.jpg", 2))).toBeTruthy();
    expect(dialog.getByText(t.never)).toBeTruthy();
    expect(dialog.getByText(t.running(1))).toBeTruthy();
    expect(dialog.getByText(t.outdated)).toBeTruthy();
    for (const group of ["size", "format", "more"] as const) {
      expect(dialog.getByLabelText(t.groups[group])).toHaveProperty("checked", true);
    }
    fireEvent.click(dialog.getByLabelText(t.groups.format)); // untick Format
    fireEvent.click(dialog.getByRole("button", { name: t.apply }));

    expect(settingsOf("b")?.size).toEqual({ text: "250", unit: "KB" });
    expect(settingsOf("b")?.format).toBe("image/jpeg"); // Format wasn't ticked
    expect(settingsOf("r")?.size.text).toBe(""); // running: left alone
    expect(state().announcement).toBe(t.applied(1));
  });

  it("Apply is disabled with no group ticked; Cancel changes nothing", () => {
    state().add([readyItem("a", "a.jpg"), readyItem("b", "b.jpg")]);
    state().updateSettings("a", { size: { text: "250", unit: "KB" } });
    state().setAllChecked(["b"]);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    const dialog = within(screen.getByRole("dialog", { name: t.heading }));
    for (const group of ["size", "format", "more"] as const) {
      fireEvent.click(dialog.getByLabelText(t.groups[group]));
    }
    expect(dialog.getByRole("button", { name: t.apply })).toHaveProperty("disabled", true);
    fireEvent.click(dialog.getByRole("button", { name: t.cancel }));
    expect(settingsOf("b")?.size.text).toBe("");
  });
});
