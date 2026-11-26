import { existsSync } from "node:fs";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { HARNESS_PORT } from "../../playwright.config";
import type { EngineHarness, HarnessReport, HarnessRun } from "../harness/types";
import type { OptimizeSettings, SizeGoal } from "../../src/types/engine";

const HARNESS = `http://localhost:${String(HARNESS_PORT)}/`;
const PHOTO_24MP = "tests/fixtures/images/photo-24mp.jpg";

declare global {
  interface Window {
    __cspViolations?: string[];
    engineHarness?: EngineHarness;
  }
}

function settings(goal: SizeGoal, overrides: Partial<OptimizeSettings> = {}): OptimizeSettings {
  return {
    goal,
    format: "image/jpeg",
    minQuality: null,
    allowDimensionReduction: false,
    minDimensions: null,
    allowColorReduction: false,
    background: null,
    ...overrides,
  };
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
  const response = await page.goto(HARNESS);
  expect(response?.headers()["content-security-policy"]).toContain("'wasm-unsafe-eval'");
  await page.waitForFunction(() => window.engineHarness !== undefined);
}

/**
 * Playwright's WebKit build for Windows has no OffscreenCanvas (Safari ≥ 16.4 does), so the
 * full pipeline can't run there. Those tests are skipped with this reason, never faked.
 */
async function skipWithoutOffscreenCanvas(page: Page): Promise<void> {
  const supported = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
  test.skip(!supported, "this browser build has no OffscreenCanvas (Playwright WebKit on Windows)");
}

async function runEngine(page: Page, spec: HarnessRun): Promise<HarnessReport> {
  return page.evaluate((s) => {
    const harness = window.engineHarness;
    if (!harness) throw new Error("engine harness not loaded");
    return harness.run(s);
  }, spec);
}

async function expectNoViolations(page: Page, errors: string[]): Promise<void> {
  expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  expect(errors).toEqual([]);
}

const ascii = (bytes: number[]) => String.fromCharCode(...bytes);
const isJpeg = (h: number[]) => h[0] === 0xff && h[1] === 0xd8;
const isPng = (h: number[]) => h[0] === 0x89 && ascii(h.slice(1, 4)) === "PNG";
const isWebp = (h: number[]) => ascii(h.slice(0, 4)) === "RIFF" && ascii(h.slice(8, 12)) === "WEBP";

