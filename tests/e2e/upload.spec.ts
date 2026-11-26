/**
 * M2: adding images in the real app (production build + CSP), in Chromium, Firefox and WebKit.
 * Where the browser has no OffscreenCanvas (Playwright WebKit on Windows, D17), files can be
 * added but not read: they must show the "browser lacks a feature" error, never fake details.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { strings } from "../../src/content/strings";
import { formatSize } from "../../src/utils/file-size";
import { files } from "../unit/helpers/image-bytes";

declare global {
  interface Window {
    __cspViolations?: string[];
    /** Object URLs the app revoked (recorded by the test). */
    __revoked?: string[];
  }
}

/** A fixture as an in-memory file (setInputFiles can't mix paths and buffers). */
const fixture = (path: string) => ({
  name: basename(path),
  mimeType: "application/octet-stream",
  buffer: readFileSync(`tests/fixtures/images/${path}`),
});
/** A 1×1 PNG. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const gif = (name: string) => ({
  name,
  mimeType: "image/gif",
  buffer: Buffer.from(files.staticGif()),
});

async function open(page: Page, errors: string[], requests: string[]): Promise<boolean> {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.context().on("request", (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    window.__revoked = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      window.__revoked?.push(url);
      revoke(url);
    };
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations?.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto("/");
  return page.evaluate(() => typeof OffscreenCanvas !== "undefined");
}

const row = (page: Page, name: string): Locator =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: strings.queue.selectLabel(name) }) });

async function waitUntilRead(page: Page, count: number): Promise<void> {
  await expect(page.getByRole("button", { name: /^Select / })).toHaveCount(count);
  await expect(page.getByRole("main").getByText(strings.queue.status.reading)).toHaveCount(0, {
    timeout: 60_000,
  });
}

async function expectClean(page: Page, errors: string[]): Promise<void> {
  expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  expect(errors).toEqual([]);
}

const chooser = (page: Page) => page.getByLabel(strings.upload.chooseButton, { exact: true });

test.describe("adding images (M2)", () => {
  test.setTimeout(120_000);

  test("Choose images: real files get measured details; HEIC decoder loads only when needed", async ({
    page,
  }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    const canRead = await open(page, errors, requests);
    expect(requests.filter((url) => /libheif/i.test(url))).toEqual([]);

    await chooser(page).setInputFiles([
      fixture("heic/iphone17pro-portrait.heic"),
      fixture("photo-24mp.jpg"),
      gif("dot.gif"),
      {
        name: "logo.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      },
    ]);
    await waitUntilRead(page, 4);

    const svg = row(page, "logo.svg");
    await expect(svg).toContainText(strings.imageErrors.svg_not_supported.what);
    await expect(svg).toContainText(strings.imageErrors.originalSafe);
    await expect(svg).toContainText(strings.imageErrors.svg_not_supported.next);

    if (!canRead) {
      // No OffscreenCanvas: honest error, no invented details.
      await expect(row(page, "iphone17pro-portrait.heic")).toContainText(
        strings.imageErrors.unsupported_browser.what,
      );
      await expect(page.getByRole("status")).toHaveText("4 couldn't be used.");
      await expectClean(page, errors);
      return;
    }

    await expect(row(page, "iphone17pro-portrait.heic")).toContainText(
      `HEIC · ${formatSize(1_169_044)} · 3024 × 4032 px`,
    );
    await expect(row(page, "photo-24mp.jpg")).toContainText(
      `JPEG · ${formatSize(9_907_801)} · 6000 × 4000 px`,
    );
    await expect(row(page, "dot.gif")).toContainText("GIF");
    await expect(row(page, "dot.gif")).toContainText("1 × 1 px");
    await expect(page.getByRole("status")).toHaveText("3 images added. 1 couldn't be used.");
    expect(requests.filter((url) => /libheif/i.test(url)).length).toBeGreaterThan(0);

    // The first image is selected and its preview shows (HEIC too, in every browser).
    const preview = page.getByRole("img", {
      name: strings.preview.alt("iphone17pro-portrait.heic"),
    });
    await expect(preview).toBeVisible();
    expect(await preview.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(2048);

    await page.getByRole("button", { name: strings.queue.selectLabel("photo-24mp.jpg") }).click();
    await expect(
      page.getByRole("img", { name: strings.preview.alt("photo-24mp.jpg") }),
    ).toBeVisible();
    await expectClean(page, errors);
  });

  test("drag and drop, and paste, add images", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors, []);
    const gifBytes = Array.from(files.staticGif());

    await page.getByRole("region", { name: strings.upload.heading }).evaluate((area, bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "dropped.gif", { type: "image/gif" }));
      area.dispatchEvent(
        new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true }),
      );
      area.dispatchEvent(
        new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
      );
    }, gifBytes);
    await waitUntilRead(page, 1);

    await page.evaluate((bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "pasted.gif", { type: "image/gif" }));
      const event = new ClipboardEvent("paste", { clipboardData: data, cancelable: true });
      // Firefox ignores clipboardData on script-made events; attach it so the app's handler runs.
      Object.defineProperty(event, "clipboardData", { value: data });
      window.dispatchEvent(event);
    }, gifBytes);
    await waitUntilRead(page, 2);
    await expect(row(page, "pasted.gif")).toBeVisible();
    await expectClean(page, errors);
  });

  test("a renamed file is accepted with a notice; corrupt and empty files explain why not", async ({
    page,
  }) => {
    const errors: string[] = [];
    const canRead = await open(page, errors, []);
    test.skip(!canRead, "no OffscreenCanvas in this browser build (D17)");
    await chooser(page).setInputFiles([
      { name: "photo.jpg", mimeType: "image/jpeg", buffer: PNG_1X1 },
      fixture("heic/broken-truncated.heic"),
      { name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) },
    ]);
    await waitUntilRead(page, 3);

    await expect(row(page, "photo.jpg")).toContainText("PNG");
    await expect(row(page, "photo.jpg")).toContainText(
      strings.notices.extension_mismatch("PNG", "jpg"),
    );
    await expect(row(page, "broken-truncated.heic")).toContainText(
      strings.imageErrors.decode_failed.what,
    );
    await expect(row(page, "empty.png")).toContainText(strings.imageErrors.empty_file.what);
    await expectClean(page, errors);
  });

  test("remove takes an image out and releases its preview memory", async ({ page }) => {
    const errors: string[] = [];
    const canRead = await open(page, errors, []);
    test.skip(!canRead, "no OffscreenCanvas in this browser build (D17)");
    await chooser(page).setInputFiles([gif("a.gif"), gif("b.gif")]);
    await waitUntilRead(page, 2);

    const thumbnail = await row(page, "a.gif").locator("img").getAttribute("src");
    expect(thumbnail).toMatch(/^blob:/);
    await page.getByRole("button", { name: strings.queue.removeLabel("a.gif") }).click();
    await expect(row(page, "a.gif")).toHaveCount(0);
    // Both of its object URLs (thumbnail and preview) were revoked.
    const revoked = await page.evaluate(() => window.__revoked ?? []);
    expect(revoked).toContain(thumbnail);
    expect(revoked.filter((url) => url !== thumbnail)).toHaveLength(1);
    await expect(
      page.getByRole("button", { name: strings.queue.selectLabel("b.gif") }),
    ).toHaveAttribute("aria-pressed", "true");
    await expectClean(page, errors);
  });

  test("at most 50 images; the rest are reported, not silently dropped", async ({ page }) => {
    const errors: string[] = [];
    await open(page, errors, []);
    await chooser(page).setInputFiles(
      Array.from({ length: 51 }, (_, i) => gif(`frame-${String(i)}.gif`)),
    );
    await waitUntilRead(page, 50);
    await expect(page.getByText(strings.queue.count(50))).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "1 file wasn't added: the limit is 50 images.",
    );
    await expectClean(page, errors);
  });
});
