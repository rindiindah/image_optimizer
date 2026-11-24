import { describe, expect, it } from "vitest";
import { readHeifBitDepth } from "../../src/utils/heif-info";
import { readFixture } from "./helpers/fixtures";
import { bytes, ftyp } from "./helpers/image-bytes";

const heic = (name: string) => readFixture(`heic/${name}`);

describe("readHeifBitDepth (Q6 a: from the container, for every decode path)", () => {
  it.each([
    ["display-p3-10bit.heic", 10],
    ["iphone17pro-portrait.heic", 8], // grid primary → first tile; has an HDR gain map, but the primary is 8-bit
    ["iphone8plus-portrait.heic", 8], // grid primary
    ["multi-image-burst.heic", 8],
    ["orientation-6.heic", 8],
    ["broken-truncated.heic", 8], // the metadata is intact; only the pixel data is cut off
  ])("%s → %d", (name, depth) => {
    expect(readHeifBitDepth(heic(name))).toBe(depth);
  });

  it.each([
    ["empty", bytes()],
    ["not ISO-BMFF", bytes("hello world, this is not a heif file")],
    ["ftyp only", ftyp("heic", ["mif1"])],
    ["JPEG", readFixture("photo-24mp.jpg", 4096)],
  ])("returns null for %s", (_, input) => {
    expect(readHeifBitDepth(input)).toBeNull();
  });

  it("never throws on any truncation of a real file (untrusted input)", () => {
    const file = heic("iphone17pro-portrait.heic");
    // Every cut inside the first 16 KB (where the metadata lives), plus a few later ones.
    const cuts = [...Array.from({ length: 16_384 }, (_, i) => i), 50_000, 500_000, file.length - 1];
    for (const cut of cuts) {
      const result = readHeifBitDepth(file.subarray(0, cut));
      expect(result === null || result === 8).toBe(true);
    }
  });

  it("never throws on corrupted bytes in the metadata", () => {
    const original = heic("display-p3-10bit.heic");
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let run = 0; run < 2_000; run += 1) {
      const copy = original.slice(0, 4096);
      for (let k = 0; k < 4; k += 1)
        copy[Math.floor(random() * copy.length)] = Math.floor(random() * 256);
      const result = readHeifBitDepth(copy);
      expect(result === null || (Number.isInteger(result) && result >= 1 && result <= 16)).toBe(
        true,
      );
    }
  });
});
