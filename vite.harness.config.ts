import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { productionHeaders, WASM_CODEC_PACKAGES } from "./vite.shared.ts";

/**
 * Test-only build: the engine harness used by Playwright (tests/e2e/engine.spec.ts).
 * It is built into dist-harness/, never into dist/, and is not deployed.
 * Served with the production headers so the real codecs run under the real CSP.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./tests/harness", import.meta.url)),
  publicDir: fileURLToPath(new URL("./tests/fixtures", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist-harness", import.meta.url)),
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: WASM_CODEC_PACKAGES,
  },
  worker: {
    format: "es",
  },
  preview: {
    port: 4174,
    strictPort: true,
    headers: productionHeaders(),
  },
});
