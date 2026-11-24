# Test image sources

Every image in this folder is listed here with its source and licence. Images with
location data (GPS) or identifiable people are not added.

## photo-24mp.jpg

- **Title:** Artemis I Prelaunch (NASA ID `SLS_on_Pad39b_220824_SL-7`)
- **Author:** NASA/Sam Lott
- **Source:** NASA Image and Video Library,
  <https://images.nasa.gov/details/SLS_on_Pad39b_220824_SL-7> (original file `~orig.jpg`)
- **Licence:** NASA imagery is generally not subject to copyright in the United States
  (work of the US government). Used here only as a test file; no NASA endorsement is
  implied. See <https://www.nasa.gov/nasa-brand-center/images-and-media/>.
- **File:** unmodified original, 9,907,801 bytes, 6000 × 4000 px (24.0 MP), progressive
  JPEG, Sony ILCE-7M3. No GPS data.
- **SHA-256:** `344de2ddd06e063df8df32d89a0cf087a448e12be6c82e42c4e98c2360d137c4`
- **Downloaded:** 2026-11-23
- **Used by:** `tests/e2e/engine.spec.ts` (24 MP photo → 1 MB maximum)

## heic/ (HEIC test charts from heic.fyi)

- **Source:** heic.fyi, "HEIC sample files", <https://heic.fyi/heic-sample-files>
  (files under `https://heic.fyi/samples/`; checksums from `samples/manifest.json`).
- **Author:** heic.fyi. Test charts drawn by a script; the page says no photographs,
  third-party images or personal data are used.
- **Licence:** CC0 1.0 Universal ("We have waived all copyright and related rights in
  these files under CC0 1.0 Universal"), <https://creativecommons.org/publicdomain/zero/1.0/>.
  No attribution required.
- **Files:** unmodified originals, generated 2026-10-11 (libheif 1.23.4, x265), downloaded
  2026-11-24. SHA-256 matches the manifest. No GPS data.

| File                     | Bytes   | Content                                                                | SHA-256                                                            |
| ------------------------ | ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `multi-image-burst.heic` | 173,838 | 1280 × 960, 8-bit; 4 top-level images, the primary (`pitm`) is image 3 | `a3f76e9b8552b1deca83b7196bfa637e2742894b7ff2a17deddcef24f010d813` |
| `display-p3-10bit.heic`  | 165,698 | 1600 × 1200, 10-bit 4:2:0 (HEVC RExt, brand `heix`), Display P3 ICC    | `ad1a2e753f04071074c2c7cac8ac0b28d1c31b4dcc40ab3cb8894aad47b7e3a1` |
| `orientation-6.heic`     | 64,356  | Stored 800 × 1200, shown 1200 × 800; `irot` 270° + EXIF orientation 6  | `80b615ae433d7ec53e9aaaeee081ecd11c0d9931350da13d6ce4e2b363d12c12` |
| `broken-truncated.heic`  | 109,836 | First 60% of a valid HEIC; must fail to decode                         | `7c95d6452f3dadf6da09a5dce3e05f81d26b6043fee00026fbd67a5158d555e0` |

- **Used by (M2):** HEIC decode tests (primary image only, 10-bit → 8-bit notice,
  rotation applied once, corrupt file error).

## heic/iphone17pro-portrait.heic and heic/iphone8plus-portrait.heic (real iPhone photos)

- **Source:** imazen-26 image corpus, <https://github.com/imazen/imazen-26> (catalogue and
  licence) and <https://github.com/imazen/imazen-26-originals> (byte-for-byte originals).
- **Author:** the corpus maintainer ("lilith"), own photographs.
- **Licence:** `PD-own`, "the maintainer's own photos … dedicated to the public domain"
  (imazen-26 `README.md`, licensing status; per-row `license` column in `manifest.tsv`).
  The corpus notes its licence is assigned per folder, not cleared per file.
- **Files:** unmodified camera originals, renamed here for readability. Downloaded
  2026-11-24. SHA-256 matches the corpus `manifest.tsv`. Checked: no GPS in Exif or XMP;
  content is flowers only (no people, text or logos).

| File                        | Original corpus file                                                                                                   | Bytes     | Camera              | SHA-256                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- | ------------------- | ------------------------------------------------------------------ |
| `iphone17pro-portrait.heic` | `validate/11400-lilith-nature/11515_nature_orange-flower-closeup_colorado_ip17pro_iso320-f1p8_img-1420_4032x3024.heic` | 1,169,044 | Apple iPhone 17 Pro | `3a40dc2a49a22db4541553fca2310b98645ad338aa517b2507f7d09161e9c279` |
| `iphone8plus-portrait.heic` | `train/11400-lilith-nature/11514_nature_purple-allium-flowers_colorado_ip8plus_iso20-f2p8_img-1310_4032x3024.heic`     | 1,216,432 | Apple iPhone 8 Plus | `cb053b72bfb91b4facfc611aaf49b93257d3ca280750049fb7c721305fd4ece4` |

- **Structure (both):** primary item is a 4032 × 3024 grid of HEVC tiles with `irot` 270°
  and Exif Orientation 6, so it displays as **3024 × 4032 (portrait)**. The iPhone 17 Pro
  file also has an HDR gain map (`tmap`), extra grids and XMP; the iPhone 8 Plus file has
  none of these.
- **Used by (M2):** real iPhone HEIC decode, portrait dimensions, rotation applied once,
  primary image only (gain map ignored).
