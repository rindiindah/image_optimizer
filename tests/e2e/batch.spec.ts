/**
 * M6: several images in the real app (production build + CSP): apply to selected, a batch with a
 * real engine failure, two jobs at once, cancel one, retry, and the ZIP checked byte for byte
 * (read back with fflate, not the library that wrote it). Needs OffscreenCanvas: skips on
 * Playwright WebKit for Windows (D17).
 */
import { readFileSync } from "node:fs";
import { type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { expect, test } from "./fixtures";
import { strings } from "../../src/content/strings";

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

const s = strings.settings;
const q = strings.queue;
const b = strings.batch;

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
    // A desktop with 8 cores, so the rule gives 2 jobs at once on any runner (D23 Q4).
    Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 8 });
  });
  await page.goto("/");
  const canRun = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
  test.skip(!canRun, "no OffscreenCanvas in this browser build (D17); runs in CI on Linux");
}

async function expectClean(page: Page, errors: string[]): Promise<void> {
  expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  expect(errors).toEqual([]);
}

interface Generated {
  name: string;
  width: number;
  height: number;
  /** noise: random · seeded: the fixed pattern process.spec.ts uses for two Target candidates · solid: one colour */
  pattern: "noise" | "seeded" | "solid";
}

/** Drops generated PNGs in one go and waits until every row says "Ready". */
async function addImages(page: Page, images: Generated[]): Promise<void> {
  await page.getByRole("region", { name: strings.upload.heading }).evaluate(async (area, list) => {
    const data = new DataTransfer();
    for (const o of list) {
      const canvas = document.createElement("canvas");
      canvas.width = o.width;
      canvas.height = o.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2D context");
      if (o.pattern === "solid") {
        context.fillStyle = "#3366aa";
        context.fillRect(0, 0, o.width, o.height);
      } else {
        const image = context.createImageData(o.width, o.height);
        let seed = 20261126; // mulberry32, as in process.spec.ts
        const seeded = () => {
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = 0; i < image.data.length; i += 4) {
          if (o.pattern === "seeded") {
            const x = (i / 4) % o.width;
            const y = Math.floor(i / 4 / o.width);
            image.data[i] = (x * 255) / o.width + seeded() * 60;
            image.data[i + 1] = (y * 255) / o.height + seeded() * 60;
            image.data[i + 2] = ((x + y) % 256) * 0.5 + seeded() * 60;
          } else {
            image.data[i] = Math.random() * 256;
            image.data[i + 1] = Math.random() * 256;
            image.data[i + 2] = (i / 4) % 256;
          }
          image.data[i + 3] = 255;
        }
        context.putImageData(image, 0, 0);
      }
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) throw new Error("no PNG");
      data.items.add(new File([blob], o.name, { type: "image/png" }));
    }
    area.dispatchEvent(
      new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
    );
  }, images);
  await expect(page.getByText(q.status.ready, { exact: true })).toHaveCount(images.length, {
    timeout: 60_000,
  });
}

/** Opens the n-th image with this name (names can repeat). */
async function show(page: Page, name: string, nth = 0): Promise<void> {
  await page
    .getByRole("button", { name: q.selectLabel(name), exact: true })
    .nth(nth)
    .click();
}

const row = (page: Page, name: string, nth = 0) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: q.selectLabel(name), exact: true }) })
    .nth(nth);

const sizeField = (page: Page) => page.getByLabel(s.sizeLabel.maximum, { exact: true });

async function download(page: Page, open: () => Promise<void>) {
  const pending = page.waitForEvent("download");
  await open();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: readFileSync(await file.path()) };
}

