import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no canvas; the app's display-only drawing skips a missing context (M4).
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
});
