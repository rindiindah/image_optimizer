import { describe, expect, it } from "vitest";
import {
  cleanFileName,
  displayName,
  fileExtension,
  MAX_DISPLAY_NAME_LENGTH,
} from "../../src/utils/filename";

describe("cleanFileName", () => {
  it("keeps ordinary names, including non-Latin letters and emoji", () => {
    expect(cleanFileName("Foto liburan 2026.jpg")).toBe("Foto liburan 2026.jpg");
    expect(cleanFileName("写真 🌸.heic")).toBe("写真 🌸.heic");
  });

  it("removes a right-to-left override that disguises the extension", () => {
    // With U+202E the name would display as "photoexe.jpg"; without it the real ".exe" shows.
    expect(cleanFileName("photo\u202Egpj.exe")).toBe("photogpj.exe");
  });

  it.each([
    ["control characters", "a\u0000b\u0007c\u001Fd\u007Fe.png", "abcde.png"],
    ["C1 controls", "a\u0085b\u009Fc.png", "abc.png"],
    ["bidi isolates and marks", "\u2066a\u2069\u200Eb\u200F\u061C.png", "ab.png"],
    ["zero-width characters and BOM", "\uFEFFa\u200Bb\u200Dc.png", "abc.png"],
    ["newlines and tabs collapse to one space", "my\n\tphoto .png", "my photo .png"],
    ["leading/trailing spaces", "   photo.png  ", "photo.png"],
  ])("%s", (_, input, expected) => {
    expect(cleanFileName(input)).toBe(expected);
  });

  it("does not touch HTML-looking text (it is always rendered as text, never as HTML)", () => {
    expect(cleanFileName("<img src=x onerror=alert(1)>.png")).toBe(
      "<img src=x onerror=alert(1)>.png",
    );
  });
});

describe("fileExtension", () => {
  it.each([
    ["photo.JPG", "jpg"],
    ["archive.tar.gz", "gz"],
    ["IMG_0001.HEIC", "heic"],
    ["no-extension", ""],
    [".hidden", ""],
    ["trailing.", ""],
    ["photo.png\u202E", "png"],
  ])("%s → %s", (name, extension) => {
    expect(fileExtension(name)).toBe(extension);
  });
});

describe("displayName", () => {
  it("returns short names unchanged", () => {
    expect(displayName("photo.jpg")).toBe("photo.jpg");
  });

  it("shortens long names but keeps the extension visible", () => {
    const shown = displayName(`${"a".repeat(200)}.jpeg`);
    expect(Array.from(shown)).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
    expect(shown.endsWith("….jpeg")).toBe(true);
  });

  it("a name exactly at the limit is not shortened", () => {
    const name = `${"b".repeat(MAX_DISPLAY_NAME_LENGTH - 4)}.png`;
    expect(displayName(name)).toBe(name);
  });

  it("never splits an emoji when shortening", () => {
    const shown = displayName(`${"🌸".repeat(200)}.png`);
    expect(shown).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    expect(Array.from(shown)).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  it("does not keep an absurdly long 'extension'", () => {
    const shown = displayName(`photo.${"x".repeat(200)}`);
    expect(Array.from(shown)).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
    expect(shown.endsWith("…")).toBe(true);
  });

  it("returns an empty string when nothing printable is left", () => {
    expect(displayName("\u202E\u200B\u0000")).toBe("");
  });
});
