import { describe, expect, it } from "vitest";
import { downloadName } from "../../src/utils/download-name";

describe("downloadName (Q5)", () => {
  it("adds -optimized and the extension of the real output type", () => {
    expect(downloadName("photo.jpg", "image/jpeg")).toBe("photo-optimized.jpg");
    expect(downloadName("IMG_1420.HEIC", "image/jpeg")).toBe("IMG_1420-optimized.jpg");
    expect(downloadName("logo.png", "image/webp")).toBe("logo-optimized.webp");
    // Native fallback: asked for WebP, got PNG → the name says .png.
    expect(downloadName("logo.png", "image/png")).toBe("logo-optimized.png");
    expect(downloadName("archive.tar.gz", "image/png")).toBe("archive.tar-optimized.png");
  });

  it("removes characters operating systems forbid, and invisible ones", () => {
    expect(downloadName('a<b>c:d"e/f\\g|h?i*.png', "image/png")).toBe(
      "a_b_c_d_e_f_g_h_i_-optimized.png",
    );
    expect(downloadName("photo\u202Egpj.exe.png", "image/png")).toBe("photogpj.exe-optimized.png");
    expect(downloadName("line\nbreak.jpg", "image/jpeg")).toBe("line break-optimized.jpg");
  });

  it("a copy number (ZIP collisions, D23 Q7) goes before the extension", () => {
    expect(downloadName("photo.jpg", "image/jpeg", 1)).toBe("photo-optimized.jpg");
    expect(downloadName("photo.jpg", "image/jpeg", 2)).toBe("photo-optimized (2).jpg");
    expect(downloadName("CON.png", "image/png", 12)).toBe("CON_-optimized (12).png");
  });

  it("never gives an empty, hidden or reserved name", () => {
    expect(downloadName(".png", "image/png")).toBe("png-optimized.png");
    expect(downloadName("...", "image/png")).toBe("image-optimized.png");
    expect(downloadName("", "image/jpeg")).toBe("image-optimized.jpg");
    expect(downloadName("CON.jpg", "image/jpeg")).toBe("CON_-optimized.jpg");
    expect(downloadName(" name. .jpg", "image/jpeg")).toBe("name-optimized.jpg");
  });

  it("shortens very long names", () => {
    const name = downloadName(`${"x".repeat(300)}.jpg`, "image/jpeg");
    expect(name).toBe(`${"x".repeat(100)}-optimized.jpg`);
  });
});
