import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { strings } from "../../src/content/strings";
import { useQueue } from "../../src/features/queue/store";
import type { Candidate, Flag, OptimizationResult, SizeGoal } from "../../src/types/engine";
import type { ItemResult } from "../../src/types/image";
import { readyItem } from "./helpers/items";

vi.mock("../../src/features/process/run", () => ({
  optimizeImage: vi.fn(),
  cancelOptimize: vi.fn(),
}));

const t = strings.result;

const cand = (
  bytes: number,
  side: "below" | "above",
  outcome: Candidate["outcome"],
  flags: Flag[] = [],
): Candidate => ({
  side,
  bytes,
  mime: "image/jpeg",
  width: 4000,
  height: 3000,
  quality: 72,
  outcome,
  flags,
});

function show(
  goal: SizeGoal,
  result: Omit<OptimizationResult, "mode" | "attempts">,
  patch: Partial<ItemResult> = {},
) {
  const r: OptimizationResult = { ...result, mode: goal.mode, attempts: 6 };
  useQueue.getState().add([
    readyItem(
      "a",
      "photo.jpg",
      {},
      {
        result: {
          result: r,
          goal,
          files: r.candidates.map(() => new Blob(["x"])),
          urls: r.candidates.map((_, i) => `blob:out-${String(i)}`),
          selected: r.selected,
          outdated: false,
          ...patch,
        },
      },
    ),
  ]);
  return render(<App />);
}

const target = (bytes: number): SizeGoal => ({ mode: "target", targetBytes: bytes });
const download = () => screen.queryByRole("link", { name: t.download });

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  URL.revokeObjectURL = vi.fn();
});