test.describe("batch (M6)", () => {
  test.setTimeout(240_000);

  test("exit criteria: a real failure affects only its image; the ZIP holds each selected file, byte for byte", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addImages(page, [
      { name: "same.png", width: 1600, height: 1200, pattern: "noise" },
      { name: "same.png", width: 1500, height: 1100, pattern: "noise" },
      { name: "seeded.png", width: 640, height: 480, pattern: "seeded" },
      { name: "orig.png", width: 200, height: 100, pattern: "noise" },
      // 17.6 MP: over libimagequant's 16.7 MP, so PNG colour reduction fails for real.
      { name: "big.png", width: 4200, height: 4200, pattern: "solid" },
    ]);

    // First "same.png": JPEG under 200 KB, then copied to the second one (Apply to selected).
    await show(page, "same.png", 0);
    await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
    await sizeField(page).fill("200");
    await page
      .getByRole("checkbox", { name: q.checkLabel("same.png") })
      .nth(0)
      .check();
    await page
      .getByRole("checkbox", { name: q.checkLabel("same.png") })
      .nth(1)
      .check();
    await page.getByRole("button", { name: strings.apply.open }).click();
    const dialog = page.getByRole("dialog", { name: strings.apply.heading });
    await expect(dialog.getByText(strings.apply.never)).toBeVisible();
    await dialog.getByRole("button", { name: strings.apply.apply, exact: true }).click();
    await expect(dialog).toBeHidden();
    await show(page, "same.png", 1);
    await expect(sizeField(page)).toHaveValue("200");
    await expect(page.getByLabel(s.formatLabel)).toHaveValue("image/jpeg");

    // Two Target candidates (process.spec.ts found 116 KB and 125 KB at 120 KB).
    await show(page, "seeded.png");
    await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
    await page.getByRole("radio", { name: new RegExp(s.modes.target.label) }).check();
    await page.getByLabel(s.sizeLabel.target, { exact: true }).fill("120");
    // Already fits as PNG: kept unchanged (pass-through, D22).
    await show(page, "orig.png");
    await sizeField(page).fill("5");
    await page.getByLabel(s.unitLabel(s.sizeLabel.maximum)).selectOption("MB");
    // PNG with colour reduction on 17.6 MP → image_too_large.
    await show(page, "big.png");
    await sizeField(page).fill("1");
    await page.getByText(s.moreOptions, { exact: true }).click();
    await page.getByLabel(s.allowColors).check();

    await page.getByRole("button", { name: b.selectAll }).click();
    await page.getByRole("button", { name: b.optimize }).click();
    // Two at once (desktop rule), the others wait.
    await expect(page.getByText(/^Optimizing: /)).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByText(q.job.waiting, { exact: true }).first()).toBeVisible();

    await expect(page.getByRole("status")).toHaveText(strings.process.announce.batchDone(4, 1, 0), {
      timeout: 180_000,
    });
    await expect(row(page, "big.png")).toContainText(
      q.job.failed(strings.process.errors.image_too_large.what),
    );
    for (const [name, nth] of [
      ["same.png", 0],
      ["same.png", 1],
      ["orig.png", 0],
    ] as const) {
      await expect(row(page, name, nth)).toContainText(/Done: /);
    }

    // Choose the other Target candidate: the ZIP must follow the choice (D14).
    await show(page, "seeded.png");
    const choices = page
      .getByRole("region", { name: strings.result.heading })
      .getByRole("group", { name: strings.result.choose })
      .getByRole("radio");
    await expect(choices).toHaveCount(2);
    const firstChecked = await choices.nth(0).isChecked();
    await choices.nth(firstChecked ? 1 : 0).check();

    // Each image's own Download, to compare with the ZIP entries.
    const singles: Buffer[] = [];
    for (const [name, nth] of [
      ["same.png", 0],
      ["same.png", 1],
      ["seeded.png", 0],
      ["orig.png", 0],
    ] as const) {
      await show(page, name, nth);
      const file = await download(page, () =>
        page.getByRole("link", { name: strings.result.download }).click(),
      );
      singles.push(file.bytes);
    }

    await expect(page.getByText(b.leftOut(1, 5, [b.reasons.noResult(1)]))).toBeVisible();
    const archive = await download(page, () => page.getByRole("button", { name: b.zip }).click());
    expect(archive.name).toBe("optimized-images.zip");
    const files = unzipSync(new Uint8Array(archive.bytes));
    expect(Object.keys(files)).toEqual([
      "same-optimized.jpg",
      "same-optimized (2).jpg",
      "seeded-optimized.jpg",
      "orig-optimized.png",
    ]);
    Object.values(files).forEach((bytes, i) => {
      expect(Buffer.from(bytes).equals(singles[i] ?? Buffer.alloc(0))).toBe(true);
    });
    await expect(page.locator("#zip-status").getByText(b.zipReady(4))).toBeVisible();

    // Retry the failed one with colour reduction off: it now fits.
    await show(page, "big.png");
    await sizeField(page).fill("5");
    await page.getByLabel(s.unitLabel(s.sizeLabel.maximum)).selectOption("MB");
    await page.getByLabel(s.allowColors).uncheck();
    await row(page, "big.png")
      .getByRole("button", { name: q.retryLabel("big.png") })
      .click();
    await expect(row(page, "big.png")).toContainText(/Done: /, { timeout: 60_000 });
    await expectClean(page, errors);
  });

  test("cancelling one running image leaves the other running to the end", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addImages(page, [
      { name: "one.png", width: 2400, height: 1800, pattern: "noise" },
      { name: "two.png", width: 1600, height: 1200, pattern: "noise" },
    ]);
    for (const name of ["one.png", "two.png"]) {
      await show(page, name);
      await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
      await sizeField(page).fill("200");
    }
    await page.getByRole("button", { name: b.selectAll }).click();
    await page.getByRole("button", { name: b.optimize }).click();
    await expect(page.getByText(/^Optimizing: /)).toHaveCount(2, { timeout: 30_000 });
    await row(page, "one.png")
      .getByRole("button", { name: q.cancelLabel("one.png") })
      .click();
    await expect(row(page, "one.png")).toContainText(q.job.cancelled);
    await expect(row(page, "two.png")).toContainText(/Done: /, { timeout: 120_000 });
    await expect(row(page, "one.png")).toContainText(q.job.cancelled);
    await expectClean(page, errors);
  });
});
