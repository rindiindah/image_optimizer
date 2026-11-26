import { expect, test } from "./fixtures";
import { strings } from "../../src/content/strings";

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

test("serves the empty workspace with the production security headers", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations?.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  const headers = response?.headers() ?? {};
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");

  await expect(page).toHaveTitle(strings.app.name);
  await expect(page.getByRole("banner")).toContainText(strings.app.name);
  await expect(
    page.getByRole("heading", { level: 1, name: strings.workspace.emptyHeading }),
  ).toBeVisible();
  await expect(page.getByText(strings.workspace.notYetAvailable)).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText(strings.footer.licence);
  // The empty page has only the upload control; settings appear once an image is ready.
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: strings.upload.chooseButton })).toBeVisible();

  // The stylesheet loaded under `style-src 'self'` (design tokens applied).
  const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBackground).not.toBe("rgba(0, 0, 0, 0)");

  // The CSP allows WebAssembly compilation (needed for the M1 encoders).
  const wasmCompiles = await page.evaluate(async () => {
    const emptyModule = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    try {
      await WebAssembly.compile(emptyModule);
      return true;
    } catch {
      return false;
    }
  });
  expect(wasmCompiles).toBe(true);

  expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