describe("result panel", () => {
  it("Maximum met: measured size (rounded up against the limit), saving, details, download", () => {
    show(
      { mode: "maximum", maxBytes: 500_000 },
      { outcome: "met", candidates: [cand(499_600, "below", "met")], selected: 0, closest: null },
    );
    expect(screen.getByText(t.status.maximumMet("500 KB", "500 KB"))).toBeTruthy();
    expect(screen.getByText("75% smaller")).toBeTruthy(); // 2 MB → 499.6 KB, rounded down
    expect(screen.getByText("4000 × 3000 px")).toBeTruthy();
    expect(screen.getByText("72", { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("img", { name: t.previewAlt }).getAttribute("src")).toBe("blob:out-0");
    const link = download();
    expect(link?.getAttribute("href")).toBe("blob:out-0");
    expect(link?.getAttribute("download")).toBe("photo-optimized.jpg");
  });

  it("a size over a target is never shown as if it fits (rounded up)", () => {
    show(target(1_000_000), {
      outcome: "close",
      candidates: [cand(1_000_400, "above", "met")],
      selected: 0,
      closest: null,
    });
    expect(
      screen.getByText(t.status.targetMet("1.01 MB", "less than 1% above the target")),
    ).toBeTruthy();
  });

  it("D14 case A: both candidates shown, the nearer preselected; switching changes the download", () => {
    show(target(100_000), {
      outcome: "met",
      candidates: [cand(93_000, "below", "close"), cand(101_000, "above", "met")],
      selected: 1,
      closest: null,
    });
    const radios = screen.getAllByRole("radio", { name: /the target/ });
    expect(radios).toHaveLength(2);
    expect(radios[1]).toHaveProperty("checked", true);
    expect(screen.getByText(t.status.targetMet("101 KB", "1% above the target"))).toBeTruthy();
    expect(download()?.getAttribute("href")).toBe("blob:out-1");

    fireEvent.click(screen.getByRole("radio", { name: /below the target/ }));
    expect(screen.getByText(t.status.targetClose("93 KB", "7% below the target"))).toBeTruthy();
    expect(download()?.getAttribute("href")).toBe("blob:out-0");
    expect(useQueue.getState().items[0]?.result?.selected).toBe(0);
  });

  it("D14 case B / B′: only one candidate, no choice offered", () => {
    show(target(100_000), {
      outcome: "close",
      candidates: [cand(92_000, "below", "close")],
      selected: 0,
      closest: null,
    });
    expect(screen.queryByRole("group", { name: t.choose })).toBeNull();
    expect(screen.getByText(t.status.targetClose("92 KB", "8% below the target"))).toBeTruthy();
    expect(download()).toBeTruthy();
  });

  it("D14 case C: 'Target not reached. Closest result: …' and the file still downloads", () => {
    show(target(1_000_000), {
      outcome: "unreachable",
      candidates: [cand(1_150_000, "above", "unreachable")],
      selected: 0,
      closest: null,
    });
    expect(
      screen.getByText("Target not reached. Closest result: 1.15 MB (15% above the target)."),
    ).toBeTruthy();
    expect(download()).toBeTruthy();
  });

  it("Maximum unreachable: no download, the closest attempt as info, next steps", () => {
    show(
      { mode: "maximum", maxBytes: 100_000 },
      {
        outcome: "unreachable",
        candidates: [],
        selected: null,
        closest: cand(100_400, "below", "unreachable"),
      },
    );
    expect(screen.getByText(t.status.maximumMissed("100 KB"))).toBeTruthy();
    expect(screen.getByText(t.status.closest("101 KB"))).toBeTruthy(); // rounded up: never "fits"
    expect(screen.getByText(t.next.maximum)).toBeTruthy();
    expect(screen.getByText(t.originalSafe)).toBeTruthy();
    expect(download()).toBeNull();
    expect(screen.queryByRole("img", { name: t.previewAlt })).toBeNull();
  });

  it("Range below the minimum: no upscaling, no download, rounded down against the minimum", () => {
    show(
      { mode: "range", minBytes: 500_000, maxBytes: 600_000 },
      {
        outcome: "unreachable",
        candidates: [],
        selected: null,
        closest: cand(499_600, "below", "unreachable"),
      },
    );
    expect(screen.getByText(t.status.rangeBelow)).toBeTruthy();
    expect(screen.getByText(t.status.closest("499 KB"))).toBeTruthy();
    expect(screen.getByText(t.next.rangeBelow)).toBeTruthy();
    expect(download()).toBeNull();
  });

  it("every flag is explained in plain words", () => {
    const flags: Flag[] = [
      "dimensions_reduced",
      "quality_floor_reached",
      "format_fallback",
      "transparency_flattened",
      "colors_reduced",
      "larger_than_source",
      "hdr_tone_mapped",
    ];
    show(
      { mode: "maximum", maxBytes: 3_000_000 },
      {
        outcome: "met",
        candidates: [{ ...cand(2_100_000, "below", "met", flags), mime: "image/png" }],
        selected: 0,
        closest: null,
      },
    );
    for (const flag of flags) expect(screen.getByText(t.flags[flag])).toBeTruthy();
    expect(screen.getByText("5% larger")).toBeTruthy();
    // After a fallback the real format is shown and used for the name.
    expect(screen.getByText("PNG", { selector: "dd" })).toBeTruthy();
    expect(download()?.getAttribute("download")).toBe("photo-optimized.png");
  });

  it("an outdated result is labelled and can't be downloaded (Q8)", () => {
    show(
      { mode: "maximum", maxBytes: 500_000 },
      { outcome: "met", candidates: [cand(400_000, "below", "met")], selected: 0, closest: null },
      { outdated: true },
    );
    expect(screen.getByText(t.outdated)).toBeTruthy();
    expect(download()).toBeNull();
    expect(screen.getByRole("button", { name: t.download })).toHaveProperty("disabled", true);
  });

  it("changing a setting after a result marks it outdated in the UI", () => {
    show(
      { mode: "maximum", maxBytes: 500_000 },
      { outcome: "met", candidates: [cand(400_000, "below", "met")], selected: 0, closest: null },
    );
    expect(screen.queryByText(t.outdated)).toBeNull();
    fireEvent.change(screen.getByLabelText(strings.settings.sizeLabel.maximum), {
      target: { value: "300" },
    });
    expect(screen.getByText(t.outdated)).toBeTruthy();
    expect(download()).toBeNull();
  });
});
