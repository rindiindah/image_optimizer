import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";

// Refused files never reach the worker, so these run without one (jsdom has no Worker).
const svg = () => new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "logo.svg");
const empty = () => new File([], "empty.jpg");

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
});

const names = () => useQueue.getState().items.map((item) => item.name);

describe("adding images", () => {
  it("the file picker is labelled and adds the chosen files", async () => {
    render(<App />);
    const input = screen.getByLabelText<HTMLInputElement>(strings.upload.chooseButton);
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files: [svg(), empty()] } });
    await waitFor(() => {
      expect(names()).toEqual(["logo.svg", "empty.jpg"]);
    });
  });

  it("drag and drop onto the upload area adds files", async () => {
    render(<App />);
    const area = screen.getByRole("region", { name: strings.upload.heading });
    fireEvent.drop(area, { dataTransfer: { files: [svg()], types: ["Files"] } });
    await waitFor(() => {
      expect(names()).toEqual(["logo.svg"]);
    });
  });

  it("pasting files anywhere adds them", async () => {
    render(<App />);
    fireEvent.paste(window, { clipboardData: { files: [svg()] } });
    await waitFor(() => {
      expect(names()).toEqual(["logo.svg"]);
    });
  });

  it("pasting text (no files) adds nothing", () => {
    render(<App />);
    fireEvent.paste(window, { clipboardData: { files: [] } });
    expect(names()).toEqual([]);
  });

  it("announces the outcome to screen readers", async () => {
    render(<App />);
    fireEvent.paste(window, { clipboardData: { files: [svg(), empty()] } });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("2 couldn't be used.");
    });
  });
});
