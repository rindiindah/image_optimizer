import { beforeEach, describe, expect, it } from "vitest";
import { useQueue } from "../../src/features/queue/store";
import { addFiles, checkFile } from "../../src/features/upload/intake";
import type { QueueItem } from "../../src/types/image";
import { signatures } from "./helpers/image-bytes";

const file = (parts: BlobPart[], name: string) => new File(parts, name);
const png = (name: string) => file([signatures.png()], name);
const svg = (name = "logo.svg") => file(["<svg xmlns='http://www.w3.org/2000/svg'/>"], name);

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
});

describe("checkFile (main-thread checks, before decoding)", () => {
  it("accepts a supported image and marks it for reading", async () => {
    expect(await checkFile(png("photo.png"), "id-1")).toMatchObject({
      id: "id-1",
      name: "photo.png",
      extension: "png",
      status: "reading",
      notices: [],
      error: null,
    });
  });

  it("accepts a renamed file with a notice (Q3)", async () => {
    expect(await checkFile(png("photo.JPG"), "x")).toMatchObject({
      status: "reading",
      notices: [{ code: "extension_mismatch", extension: "jpg" }],
    });
  });

  it("no extension is not a mismatch", async () => {
    expect((await checkFile(png("pasted"), "x")).notices).toEqual([]);
  });

  it.each([
    ["an empty file", file([], "empty.jpg"), "empty_file"],
    ["SVG", svg(), "svg_not_supported"],
    ["SVG renamed to .png", svg("logo.png"), "svg_not_supported"],
    ["a text file", file(["hello"], "notes.jpg"), "unsupported_format"],
    ["a PDF", file(["%PDF-1.7"], "scan.pdf"), "unsupported_format"],
  ])("refuses %s", async (_, input, error) => {
    expect(await checkFile(input, "x")).toMatchObject({ status: "error", error });
  });

  it("refuses a file over 100 MB without reading it all", async () => {
    const big = png("big.png");
    Object.defineProperty(big, "size", { value: 100_000_001 });
    expect(await checkFile(big, "x")).toMatchObject({ status: "error", error: "file_too_large" });
  });

  it("a file of exactly 100 MB passes the size check", async () => {
    const atLimit = png("limit.png");
    Object.defineProperty(atLimit, "size", { value: 100_000_000 });
    expect(await checkFile(atLimit, "x")).toMatchObject({ status: "reading" });
  });

  it("shows a cleaned name (never HTML, no hidden characters)", async () => {
    const name = "photo\u202Egpj.png";
    expect((await checkFile(png(name), "x")).name).toBe("photogpj.png");
  });
});

describe("addFiles (limit of 50; files are never skipped silently)", () => {
  // Refused files are never sent to the worker, so these tests need no Worker.
  it("adds refused files to the list with their reason and announces them", async () => {
    await addFiles([svg(), file([], "empty.png")]);
    const items = useQueue.getState().items;
    expect(items.map((i) => i.error)).toEqual(["svg_not_supported", "empty_file"]);
    expect(useQueue.getState().announcement).toBe("2 couldn't be used.");
  });

  it("stops at 50 images and says how many weren't added", async () => {
    const existing: QueueItem[] = Array.from({ length: 49 }, (_, i) => ({
      id: `old-${String(i)}`,
      file: png("old.png"),
      name: "old.png",
      extension: "png",
      sizeBytes: 8,
      status: "error",
      notices: [],
      metadata: null,
      thumbnailUrl: null,
      previewUrl: null,
      error: "decode_failed",
      settings: null,
      job: { status: "idle" },
      result: null,
    }));
    useQueue.getState().add(existing);
    await addFiles([svg("a.svg"), svg("b.svg"), svg("c.svg")]);
    expect(useQueue.getState().items).toHaveLength(50);
    expect(useQueue.getState().announcement).toBe(
      "1 couldn't be used. 2 files weren't added: the limit is 50 images.",
    );
  });

  it("gives every item its own stable id", async () => {
    await addFiles([svg("a.svg"), svg("b.svg")]);
    const ids = useQueue.getState().items.map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
  });
});
