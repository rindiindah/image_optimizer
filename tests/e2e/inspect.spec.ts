/**
 * M2 Step 3: the engine worker inspects added files (real browsers, production CSP).
 * Metadata must be measured, not guessed: format from the bytes, dimensions after orientation,
 * transparency from the pixels. HEIC goes through the shared decode (browser, then libheif).
 */
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { HARNESS_PORT } from "../../playwright.config";
import type { EngineHarness, HarnessSource, InspectReport } from "../harness/types";
import { files, withExifOrientation } from "../unit/helpers/image-bytes";

const HARNESS = `http://localhost:${String(HARNESS_PORT)}/`;

declare global {
  interface Window {
    __cspViolations?: string[];
    engineHarness?: EngineHarness;
  }
}

async function openHarness(page: Page, errors: string[]): Promise<void> {
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
}

/** Playwright's WebKit on Windows has no OffscreenCanvas (D17): inspection can't run there. */
async function skipWithoutOffscreenCanvas(page: Page): Promise<void> {
  const supported = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
  test.skip(!supported, "this browser build has no OffscreenCanvas (Playwright WebKit on Windows)");
}

function inspect(page: Page, source: HarnessSource): Promise<InspectReport> {
  return page.evaluate((s) => {
    const harness = window.engineHarness;
    if (!harness) throw new Error("engine harness not loaded");
    return harness.inspect(s);
  }, source);
}

const heic = (name: string): HarnessSource => ({ kind: "url", url: `images/heic/${name}` });
const bytes = (data: Uint8Array, type: string): HarnessSource => ({
  kind: "bytes",
  bytes: Array.from(data),
  type,
});

async function expectClean(page: Page, errors: string[]): Promise<void> {
  expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  expect(errors).toEqual([]);
}

