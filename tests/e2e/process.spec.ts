/**
 * M3: one image end to end in the real app (production build + CSP): settings → Optimize →
 * result → Download. The downloaded file's bytes are checked, not just the download event.
 * The full pipeline needs OffscreenCanvas, so these skip on Playwright WebKit for Windows (D17).
 */
import { readFileSync } from "node:fs";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { strings } from "../../src/content/strings";
import { formatSize } from "../../src/utils/file-size";

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

const s = strings.settings;
const PHOTO = "tests/fixtures/images/photo-24mp.jpg";

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
  await page.goto("/");
  const canRun = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
  test.skip(!canRun, "no OffscreenCanvas in this browser build (D17); runs in CI on Linux");
}

async function expectClean(page: Page, errors: string[]): Promise<void> {
  expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  expect(errors).toEqual([]);
}

async function addPhoto(page: Page): Promise<void> {
  await page.getByLabel(strings.upload.chooseButton, { exact: true }).setInputFiles({
    name: "photo-24mp.jpg",
    mimeType: "application/octet-stream",
    buffer: readFileSync(PHOTO),
  });
  await expect(page.getByLabel(s.sizeLabel.maximum, { exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

/**
 * Adds a generated image by drag and drop. "noise": random noise, so it doesn't compress to
 * nothing. "seeded": gradients plus noise from a fixed seed, so the pixels (and, with the same
 * WASM encoder in every browser, the output sizes) are identical in every run and engine.
 */
async function addGenerated(
  page: Page,
  options: {
    name: string;
    width: number;
    height: number;
    transparent: boolean;
    pattern?: "noise" | "seeded";
  },
): Promise<void> {
  await page.getByRole("region", { name: strings.upload.heading }).evaluate(async (area, o) => {
    const canvas = document.createElement("canvas");
    canvas.width = o.width;
    canvas.height = o.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D context");
    const image = context.createImageData(o.width, o.height);
    // mulberry32, a small seeded PRNG.
    let seed = 20261126;
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
      image.data[i + 3] = o.transparent && i % 8 === 0 ? 0 : 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) throw new Error("no PNG");
    const data = new DataTransfer();
    data.items.add(new File([blob], o.name, { type: "image/png" }));
    area.dispatchEvent(
      new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
    );
  }, options);
  await expect(page.getByLabel(s.sizeLabel.maximum, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

const optimizeButton = (page: Page) => page.getByRole("button", { name: strings.process.optimize });
const resultSection = (page: Page) => page.getByRole("region", { name: strings.result.heading });

/**
 * Clicks Download and reads the saved file. (JPEG/PNG only: Playwright's Firefox saves a .webp,
 * then opens the saved copy in a tab and reports no download; WebP output is covered by
 * engine.spec.ts.)
 */
async function downloadResult(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: strings.result.download }).click();
  const download = await pending;
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}

const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

test.describe("one image end to end (M3)", () => {
  test.setTimeout(180_000);

  test("exit criterion: a 24 MP photo reaches a 500 KB maximum and downloads at the shown size", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addPhoto(page);

    await expect(page.getByLabel(s.formatLabel)).toHaveValue("image/jpeg");
    await page.getByLabel(s.sizeLabel.maximum, { exact: true }).fill("500");
    await expect(page.getByText(s.summary.maximum("500 KB"))).toBeVisible();
    const started = Date.now();
    await optimizeButton(page).click();
    await expect(page.getByText(/^Attempt \d of up to 8$/)).toBeVisible();

    const status = resultSection(page).getByText(/^Done: /);
    await expect(status).toBeVisible({ timeout: 120_000 });
    console.log(
      `[${test.info().project.name}] 24 MP → 500 KB in ${String(Date.now() - started)} ms`,
    );

    const { name, bytes } = await downloadResult(page);
    expect(name).toBe("photo-24mp-optimized.jpg");
    expect(isJpeg(bytes)).toBe(true);
    expect(bytes.length).toBeLessThanOrEqual(500_000);
    // The status shows the measured size of exactly this file (rounded per D4).
    await expect(status).toHaveText(
      strings.result.status.maximumMet(
        formatSize(bytes.length, { kind: "upper", bytes: 500_000 }),
        "500 KB",
      ),
    );
    await expectClean(page, errors);
  });

  test("Target not reached: the closest result is labelled and still downloads (D14 case C)", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addGenerated(page, { name: "noise.png", width: 800, height: 600, transparent: false });
    await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
    await page.getByRole("radio", { name: new RegExp(s.modes.target.label) }).check();
    // Far above what the image gives even at the highest quality (a tiny target can still be
    // "met": the D5 tolerance is at least 5,000 B).
    await page.getByLabel(s.sizeLabel.target, { exact: true }).fill("50");
    await page.getByLabel(s.unitLabel(s.sizeLabel.target)).selectOption("MB");
    await optimizeButton(page).click();

    const status = resultSection(page).getByText(/^Target not reached\. Closest result: /);
    await expect(status).toBeVisible({ timeout: 60_000 });
    const { name, bytes } = await downloadResult(page);
    expect(name).toBe("noise-optimized.jpg");
    expect(isJpeg(bytes)).toBe(true);
    await expect(status).toContainText(
      `${formatSize(bytes.length, { kind: "upper", bytes: 50_000_000 })} (`,
    );
    await expect(status).toContainText("below the target");
    await expectClean(page, errors);
  });

  test("Target reachable: exactly the engine's candidates, nearer preselected, Download uses the choice", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addGenerated(page, { name: "noise.png", width: 600, height: 400, transparent: false });
    await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
    await page.getByRole("radio", { name: new RegExp(s.modes.target.label) }).check();
    await page.getByLabel(s.sizeLabel.target, { exact: true }).fill("250");
    await optimizeButton(page).click();
    await expect(resultSection(page).getByText(/^(Target met|Close to the target): /)).toBeVisible({
      timeout: 60_000,
    });

    // Only the candidate choice (the comparison has its own View/Zoom radios, M5).
    const choices = resultSection(page)
      .getByRole("group", { name: strings.result.choose })
      .getByRole("radio");
    const count = await choices.count();
    console.log(`[${test.info().project.name}] Target 250 KB → ${String(count || 1)} candidate(s)`);
    const first = await downloadResult(page);
    expect(first.name).toBe("noise-optimized.jpg");
    expect(isJpeg(first.bytes)).toBe(true);
    if (count === 2) {
      const states = [await choices.nth(0).isChecked(), await choices.nth(1).isChecked()];
      expect(states.filter(Boolean)).toHaveLength(1); // one preselected
      await choices.nth(states[0] ? 1 : 0).check();
      const second = await downloadResult(page);
      expect(second.bytes.equals(first.bytes)).toBe(false);
    } else {
      expect(count).toBe(0); // one candidate: no choice offered
    }
    await expectClean(page, errors);
  });

  test("Target with two candidates: nearer preselected, switching changes the downloaded file (D14 case A)", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    // Found with a probe (2026-11-26): this image at a 120 KB JPEG target gives 116 KB and
    // 125 KB in Chromium and Firefox, both well inside the 12 KB band.
    await addGenerated(page, {
      name: "seeded.png",
      width: 640,
      height: 480,
      transparent: false,
      pattern: "seeded",
    });
    const target = 120_000;
    await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
    await page.getByRole("radio", { name: new RegExp(s.modes.target.label) }).check();
    await page.getByLabel(s.sizeLabel.target, { exact: true }).fill("120");
    await optimizeButton(page).click();

    const group = resultSection(page).getByRole("group", { name: strings.result.choose });
    await expect(group.getByRole("radio")).toHaveCount(2, { timeout: 60_000 });
    const below = group.getByRole("radio", { name: /below the target/ });
    const above = group.getByRole("radio", { name: /above the target/ });
    const status = resultSection(page).getByText(/^(Target met|Close to the target): /);
    const shown = (bytes: number) => formatSize(bytes, { kind: "upper", bytes: target });
    const startsWith = (size: string) => new RegExp(`^${size.replace(".", "\\.")} · `);

    // The preselected file: exactly one radio checked, and its file is what Download saves.
    const firstIsBelow = await below.isChecked();
    expect(firstIsBelow).not.toBe(await above.isChecked());
    const first = await downloadResult(page);
    await expect(status).toContainText(shown(first.bytes.length));

    // Switch: the other file is saved now, and the status follows the choice.
    const other = firstIsBelow ? above : below;
    await other.check();
    await expect(other).toBeChecked();
    const second = await downloadResult(page);
    await expect(status).toContainText(shown(second.bytes.length));

    const [belowFile, aboveFile] = firstIsBelow ? [first, second] : [second, first];
    for (const file of [belowFile, aboveFile]) {
      expect(isJpeg(file.bytes)).toBe(true);
      expect(file.name).toBe("seeded-optimized.jpg");
    }
    expect(belowFile.bytes.length).toBeLessThanOrEqual(target);
    expect(aboveFile.bytes.length).toBeGreaterThan(target);
    // Each choice is labelled with the measured size of its own file.
    await expect(below).toHaveAccessibleName(startsWith(shown(belowFile.bytes.length)));
    await expect(above).toHaveAccessibleName(startsWith(shown(aboveFile.bytes.length)));
    // The nearer one was preselected (equally near → the one below, D5/D20).
    const distance = (b: Buffer) => Math.abs(b.length - target);
    expect(distance(first.bytes)).toBeLessThanOrEqual(distance(second.bytes));
    if (distance(first.bytes) === distance(second.bytes)) expect(firstIsBelow).toBe(true);
    console.log(
      `[${test.info().project.name}] Target 120 KB → ${String(belowFile.bytes.length)} B and ${String(aboveFile.bytes.length)} B`,
    );
    await expectClean(page, errors);
  });

  test("transparent image → JPEG asks for a fill colour; the result says it was filled", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addGenerated(page, { name: "alpha.png", width: 300, height: 200, transparent: true });
    await expect(page.getByLabel(s.formatLabel)).toHaveValue("image/png");
    await expect(page.getByText(s.transparencyKept)).toBeVisible();

    await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
    await page.getByLabel(s.sizeLabel.maximum, { exact: true }).fill("200");
    await expect(optimizeButton(page)).toBeDisabled();
    const group = page.getByRole("group", { name: s.transparencyLegend });
    await group.getByLabel(s.backgrounds["#ffffff"]).check();
    await expect(page.getByText(s.summary.transparencyFilled("white"))).toBeVisible();
    await optimizeButton(page).click();

    await expect(
      resultSection(page).getByText(strings.result.flags.transparency_flattened),
    ).toBeVisible({
      timeout: 60_000,
    });
    expect(isJpeg((await downloadResult(page)).bytes)).toBe(true);
    await expectClean(page, errors);
  });

  test("Cancel stops a running job: back to ready, no result", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addPhoto(page);
    await page.getByLabel(s.sizeLabel.maximum, { exact: true }).fill("500");
    await optimizeButton(page).click();
    await expect(page.getByText(/^Attempt \d of up to 8$/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: strings.process.cancel }).click();

    await expect(optimizeButton(page)).toBeEnabled();
    await expect(page.getByRole("status")).toHaveText(strings.process.announce.cancelled);
    await expect(resultSection(page)).toHaveCount(0);
    await expectClean(page, errors);
  });

  test("changing a setting after a result marks it outdated and blocks Download", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addGenerated(page, { name: "noise.png", width: 300, height: 200, transparent: false });
    await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
    await page.getByLabel(s.sizeLabel.maximum, { exact: true }).fill("500");
    await optimizeButton(page).click();
    await expect(page.getByRole("link", { name: strings.result.download })).toBeVisible({
      timeout: 60_000,
    });

    await page.getByLabel(s.sizeLabel.maximum, { exact: true }).fill("400");
    await expect(page.getByText(strings.result.outdated)).toBeVisible();
    await expect(page.getByRole("link", { name: strings.result.download })).toHaveCount(0);
    await expect(page.getByRole("button", { name: strings.result.download })).toBeDisabled();
    await expectClean(page, errors);
  });
});
