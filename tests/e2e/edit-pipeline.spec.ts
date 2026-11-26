/**
 * M4 exit criterion, in the real engine worker under the production CSP: the cropped output
 * matches the selection in source pixels exactly, for every rotation. A generated image
 * encodes each pixel's own (x, y), so every output pixel is checked against the source pixel
 * it must come from (computed independently of the worker's canvas transform).
 */
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { HARNESS_PORT } from "../../playwright.config";
import type {
  CropCheckReport,
  EngineHarness,
  HarnessReport,
  HarnessRun,
  HarnessSource,
  PixelsReport,
} from "../harness/types";
import type { ImageEdits, OptimizeSettings, Rotation } from "../../src/types/engine";
import { withExifOrientation } from "../unit/helpers/image-bytes";

const HARNESS = `http://localhost:${String(HARNESS_PORT)}/`;

declare global {
  interface Window {
    __cspViolations?: string[];
    engineHarness?: EngineHarness;
  }
}

/** Lossless PNG with a limit no file reaches: every pixel survives unchanged. */
const lossless: OptimizeSettings = {
  goal: { mode: "maximum", maxBytes: 1_000_000_000 },
  format: "image/png",
  minQuality: null,
  allowDimensionReduction: false,
  minDimensions: null,
  allowColorReduction: false,
  background: null,
};

async function open(page: Page, errors: string[]): Promise<void> {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations?.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto(HARNESS);
  await page.waitForFunction(() => window.engineHarness !== undefined);
  const supported = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
  test.skip(!supported, "this browser build has no OffscreenCanvas (Playwright WebKit on Windows)");
}

async function expectClean(page: Page, errors: string[]): Promise<void> {
  expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  expect(errors).toEqual([]);
}

const cropCheck = (page: Page, spec: HarnessRun): Promise<CropCheckReport> =>
  page.evaluate((s) => {
    if (!window.engineHarness) throw new Error("engine harness not loaded");
    return window.engineHarness.cropCheck(s);
  }, spec);

const runPixels = (
  page: Page,
  spec: HarnessRun,
  points: [number, number][],
): Promise<PixelsReport> =>
  page.evaluate(
    ([s, p]) => {
      if (!window.engineHarness) throw new Error("engine harness not loaded");
      return window.engineHarness.runPixels(s, p);
    },
    [spec, points] as const,
  );

const run = (page: Page, spec: HarnessRun): Promise<HarnessReport> =>
  page.evaluate((s) => {
    if (!window.engineHarness) throw new Error("engine harness not loaded");
    return window.engineHarness.run(s);
  }, spec);

const coords = (width: number, height: number): HarnessSource => ({
  kind: "generated",
  width,
  height,
  transparent: false,
  type: "image/png",
  pattern: "coords",
});

