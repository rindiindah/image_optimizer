import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
/** Test-only engine harness (vite.harness.config.ts), used by tests/e2e/engine.spec.ts. */
export const HARNESS_PORT = 4174;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  // Both servers are production builds served with the production headers (vercel.json).
  webServer: [
    {
      command: "npm run build && npm run preview",
      url: `http://localhost:${String(PORT)}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command:
        "npx vite build --config vite.harness.config.ts && npx vite preview --config vite.harness.config.ts",
      url: `http://localhost:${String(HARNESS_PORT)}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
