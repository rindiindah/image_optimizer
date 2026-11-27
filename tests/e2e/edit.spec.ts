/**
 * M4 in the real app (production build + CSP): crop (fields, mouse, keyboard), rotate,
 * Exact size and resize, each checked against the dimensions of the downloaded file.
 * The full pipeline needs OffscreenCanvas, so these skip on Playwright WebKit for Windows (D17).
 */
import { readFileSync } from "node:fs";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { strings } from "../../src/content/strings";

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

const t = strings.edit;
const s = strings.settings;

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

/** Adds a 640 × 480 noise PNG by drag and drop and waits until it's ready. */
async function addImage(page: Page): Promise<void> {
  await page.getByRole("region", { name: strings.upload.heading }).evaluate(async (area) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D context");
    const image = context.createImageData(640, 480);
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
    data.items.add(new File([blob], "edit-me.png", { type: "image/png" }));
    area.dispatchEvent(
      new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByLabel(s.sizeLabel.maximum, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

async function typeCrop(page: Page, x: number, y: number, w: number, h: number): Promise<void> {
  // Width/height first: a smaller box always fits wherever it starts.
  await field(page, t.width).fill(String(w));
  await field(page, t.height).fill(String(h));
  await field(page, t.x).fill(String(x));
  await field(page, t.y).fill(String(y));
}

/** Optimizes as JPEG under 5 MB, downloads, and returns the downloaded image's size. */
async function optimizeAndMeasure(page: Page): Promise<{ width: number; height: number }> {
  await page.getByLabel(s.formatLabel).selectOption("image/jpeg");
  await page.getByLabel(s.sizeLabel.maximum, { exact: true }).fill("5");
  await page.getByLabel(s.unitLabel(s.sizeLabel.maximum)).selectOption("MB");
  await page.getByRole("button", { name: strings.process.optimize, exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: strings.result.download }).click({ timeout: 60_000 });
  const bytes = readFileSync(await (await pending).path());
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }, Array.from(bytes));
}

test.describe("crop, rotate and resize in the app (M4)", () => {
  test.setTimeout(120_000);

  test("crop with the fields + rotate: the downloaded file has exactly the edited size", async ({
    page,
  }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addImage(page);
    await page.getByRole("button", { name: strings.preview.edit }).click();
    await expect(page.getByRole("heading", { name: t.heading })).toBeFocused();
    // The editor shows the image (drawn from the preview).
    await expect
      .poll(() =>
        page
          .getByRole("img", { name: t.imageLabel })
          .evaluate((c) => (c as HTMLCanvasElement).width),
      )
      .toBe(640);

    await typeCrop(page, 40, 30, 300, 200);
    await expect(page.getByText(t.selected(300, 200))).toBeVisible();
    await page.getByRole("button", { name: t.rotateRight }).click();
    await expect(page.getByText(t.selected(200, 300))).toBeVisible();
    await page.getByRole("button", { name: t.apply }).click();

    await expect(
      page.getByText(strings.preview.edited(strings.queue.dimensions(300, 200), 90)),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: strings.preview.editedAlt("edit-me.png") }),
    ).toBeVisible();
    expect(await optimizeAndMeasure(page)).toEqual({ width: 200, height: 300 });
    await expect(
      page
        .getByRole("region", { name: strings.result.heading })
        .getByText(strings.queue.dimensions(200, 300)),
    ).toBeVisible();

    // Editing after a result marks it outdated.
    await page.getByRole("button", { name: strings.preview.edit }).click();
    await page.getByRole("button", { name: t.rotateLeft }).click();
    await page.getByRole("button", { name: t.apply }).click();
    await expect(page.getByText(strings.result.outdated)).toBeVisible();
    await expectClean(page, errors);
  });

  test("mouse drag draws a selection; the keyboard moves it", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addImage(page);
    await page.getByRole("button", { name: strings.preview.edit }).click();
    const image = page.getByRole("img", { name: t.imageLabel });
    await expect.poll(() => image.evaluate((c) => (c as HTMLCanvasElement).width)).toBe(640);

    // Start from no selection, then drag from 20 % to 60 % of the shown image.
    const box = await image.boundingBox();
    if (!box) throw new Error("no editor image");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();
    const num = async (label: string) => Number(await field(page, label).inputValue());
    const read = async () => ({
      x: await num(t.x),
      y: await num(t.y),
      w: await num(t.width),
      h: await num(t.height),
    });
    const first = await read();
    // About 128, 96, 256 x 192 source pixels (the shown image may be scaled).
    const near = (got: number, want: number) => Math.abs(got - want) <= 8;
    expect(
      near(first.x, 128) && near(first.y, 96) && near(first.w, 256) && near(first.h, 192),
      JSON.stringify(first),
    ).toBe(true);

    await page.getByLabel(t.aria.cropArea).focus();
    await page.keyboard.press("Shift+ArrowRight");
    const moved = await read();
    expect(moved.x).toBeGreaterThan(first.x);
    expect(moved.w).toBe(first.w);
    await page.getByRole("button", { name: t.apply }).click();
    await expect(
      page.getByRole("img", { name: strings.preview.editedAlt("edit-me.png") }),
    ).toBeVisible();
    await expectClean(page, errors);
  });

  test("Exact size: the output is exactly that size", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addImage(page);
    await page.getByRole("button", { name: strings.preview.edit }).click();
    await page.getByLabel(t.ratioLabel).selectOption("exact");
    await field(page, t.exactWidth).fill("200");
    await field(page, t.exactHeight).fill("100");
    await expect(page.getByText(t.selected(640, 320))).toBeVisible(); // 2:1, the largest that fits
    await page.getByRole("button", { name: t.apply }).click();
    await expect(page.getByText(s.resizeExact(200, 100))).toBeVisible();
    expect(await optimizeAndMeasure(page)).toEqual({ width: 200, height: 100 });
    await expectClean(page, errors);
  });

  test("resize with Keep aspect ratio: exact output size, never enlarged", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors);
    await addImage(page);
    await field(page, s.resizeWidth).fill("700");
    await expect(page.getByText(s.resizeErrors.too_large(640, 480))).toBeVisible();
    await field(page, s.resizeWidth).fill("320");
    await expect(field(page, s.resizeHeight)).toHaveValue("240");
    expect(await optimizeAndMeasure(page)).toEqual({ width: 320, height: 240 });
    await expectClean(page, errors);
  });
});