test.describe("crop, rotate, resize in the worker (M4)", () => {
  test.setTimeout(120_000);

  test("exit criterion: the crop is pixel-exact in source pixels, for every rotation", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    const crop = { x: 37, y: 21, width: 123, height: 77 };
    interface Case {
      edits: ImageEdits;
      size: [number, number];
    }
    const rotated = (rotation: Rotation): Case => ({
      edits: { crop, rotation, resize: null },
      size: rotation % 180 === 0 ? [123, 77] : [77, 123],
    });
    const cases: Case[] = [
      ...([0, 90, 180, 270] as const).map(rotated),
      // Rotation without a crop, and a crop touching the bottom-right corner.
      { edits: { crop: null, rotation: 90, resize: null }, size: [200, 300] },
      {
        edits: { crop: { x: 250, y: 150, width: 50, height: 50 }, rotation: 0, resize: null },
        size: [50, 50],
      },
    ];
    for (const { edits, size } of cases) {
      const check = await cropCheck(page, { source: coords(300, 200), settings: lossless, edits });
      const label = JSON.stringify(edits);
      expect(check.report.status, label).toBe("done");
      expect([check.width, check.height], label).toEqual(size);
      expect(check.mismatches, `${label} ${JSON.stringify(check.firstMismatch)}`).toBe(0);
      const candidate = check.report.result?.candidates[0];
      expect([candidate?.width, candidate?.height], label).toEqual(size);
      expect(candidate?.flags ?? [], label).not.toContain("dimensions_reduced");
    }
    await expectClean(page, errors);
  });

  test("resize after crop + rotate: output exactly the requested size, stepped downscale", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    const report = await run(page, {
      source: { kind: "generated", width: 800, height: 600, transparent: false, type: "image/png" },
      settings: { ...lossless, format: "image/jpeg" },
      edits: {
        crop: { x: 100, y: 100, width: 600, height: 400 },
        rotation: 90,
        resize: { width: 100, height: 150 },
      },
    });
    expect(report.status).toBe("done");
    expect(report.result?.candidates[0]).toMatchObject({ width: 100, height: 150 });
    await expectClean(page, errors);
  });

  test("EXIF orientation 6: the crop is taken from the image as displayed", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    // 300 × 200 stored: red | green over blue | white. Displayed (rotated 90°): 200 × 300 with
    // blue | red on top and white | green below.
    const jpeg = await page.evaluate(() => {
      if (!window.engineHarness) throw new Error("engine harness not loaded");
      return window.engineHarness.bytesOf({
        kind: "generated",
        width: 300,
        height: 200,
        transparent: false,
        type: "image/jpeg",
        pattern: "quadrants",
      });
    });
    const source: HarnessSource = {
      kind: "bytes",
      bytes: Array.from(withExifOrientation(new Uint8Array(jpeg), 6)),
      type: "image/jpeg",
    };
    // Top half of what is displayed → 200 × 150: blue left, red right.
    const top = await runPixels(
      page,
      {
        source,
        settings: lossless,
        edits: { crop: { x: 0, y: 0, width: 200, height: 150 }, rotation: 0, resize: null },
      },
      [
        [40, 75],
        [160, 75],
      ],
    );
    expect([top.width, top.height]).toEqual([200, 150]);
    const near = (got: number[] | undefined, rgb: number[]) =>
      rgb.every((value, i) => Math.abs((got?.[i] ?? -999) - value) <= 40);
    expect(near(top.colours[0], [0, 0, 255]), JSON.stringify(top.colours)).toBe(true);
    expect(near(top.colours[1], [255, 0, 0]), JSON.stringify(top.colours)).toBe(true);
    await expectClean(page, errors);
  });

  test("rotated HEIC: crop + rotate use the displayed size (rotated once)", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    // orientation-6.heic is displayed as 1200 × 800 (M2).
    const report = await run(page, {
      source: { kind: "url", url: "images/heic/orientation-6.heic" },
      settings: { ...lossless, format: "image/jpeg" },
      edits: { crop: { x: 1100, y: 700, width: 100, height: 100 }, rotation: 270, resize: null },
    });
    expect(report.status).toBe("done");
    expect(report.result?.candidates[0]).toMatchObject({ width: 100, height: 100 });
    const wide = await run(page, {
      source: { kind: "url", url: "images/heic/orientation-6.heic" },
      settings: { ...lossless, format: "image/jpeg" },
      edits: { crop: { x: 0, y: 0, width: 1200, height: 10 }, rotation: 90, resize: null },
    });
    expect(wide.result?.candidates[0]).toMatchObject({ width: 10, height: 1200 });
    await expectClean(page, errors);
  });

  test("edits that don't fit the image are refused, never guessed", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    const bad: ImageEdits[] = [
      { crop: { x: 250, y: 0, width: 51, height: 10 }, rotation: 0, resize: null }, // past the edge
      { crop: { x: 0, y: 0, width: 0, height: 10 }, rotation: 0, resize: null }, // zero width
      { crop: { x: 0.5, y: 0, width: 10, height: 10 }, rotation: 0, resize: null }, // not whole pixels
      { crop: null, rotation: 0, resize: { width: 301, height: 200 } }, // would enlarge
      { crop: null, rotation: 90, resize: { width: 300, height: 200 } }, // larger than 200 × 300
    ];
    for (const edits of bad) {
      const report = await run(page, { source: coords(300, 200), settings: lossless, edits });
      expect(report, JSON.stringify(edits)).toMatchObject({
        status: "error",
        code: "invalid_settings",
      });
    }
    await expectClean(page, errors);
  });
});