test.describe("engine (real codecs, production CSP)", () => {
  test("gate: every WASM codec loads and encodes under the CSP", async ({ page }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    const capabilities = await page.evaluate(() => {
      const harness = window.engineHarness;
      if (!harness) throw new Error("engine harness not loaded");
      return harness.capabilities();
    });
    expect(capabilities).toEqual([
      expect.objectContaining({ format: "image/jpeg", wasm: true }),
      expect.objectContaining({ format: "image/webp", wasm: true }),
      expect.objectContaining({ format: "image/png", wasm: true }),
    ]);
    await expectNoViolations(page, errors);
  });

  test("without OffscreenCanvas the engine reports unsupported_browser, never a result", async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    const supported = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
    test.skip(supported, "this browser has OffscreenCanvas; covered by the pipeline tests");
    // A 1×1 PNG (generating test images needs OffscreenCanvas, which is missing here).
    const report = await page.evaluate(async () => {
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ),
        (c) => c.charCodeAt(0),
      );
      const harness = window.engineHarness;
      if (!harness) throw new Error("engine harness not loaded");
      return harness.runBlob(new Blob([png], { type: "image/png" }));
    });
    expect(report).toMatchObject({ status: "error", code: "unsupported_browser", files: [] });
    await expectNoViolations(page, errors);
  });

  test("JPEG Maximum: the reported size is the real file size and fits the limit", async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const report = await runEngine(page, {
      source: {
        kind: "generated",
        width: 1600,
        height: 1200,
        transparent: false,
        type: "image/png",
      },
      settings: settings({ mode: "maximum", maxBytes: 200_000 }),
    });
    expect(report.status).toBe("done");
    expect(report.result?.outcome).toBe("met");
    const candidate = report.result?.candidates[0];
    const file = report.files[0];
    expect(candidate?.bytes).toBe(file?.size);
    expect(file?.size).toBeLessThanOrEqual(200_000);
    expect(file?.type).toBe("image/jpeg");
    expect(isJpeg(file?.head ?? [])).toBe(true);
    expect(report.result?.attempts).toBeLessThanOrEqual(8);
    await expectNoViolations(page, errors);
  });

  test("WebP Maximum and Target produce real WebP files (also in WebKit)", async ({ page }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const source = {
      kind: "generated",
      width: 1600,
      height: 1200,
      transparent: false,
      type: "image/png",
    } as const;

    const maximum = await runEngine(page, {
      source,
      settings: settings({ mode: "maximum", maxBytes: 150_000 }, { format: "image/webp" }),
    });
    expect(maximum.result?.outcome).toBe("met");
    expect(maximum.files[0]?.type).toBe("image/webp");
    expect(isWebp(maximum.files[0]?.head ?? [])).toBe(true);
    expect(maximum.files[0]?.size).toBeLessThanOrEqual(150_000);
    expect(maximum.result?.candidates[0]?.flags).not.toContain("format_fallback");

    const target = await runEngine(page, {
      source,
      settings: settings({ mode: "target", targetBytes: 150_000 }, { format: "image/webp" }),
    });
    expect(target.status).toBe("done");
    const candidates = target.result?.candidates ?? [];
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.length).toBeLessThanOrEqual(2);
    candidates.forEach((c, i) => {
      expect(c.bytes).toBe(target.files[i]?.size);
      expect(isWebp(target.files[i]?.head ?? [])).toBe(true);
    });
    if (target.result?.outcome !== "unreachable") {
      for (const c of candidates) expect(Math.abs(c.bytes - 150_000)).toBeLessThanOrEqual(15_000);
    }
    await expectNoViolations(page, errors);
  });

  test("PNG: colour reduction only when allowed, transparency kept", async ({ page }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const source = {
      kind: "generated",
      width: 800,
      height: 600,
      transparent: true,
      type: "image/png",
    } as const;

    const lossless = await runEngine(page, {
      source,
      settings: settings({ mode: "maximum", maxBytes: 50_000_000 }, { format: "image/png" }),
    });
    expect(lossless.result?.outcome).toBe("met");
    expect(isPng(lossless.files[0]?.head ?? [])).toBe(true);
    expect(lossless.result?.candidates[0]?.flags).not.toContain("colors_reduced");
    expect(lossless.result?.attempts).toBe(1);

    const reduced = await runEngine(page, {
      source,
      settings: settings(
        { mode: "maximum", maxBytes: Math.round((lossless.files[0]?.size ?? 0) / 3) },
        { format: "image/png", allowColorReduction: true },
      ),
    });
    expect(reduced.result?.outcome).toBe("met");
    expect(isPng(reduced.files[0]?.head ?? [])).toBe(true);
    expect(reduced.result?.candidates[0]?.flags).toContain("colors_reduced");
    expect(reduced.files[0]?.size).toBe(reduced.result?.candidates[0]?.bytes);
    await expectNoViolations(page, errors);
  });

  test("JPEG with transparency asks for a decision, then flattens onto the chosen background", async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const source = {
      kind: "generated",
      width: 400,
      height: 300,
      transparent: true,
      type: "image/png",
    } as const;
    const ask = await runEngine(page, {
      source,
      settings: settings({ mode: "maximum", maxBytes: 100_000 }),
    });
    expect(ask).toMatchObject({ status: "error", code: "transparency_needs_decision" });

    const flattened = await runEngine(page, {
      source,
      settings: settings({ mode: "maximum", maxBytes: 100_000 }, { background: "#ffffff" }),
    });
    expect(flattened.result?.candidates[0]?.flags).toContain("transparency_flattened");
    await expectNoViolations(page, errors);
  });

  test("native fallback: the MIME type is checked and format_fallback is set", async ({ page }) => {
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const report = await runEngine(page, {
      source: { kind: "generated", width: 800, height: 600, transparent: false, type: "image/png" },
      settings: settings({ mode: "maximum", maxBytes: 100_000 }),
      encoderPreference: "native",
    });
    expect(report.status).toBe("done");
    const candidate = report.result?.candidates[0];
    expect(candidate?.flags).toContain("format_fallback");
    expect(candidate?.mime).toBe(report.files[0]?.type);
    expect(candidate?.bytes).toBe(report.files[0]?.size);
    await expectNoViolations(page, errors);
  });

  test("24 MP photo reaches a 1 MB maximum within the budget", async ({ page }) => {
    test.skip(
      !existsSync(PHOTO_24MP),
      `fixture ${PHOTO_24MP} not added yet (owner approval pending)`,
    );
    test.setTimeout(180_000);
    const errors: string[] = [];
    await openHarness(page, errors);
    await skipWithoutOffscreenCanvas(page);
    const report = await runEngine(page, {
      source: { kind: "url", url: "images/photo-24mp.jpg" },
      settings: settings({ mode: "maximum", maxBytes: 1_000_000 }),
    });
    console.log(
      `[${test.info().project.name}] 24 MP → ${String(report.files[0]?.size)} B in ${String(report.ms)} ms, ` +
        `${String(report.result?.attempts)} encodes`,
    );
    expect(report.sourceWidth * report.sourceHeight).toBeGreaterThanOrEqual(20_000_000);
    expect(report.result?.outcome).toBe("met");
    expect(report.files[0]?.size).toBeLessThanOrEqual(1_000_000);
    expect(report.result?.candidates[0]?.bytes).toBe(report.files[0]?.size);
    expect(report.result?.attempts).toBeLessThanOrEqual(8);
    expect(report.ms).toBeLessThanOrEqual(60_000);
    await expectNoViolations(page, errors);
  });
});
