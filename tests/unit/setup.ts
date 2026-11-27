import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Only in jsdom (zip.test.ts runs in Node's environment, M6).
if (typeof window !== "undefined") {
  // jsdom has no canvas; the app's display-only drawing skips a missing context (M4).
  HTMLCanvasElement.prototype.getContext = () => null;

  // jsdom has no modal dialogs (M6 "Apply to selected"): open/close only, no top layer.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

afterEach(() => {
  cleanup();
});
