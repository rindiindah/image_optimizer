import { describe, expect, it } from "vitest";
import {
  detectFormat,
  extensionMismatch,
  isAnimatedGif,
  isAnimatedWebp,
  SNIFF_BYTES,
} from "../../src/utils/sniff";
import { readFixture } from "./helpers/fixtures";
import { animatedWebpHead, bytes, files, ftyp, signatures } from "./helpers/image-bytes";

const fixture = (path: string) => readFixture(path, SNIFF_BYTES);

describe("detectFormat (content, never the name)", () => {
  it.each([
    ["JPEG", signatures.jpeg(), "jpeg", "image/jpeg"],
    ["PNG", signatures.png(), "png", "image/png"],
    ["GIF87a", signatures.gif87(), "gif", "image/gif"],
    ["GIF89a", signatures.gif89(), "gif", "image/gif"],
    ["WebP", signatures.webp(), "webp", "image/webp"],
    ["BMP", signatures.bmp(), "bmp", "image/bmp"],
    ["AVIF", ftyp("avif", ["mif1", "miaf"]), "avif", "image/avif"],
    ["AVIF sequence", ftyp("avis", ["msf1"]), "avif", "image/avif"],
    ["AVIF by compatible brand", ftyp("mif1", ["avif"]), "avif", "image/avif"],
    ["HEIC", ftyp("heic", ["mif1", "heic"]), "heic", "image/heic"],
    ["HEIC 10-bit (heix)", ftyp("heix", ["mif1"]), "heic", "image/heic"],
    ["HEIC sequence (hevc)", ftyp("hevc", ["msf1"]), "heic", "image/heic"],
    ["HEIF by compatible brand", ftyp("mif1", ["heic"]), "heic", "image/heic"],
    ["generic HEIF", ftyp("mif1", ["miaf"]), "heic", "image/heif"],
  ] as const)("%s", (_, input, format, mime) => {
    expect(detectFormat(input)).toEqual({ kind: "image", format, mime });
  });

  it.each([
    ["iphone17pro-portrait.heic", "image/heic"],
    ["iphone8plus-portrait.heic", "image/heic"],
    ["display-p3-10bit.heic", "image/heic"],
    ["multi-image-burst.heic", "image/heic"],
  ])("real file heic/%s", (name, mime) => {
    expect(detectFormat(fixture(`heic/${name}`))).toEqual({ kind: "image", format: "heic", mime });
  });

  it("real file photo-24mp.jpg", () => {
    expect(detectFormat(fixture("photo-24mp.jpg"))).toMatchObject({ format: "jpeg" });
  });

  it("a truncated HEIC still has a valid header (decoding catches it later)", () => {
    expect(detectFormat(fixture("heic/broken-truncated.heic"))).toMatchObject({ format: "heic" });
  });

  it.each([
    ["plain SVG", "<svg xmlns='http://www.w3.org/2000/svg'></svg>"],
    ["SVG with XML declaration", "<?xml version='1.0'?>\n<svg></svg>"],
    ["SVG with BOM and whitespace", "\uFEFF  \n<SVG></SVG>"],
    ["SVG with doctype", "<!DOCTYPE svg><svg></svg>"],
  ])("refuses %s as svg", (_, markup) => {
    expect(detectFormat(new TextEncoder().encode(markup))).toEqual({ kind: "svg" });
  });

  it.each([
    ["empty", bytes()],
    ["plain text", bytes("hello world")],
    ["HTML", bytes("<!doctype html><html></html>")],
    ["text starting with BM", bytes("BMW owners club newsletter")],
    ["truncated JPEG signature", bytes([0xff, 0xd8])],
    ["truncated PNG signature", bytes([0x89, 0x50, 0x4e, 0x47])],
    ["RIFF that isn't WebP (WAV)", bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ")],
    ["MP4 video", ftyp("isom", ["iso2", "mp41"])],
    ["ftyp with a broken size", bytes([0, 0, 0, 8], "ftyp", "heic", [0, 0, 0, 0])],
    ["GIF-like but wrong version", bytes("GIF90a")],
    ["PDF", bytes("%PDF-1.7")],
  ])("unknown: %s", (_, input) => {
    expect(detectFormat(input)).toEqual({ kind: "unknown" });
  });

  it("a PNG named .jpg is still a PNG (renamed files are detected by content)", () => {
    expect(detectFormat(signatures.png())).toMatchObject({ format: "png" });
  });
});

describe("extensionMismatch (Q3: accepted with a notice)", () => {
  it.each([
    ["jpeg", "jpg", false],
    ["jpeg", "JPEG", false],
    ["jpeg", "jfif", false],
    ["heic", "heif", false],
    ["heic", "hif", false],
    ["bmp", "dib", false],
    ["png", "", false],
    ["png", "jpg", true],
    ["heic", "jpg", true],
    ["webp", "png", true],
  ] as const)("%s content with .%s → %s", (format, extension, mismatch) => {
    expect(extensionMismatch(format, extension)).toBe(mismatch);
  });
});

describe("animation detection (first-frame notice only when really animated)", () => {
  it("a GIF with one image is not animated", () => {
    expect(isAnimatedGif(files.staticGif())).toBe(false);
  });

  it("a GIF with two images is animated", () => {
    expect(isAnimatedGif(files.animatedGif())).toBe(true);
  });

  it("built GIF and BMP files are detected by content", () => {
    expect(detectFormat(files.staticGif())).toMatchObject({ format: "gif" });
    expect(detectFormat(files.bmp(3, 2))).toMatchObject({ format: "bmp" });
  });

  it("never throws on truncated or garbage GIF data", () => {
    const animated = files.animatedGif();
    for (let cut = 0; cut < animated.length; cut += 1) {
      expect(typeof isAnimatedGif(animated.subarray(0, cut))).toBe("boolean");
    }
    expect(isAnimatedGif(bytes("GIF89a", Array<number>(64).fill(0xff)))).toBe(false);
  });

  it("an animated WebP is detected from its extended header", () => {
    expect(isAnimatedWebp(animatedWebpHead())).toBe(true);
    expect(isAnimatedWebp(signatures.webp())).toBe(false);
    expect(isAnimatedWebp(bytes("RIFF"))).toBe(false);
  });
});
