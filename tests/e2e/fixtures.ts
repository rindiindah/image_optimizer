/**
 * Shared e2e setup: every spec imports `test`/`expect` from here, not from "@playwright/test".
 *
 * Crash guard (2026-11-26): when the browser page crashes, the test fails at once with a clear
 * message instead of waiting out its timeout, and the crash is written into the test's
 * annotations, so the report shows it even when a CI retry passes. Found because Playwright's
 * Firefox crashes on `allTextContents()` of role-scoped locators (see docs/Plan.md).
 */
import { test as base } from "@playwright/test";

export const PAGE_CRASHED =
  "The browser page crashed. This can be a browser/Playwright bug or a real app crash (e.g. out of memory); see docs/Plan.md, 2026-11-26.";

// shortcut: guards the test's main `page` only; extend to `context.on("page")` if a test ever drives a second page.
export const test = base.extend<{ crashGuard: undefined }>({
  crashGuard: [
    async ({ page }, use, testInfo) => {
      page.on("crash", () => {
        testInfo.annotations.push({ type: "page crashed", description: PAGE_CRASHED });
        // Pending actions on the page fail now, instead of waiting for the timeout.
        page.close().catch(() => undefined);
      });
      await use(undefined);
      if (testInfo.annotations.some((a) => a.description === PAGE_CRASHED)) {
        throw new Error(PAGE_CRASHED);
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
