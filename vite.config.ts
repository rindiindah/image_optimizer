import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * `vite preview` serves the same security headers as production (`vercel.json`),
 * so the Playwright tests run under the real Content-Security-Policy.
 * Only the catch-all rule is applied; the dev server is left without a CSP.
 */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as {
    headers?: VercelHeaderRule[];
  };
  const catchAll = config.headers?.find((rule) => rule.source === "/(.*)");
  if (!catchAll) {
    throw new Error('vercel.json has no catch-all "/(.*)" header rule');
  }
  return Object.fromEntries(catchAll.headers.map((header) => [header.key, header.value]));
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: productionHeaders(),
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
  },
});
