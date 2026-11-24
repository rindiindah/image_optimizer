/** Reads a test image from `tests/fixtures/images/` (paths from the project root; Vitest runs there). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readFixture(path: string, limit?: number): Uint8Array {
  const data = new Uint8Array(readFileSync(resolve(process.cwd(), "tests/fixtures/images", path)));
  return limit === undefined ? data : data.subarray(0, limit);
}
