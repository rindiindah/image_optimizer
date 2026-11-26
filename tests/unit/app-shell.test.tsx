import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";

describe("App shell", () => {
  it("renders the header, main and footer landmarks", () => {
    render(<App />);

    expect(screen.getByRole("banner").textContent).toContain(strings.app.name);
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("contentinfo").textContent).toContain(strings.footer.licence);
  });

  it("shows an honest empty workspace", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: strings.workspace.emptyHeading }),
    ).toBeTruthy();
    expect(screen.getByText(strings.workspace.notYetAvailable)).toBeTruthy();
    expect(screen.getByText(strings.workspace.privacy)).toBeTruthy();
  });

  it("the empty page has only the upload control (settings appear once an image is ready)", () => {
    const { container } = render(<App />);

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      strings.upload.chooseButton,
    ]);
    const inputs = [...container.querySelectorAll("input, select, textarea")];
    expect(inputs.map((i) => i.getAttribute("type"))).toEqual(["file"]);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
  });
});