test.describe("inspect (engine worker, production CSP)", () => {
  test.setTimeout(120_000);

  test("without OffscreenCanvas, inspect reports unsupported_browser", async ({ page }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    const supported = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
    test.skip(supported, "this browser has OffscreenCanvas; covered by the other tests");
    const report = await inspect(page, bytes(files.staticGif(), "image/gif"));
    expect(report).toMatchObject({ status: "error", code: "unsupported_browser" });
    await expectClean(page, errors);
  });

  test("HEIC: iPhone photos, primary image, 10-bit notice, rotated once, corrupt file", async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);

    const iphone17 = await inspect(page, heic("iphone17pro-portrait.heic"));
    expect(iphone17.info).toEqual({
      format: "heic",
      mime: "image/heic",
      width: 3024,
      height: 4032,
      hasAlpha: false,
      notices: [],
    });
    expect(iphone17.thumbnail).toMatchObject({ type: "image/jpeg", width: 144, height: 192 });
    expect(iphone17.preview).toMatchObject({ type: "image/jpeg", width: 1536, height: 2048 });

    const iphone8 = await inspect(page, heic("iphone8plus-portrait.heic"));
    expect(iphone8.info).toMatchObject({ width: 3024, height: 4032, notices: [] });

    const multi = await inspect(page, heic("multi-image-burst.heic"));
    expect(multi.info).toMatchObject({ width: 1280, height: 960 });

    const tenBit = await inspect(page, heic("display-p3-10bit.heic"));
    expect(tenBit.info).toMatchObject({
      width: 1600,
      height: 1200,
      notices: [{ code: "hdr_converted" }],
    });

    const rotated = await inspect(page, heic("orientation-6.heic"));
    expect(rotated.info).toMatchObject({ width: 1200, height: 800 });

    const broken = await inspect(page, heic("broken-truncated.heic"));
    expect(broken).toMatchObject({ status: "error", code: "decode_failed" });

    test.info().annotations.push({
      type: "timings (ms)",
      description: `iPhone 17 Pro ${String(iphone17.ms)} · iPhone 8 Plus ${String(iphone8.ms)} · 10-bit ${String(tenBit.ms)}`,
    });
    await expectClean(page, errors);
  });

  test("JPEG, PNG with transparency, WebP, GIF and BMP: measured metadata", async ({ page }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);

    const jpeg = await inspect(page, {
      kind: "generated",
      width: 640,
      height: 480,
      transparent: false,
      type: "image/jpeg",
    });
    expect(jpeg.info).toEqual({
      format: "jpeg",
      mime: "image/jpeg",
      width: 640,
      height: 480,
      hasAlpha: false,
      notices: [],
    });

    const png = await inspect(page, {
      kind: "generated",
      width: 400,
      height: 300,
      transparent: true,
      type: "image/png",
    });
    expect(png.info).toMatchObject({ format: "png", width: 400, height: 300, hasAlpha: true });
    // Transparency stays visible in the previews.
    expect(png.thumbnail?.type).toBe("image/png");

    const opaquePng = await inspect(page, {
      kind: "generated",
      width: 400,
      height: 300,
      transparent: false,
      type: "image/png",
    });
    expect(opaquePng.info).toMatchObject({ format: "png", hasAlpha: false });

    const canEncodeWebp = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(1, 1);
      canvas.getContext("2d")?.fillRect(0, 0, 1, 1);
      const blob = await canvas.convertToBlob({ type: "image/webp" });
      return blob.type === "image/webp";
    });
    if (canEncodeWebp) {
      const webp = await inspect(page, {
        kind: "generated",
        width: 320,
        height: 240,
        transparent: false,
        type: "image/webp",
      });
      expect(webp.info).toMatchObject({ format: "webp", width: 320, height: 240, notices: [] });
    }

    const gif = await inspect(page, bytes(files.staticGif(), "image/gif"));
    expect(gif.info).toMatchObject({ format: "gif", width: 1, height: 1, notices: [] });

    const animated = await inspect(page, bytes(files.animatedGif(), "image/gif"));
    expect(animated.info).toMatchObject({ format: "gif", notices: [{ code: "first_frame_only" }] });

    const bmp = await inspect(page, bytes(files.bmp(5, 3), "image/bmp"));
    expect(bmp.info).toMatchObject({ format: "bmp", width: 5, height: 3, hasAlpha: false });
    await expectClean(page, errors);
  });

  test("EXIF orientation 6: width and height swapped, applied once", async ({ page }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const jpeg = await page.evaluate(() => {
      const harness = window.engineHarness;
      if (!harness) throw new Error("engine harness not loaded");
      return harness.bytesOf({
        kind: "generated",
        width: 300,
        height: 200,
        transparent: false,
        type: "image/jpeg",
      });
    });
    const report = await inspect(
      page,
      bytes(withExifOrientation(new Uint8Array(jpeg), 6), "image/jpeg"),
    );
    expect(report.info).toMatchObject({ format: "jpeg", width: 200, height: 300 });
    expect(report.thumbnail).toMatchObject({ width: 128, height: 192 });
    await expectClean(page, errors);
  });

  test("a renamed file is read by content; SVG, corrupt and empty images are refused", async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);

    // PNG bytes that the browser labels as JPEG (as a file named .jpg would be).
    const png = await page.evaluate(() => {
      const harness = window.engineHarness;
      if (!harness) throw new Error("engine harness not loaded");
      return harness.bytesOf({
        kind: "generated",
        width: 64,
        height: 48,
        transparent: true,
        type: "image/png",
      });
    });
    const renamed = await inspect(page, { kind: "bytes", bytes: png, type: "image/jpeg" });
    expect(renamed.info).toMatchObject({ format: "png", mime: "image/png", width: 64, height: 48 });

    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect(await inspect(page, bytes(svg, "image/svg+xml"))).toMatchObject({
      status: "error",
      code: "decode_failed",
    });

    // A PNG cut off right after its header (corrupt file).
    const truncated = new Uint8Array(png.slice(0, 40));
    expect(await inspect(page, bytes(truncated, "image/png"))).toMatchObject({
      status: "error",
      code: "decode_failed",
    });

    const empty = await inspect(page, {
      kind: "generated",
      width: 200,
      height: 100,
      transparent: true,
      type: "image/png",
      pattern: "empty",
    });
    expect(empty).toMatchObject({ status: "error", code: "blank_decode" });
    await expectClean(page, errors);
  });

  test("over 50 MP is refused with megapixel_limit; exactly at the limit is accepted", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const flat = (width: number, height: number): HarnessSource => ({
      kind: "generated",
      width,
      height,
      transparent: false,
      type: "image/png",
      pattern: "flat",
    });
    expect(await inspect(page, flat(10_001, 5_000))).toMatchObject({
      status: "error",
      code: "megapixel_limit",
    });
    const atLimit = await inspect(page, flat(10_000, 5_000));
    expect(atLimit.info).toMatchObject({ width: 10_000, height: 5_000 });
    await expectClean(page, errors);
  });

  test("shared decode: a HEIC can be optimized, and 10-bit sets hdr_tone_mapped", async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const settings = {
      goal: { mode: "maximum", maxBytes: 300_000 },
      format: "image/jpeg",
      minQuality: null,
      allowDimensionReduction: false,
      minDimensions: null,
      allowColorReduction: false,
      background: null,
    } as const;
    const run = (name: string) =>
      page.evaluate(
        ({ url, s }) => {
          const harness = window.engineHarness;
          if (!harness) throw new Error("engine harness not loaded");
          return harness.run({ source: { kind: "url", url }, settings: s });
        },
        { url: `images/heic/${name}`, s: settings },
      );

    const iphone = await run("iphone8plus-portrait.heic");
    expect(iphone.status).toBe("done");
    expect(iphone.result?.outcome).toBe("met");
    expect(iphone.result?.candidates[0]).toMatchObject({ width: 3024, height: 4032 });
    expect(iphone.result?.candidates[0]?.bytes).toBe(iphone.files[0]?.size);
    expect(iphone.result?.candidates[0]?.flags).not.toContain("hdr_tone_mapped");

    const tenBit = await run("display-p3-10bit.heic");
    expect(tenBit.result?.candidates[0]?.flags).toContain("hdr_tone_mapped");
    await expectClean(page, errors);
  });
});
