import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { productionHeaders, WASM_CODEC_PACKAGES } from "./vite.shared.ts";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: WASM_CODEC_PACKAGES,
  },
  worker: {
    format: "es",
  },
  // `vite preview` serves the production headers (vercel.json) so e2e tests run under the real CSP.
  // The dev server is left without a CSP.
  preview: {
    headers: productionHeaders(),
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
  },
});
