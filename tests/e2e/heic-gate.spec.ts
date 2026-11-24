/**
 * M2 Step 1 gate: libheif-js decodes HEIC in our worker under the unchanged production CSP,
 * returns the primary image only, and its chunk is downloaded only when a HEIC file is decoded.
 * libheif needs no OffscreenCanvas, so this runs in all three engines, WebKit on Windows too.
 */
import { expect, test, type Page } from "@playwright/test";
import { HARNESS_PORT } from "../../playwright.config";
import type { EngineHarness, HeicSpikeReport } from "../harness/types";

const HARNESS = `http://localhost:${String(HARNESS_PORT)}/`;

declare global {
  interface Window {
    __cspViolations?: string[];
    engineHarness?: EngineHarness;
  }
}

async function openHarness(page: Page, errors: string[], requests: string[]): Promise<void> {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.context().on("request", (r) => requests.push(r.url()));
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

function decode(page: Page, fixture: string): Promise<HeicSpikeReport> {
  return page.evaluate((url) => {
    const harness = window.engineHarness;
    if (!harness) throw new Error("engine harness not loaded");
    return harness.heicSpike(url);
  }, `/images/heic/${fixture}`);
}

const isLibheifChunk = (url: string) => /libheif/i.test(url);

test.describe("M2 gate: libheif-js under the production CSP", () => {
  test.setTimeout(90_000);

  test("decodes real iPhone, multi-image, 10-bit and rotated HEIC; lazy; 0 violations", async ({
    page,
  }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    await openHarness(page, errors, requests);
    expect(requests.filter(isLibheifChunk)).toEqual([]);

    const iphone17 = await decode(page, "iphone17pro-portrait.heic");
    expect(requests.filter(isLibheifChunk).length).toBeGreaterThan(0);
    // Stored 4032×3024 with irot 270° → portrait. libheif applies the transform itself.
    expect(iphone17).toMatchObject({ status: "done", width: 3024, height: 4032, nonBlank: true });

    const iphone8 = await decode(page, "iphone8plus-portrait.heic");
    expect(iphone8).toMatchObject({ status: "done", width: 3024, height: 4032, nonBlank: true });

    // Four top-level images; the primary (pitm) is the third one.
    const multi = await decode(page, "multi-image-burst.heic");
    expect(multi).toMatchObject({
      status: "done",
      width: 1280,
      height: 960,
      topLevelImages: 4,
      primaryIndex: 2,
    });

    const tenBit = await decode(page, "display-p3-10bit.heic");
    expect(tenBit).toMatchObject({ status: "done", width: 1600, height: 1200, nonBlank: true });

    // Stored 800×1200, irot 270° → 1200×800 (rotated once, by libheif).
    const rotated = await decode(page, "orientation-6.heic");
    expect(rotated).toMatchObject({ status: "done", width: 1200, height: 800 });

    const broken = await decode(page, "broken-truncated.heic");
    expect(broken).toMatchObject({ status: "error", error: "HeicDecodeError" });

    test.info().annotations.push({
      type: "timings (ms)",
      description: `iPhone 17 Pro ${String(iphone17.ms)} (incl. first load) · iPhone 8 Plus ${String(iphone8.ms)} · multi ${String(multi.ms)} · 10-bit ${String(tenBit.ms)} · rotated ${String(rotated.ms)}`,
    });
    expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
    expect(errors).toEqual([]);
  });
});
