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

  it("has no interactive controls before they work (no placeholder UI)", () => {
    const { container } = render(<App />);

    expect(container.querySelectorAll("button, input, select, textarea, a[href]")).toHaveLength(0);
  });
});
