import { readFileSync } from "node:fs";

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * The security headers from `vercel.json` (catch-all rule), so `vite preview` — used by the
 * Playwright tests — serves exactly the production Content-Security-Policy.
 */
export function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as {
    headers?: VercelHeaderRule[];
  };
  const catchAll = config.headers?.find((rule) => rule.source === "/(.*)");
  if (!catchAll) {
    throw new Error('vercel.json has no catch-all "/(.*)" header rule');
  }
  return Object.fromEntries(catchAll.headers.map((header) => [header.key, header.value]));
}

/** jSquash's documented Vite workaround: keep its WASM modules out of the dependency optimizer. */
export const WASM_CODEC_PACKAGES = [
  "@jsquash/jpeg",
  "@jsquash/webp",
  "@jsquash/oxipng",
  "libimagequant-wasm",
];
