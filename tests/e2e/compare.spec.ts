/**
 * M5 (D22) in the real app (production build + CSP): the comparison viewer (slider, side by
 * side, Fit, true 1:1 with synced pan) and pass-through (the original file kept byte for byte).
 * The full pipeline needs OffscreenCanvas, so these skip on Playwright WebKit for Windows (D17).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { strings } from "../../src/content/strings";

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

const s = strings.settings;
const r = strings.result;
const c = r.compare;
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

/** Drops a generated noise PNG (doesn't compress to nothing, so JPEG output is lossy). */
async function addNoise(page: Page, width: number, height: number): Promise<void> {
  await page.getByRole("region", { name: strings.upload.heading }).evaluate(
    async (area, size) => {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2D context");
      const image = context.createImageData(size.width, size.height);
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = Math.random() * 256;
        image.data[i + 1] = (i / 4) % 256;
        image.data[i + 2] = 128;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) throw new Error("no PNG");
      const data = new DataTransfer();
      data.items.add(new File([blob], "noise.png", { type: "image/png" }));
      area.dispatchEvent(
        new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
      );
    },
    { width, height },
  );
  await expect(page.getByLabel(s.sizeLabel.maximum, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function optimize(page: Page, format: string, size: string, unit: "KB" | "MB") {
  await page.getByLabel(s.formatLabel).selectOption(format);
  await page.getByLabel(s.sizeLabel.maximum, { exact: true }).fill(size);
  await page.getByLabel(s.unitLabel(s.sizeLabel.maximum)).selectOption(unit);
  await page.getByRole("button", { name: strings.process.optimize }).click();
  await expect(page.getByRole("link", { name: r.download })).toBeVisible({ timeout: 90_000 });
}

const box = (page: Page) => page.getByTestId("compare-box");
const outputImg = (page: Page) => page.getByRole("img", { name: r.previewAlt });

/** Output dimensions as the result panel shows them ("W × H px" in the Dimensions row). */
async function outputSize(page: Page): Promise<{ width: number; height: number }> {
  const size = await outputImg(page)
    .first()
    .evaluate((img: HTMLImageElement) => ({ width: img.naturalWidth, height: img.naturalHeight }));
  const shown = strings.queue.dimensions(size.width, size.height);
  await expect(page.getByText(shown, { exact: true }).first()).toBeVisible();
  return size;
}

test.describe("results and comparison (M5)", () => {
  test.setTimeout(180_000);

  test("slider by keyboard and pointer, side by side, 100 % is true 1:1 with synced pan", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addNoise(page, 2400, 1600);
    await optimize(page, "image/jpeg", "900", "KB");
    await expect(page.getByText(r.metadata.removed)).toBeVisible();

    // Slider (default) at Fit: keyboard moves the divider and the clip follows.
    const divider = page.getByRole("slider", { name: c.divider });
    await divider.focus();
    for (let i = 0; i < 5; i += 1) await divider.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuetext", c.dividerValue(45));
    expect(await outputImg(page).evaluate((img) => getComputedStyle(img).clipPath)).toContain(
      "45%",
    );
    // Pointer: clicking the far right end of the range input.
    const rect = await divider.boundingBox();
    if (!rect) throw new Error("no divider box");
    await page.mouse.click(rect.x + rect.width - 2, rect.y + rect.height / 2);
    await expect(divider).toHaveAttribute("aria-valuetext", /^(9\d|100)% original/);

    // 100 %: the box is exactly the output's pixels and the full-size original fills it.
    const { width, height } = await outputSize(page);
    await page.getByRole("radio", { name: c.full }).check();
    const full = page.getByTestId("compare-full-original");
    await expect(full).toBeVisible({ timeout: 60_000 });
    expect(await full.evaluate((el: HTMLCanvasElement) => [el.width, el.height])).toEqual([
      width,
      height,
    ]);
    const b = await box(page).boundingBox();
    expect([Math.round(b?.width ?? 0), Math.round(b?.height ?? 0)]).toEqual([width, height]);

    // Pan by drag, and by the arrow keys on the focused viewport.
    const viewport = page.getByTestId("compare-viewport");
    await viewport.scrollIntoViewIfNeeded(); // Firefox sends no pointerdown outside the window
    const v = await viewport.boundingBox();
    if (!v) throw new Error("no viewport box");
    await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
    await page.mouse.down();
    await page.mouse.move(v.x + v.width / 2 - 200, v.y + v.height / 2 - 100, { steps: 5 });
    await page.mouse.up();
    const dragged = await viewport.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    expect(dragged[0]).toBeGreaterThan(150);
    expect(dragged[1]).toBeGreaterThan(50);

    // Side by side at 100 %: scrolling one pane scrolls the other to the same place (±1 px).
    await page.getByRole("radio", { name: c.sideBySide }).check();
    const panes = page.getByTestId("compare-viewport");
    await expect(panes).toHaveCount(2);
    await panes.nth(0).evaluate((el) => {
      el.scrollLeft = 321;
      el.scrollTop = 123;
    });
    await expect
      .poll(() => panes.nth(1).evaluate((el) => [el.scrollLeft, el.scrollTop]))
      .toEqual([321, 123]);
    await panes.nth(1).focus();
    await panes.nth(1).press("ArrowRight");
    await expect
      .poll(async () => {
        const [a, z] = await panes.evaluateAll((els) => els.map((el) => el.scrollLeft));
        return (z ?? 0) > 321 && Math.abs((a ?? 0) - (z ?? 0)) <= 1;
      })
      .toBe(true);

    // Removing the image while 100 % is open: no error, nothing left behind.
    await page.getByRole("button", { name: strings.queue.removeLabel("noise.png") }).click();
    await expect(page.getByRole("region", { name: r.heading })).toHaveCount(0);
    await expectClean(page, errors);
  });

  test("pass-through: a JPEG that already fits downloads byte-identical, with the privacy note", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    const original = readFileSync(PHOTO);
    await page.getByLabel(strings.upload.chooseButton, { exact: true }).setInputFiles({
      name: "photo-24mp.jpg",
      mimeType: "application/octet-stream",
      buffer: original,
    });
    await expect(page.getByLabel(s.sizeLabel.maximum, { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await optimize(page, "image/jpeg", "10", "MB");
    await expect(page.getByText(r.flags.passthrough)).toBeVisible();
    await expect(page.getByText(r.metadata.kept)).toBeVisible();
    await expect(page.getByText(r.notReencoded, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: c.heading })).toHaveCount(0);

    const pending = page.waitForEvent("download");
    await page.getByRole("link", { name: r.download }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("photo-24mp-optimized.jpg");
    const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
    expect(sha(readFileSync(await download.path()))).toBe(sha(original));
    await expectClean(page, errors);
  });

  test("turning Keep the original off re-encodes instead", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addNoise(page, 300, 200);
    await optimize(page, "image/png", "5", "MB"); // PNG in, PNG out, fits → kept
    await expect(page.getByText(r.flags.passthrough)).toBeVisible();

    await page.getByText(s.moreOptions, { exact: true }).click();
    await page.getByRole("checkbox", { name: s.keepOriginal }).uncheck();
    await expect(page.getByText(r.outdated)).toBeVisible();
    await page.getByRole("button", { name: strings.process.optimize }).click();
    await expect(page.getByRole("link", { name: r.download })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(r.flags.passthrough)).toHaveCount(0);
    await expect(page.getByText(r.metadata.removed)).toBeVisible();
    await expect(page.getByRole("heading", { name: c.heading })).toBeVisible();
    await expectClean(page, errors);
  });
});
