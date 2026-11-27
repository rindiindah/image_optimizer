// @vitest-environment node
// Node's own Blob/Response/ReadableStream, as client-zip uses them in the browser.
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip, zipEntries } from "../../src/features/download/zip";
import type { Candidate, OptimizationResult } from "../../src/types/engine";
import type { ItemResult, QueueItem } from "../../src/types/image";
import { readyItem } from "./helpers/items";

const candidate = (bytes: number, side: "below" | "above" = "below"): Candidate => ({
  side,
  bytes,
  mime: "image/jpeg",
  width: 10,
  height: 10,
  quality: 80,
  outcome: "met",
  flags: [],
});

function withResult(
  id: string,
  name: string,
  files: Blob[],
  patch: Partial<ItemResult> = {},
): QueueItem {
  const result: OptimizationResult = {
    mode: "target",
    outcome: "met",
    candidates: files.map((f, i) => candidate(f.size, i === 0 ? "below" : "above")),
    selected: 0,
    closest: null,
    attempts: 3,
  };
  return readyItem(
    id,
    name,
    {},
    {
      file: new File(["x"], name),
      result: {
        result,
        goal: { mode: "target", targetBytes: 100 },
        files,
        urls: files.map((_, i) => `blob:${id}-${String(i)}`),
        selected: 0,
        outdated: false,
        ...patch,
      },
    },
  );
}

const blob = (text: string) => new Blob([text], { type: "image/jpeg" });

describe("ZIP entries (D23)", () => {
  it("uses each image's selected candidate, in list order", () => {
    const below = blob("below");
    const above = blob("above!");
    const items = [
      withResult("a", "a.jpg", [below, above], { selected: 1 }),
      withResult("b", "b.jpg", [blob("b")]),
    ];
    const { entries, leftOut } = zipEntries(items, ["b", "a"]);
    expect(entries.map((e) => e.name)).toEqual(["a-optimized.jpg", "b-optimized.jpg"]);
    expect(entries[0]?.file).toBe(above);
    expect(leftOut).toEqual({ noResult: 0, outdated: 0, noFile: 0 });
  });

  it("leaves out unchecked, unprocessed, outdated and no-file images, and counts why", () => {
    const items = [
      withResult("ok", "ok.jpg", [blob("ok")]),
      readyItem("new", "new.jpg"),
      withResult("old", "old.jpg", [blob("old")], { outdated: true }),
      withResult("none", "none.jpg", [], { selected: null }),
      withResult("unchecked", "unchecked.jpg", [blob("u")]),
    ];
    const { entries, leftOut } = zipEntries(items, ["ok", "new", "old", "none"]);
    expect(entries.map((e) => e.name)).toEqual(["ok-optimized.jpg"]);
    expect(leftOut).toEqual({ noResult: 1, outdated: 1, noFile: 1 });
  });

  it("collision-safe names: case-insensitive, (2), (3), and a name already ending in (2)", () => {
    const items = [
      withResult("1", "IMG_1.jpg", [blob("1")]),
      withResult("2", "img_1.JPG", [blob("2")]),
      withResult("3", "IMG_1.jpeg", [blob("3")]),
      withResult("4", "IMG_1-optimized (2).jpg", [blob("4")]),
    ];
    const { entries } = zipEntries(items, ["1", "2", "3", "4"]);
    expect(entries.map((e) => e.name)).toEqual([
      "IMG_1-optimized.jpg",
      "img_1-optimized (2).jpg",
      "IMG_1-optimized (3).jpg",
      "IMG_1-optimized (2)-optimized.jpg",
    ]);
  });

  it("the ZIP holds exactly those files, byte for byte, read back by another library", async () => {
    const items = [
      withResult("a", "a.jpg", [blob("first file")]),
      withResult("b", "a.jpg", [blob("second, longer file")]),
    ];
    const { entries } = zipEntries(items, ["a", "b"]);
    const progress: [number, number][] = [];
    const zip = await buildZip(entries, (done, total) => progress.push([done, total]));
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files)).toEqual(["a-optimized.jpg", "a-optimized (2).jpg"]);
    expect(new TextDecoder().decode(files["a-optimized.jpg"])).toBe("first file");
    expect(new TextDecoder().decode(files["a-optimized (2).jpg"])).toBe("second, longer file");
    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });
});
