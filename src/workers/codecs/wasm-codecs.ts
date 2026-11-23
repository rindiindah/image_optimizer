/**
 * WASM encoders (D15), each lazy-loaded the first time its format is used.
 * Every .wasm file is emitted by Vite (`?url`) and fetched from our own origin,
 * so the CSP (`connect-src 'self'`, `'wasm-unsafe-eval'`) is enough.
 */

/** A codec reports load failures separately, so the caller can fall back to the native encoder. */
export class CodecLoadError extends Error {
  override name = "CodecLoadError";
}

async function load<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    throw new CodecLoadError("codec failed to load", { cause: error });
  }
}

// --- JPEG: MozJPEG via @jsquash/jpeg -------------------------------------------------------

type JpegEncode = (data: ImageData, options: { quality: number }) => Promise<ArrayBuffer>;
let jpeg: Promise<JpegEncode> | null = null;

export function loadJpeg(): Promise<JpegEncode> {
  jpeg ??= load(async () => {
    const [{ default: encode, init }, { default: wasmUrl }] = await Promise.all([
      import("@jsquash/jpeg/encode.js"),
      import("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url"),
    ]);
    await init({ locateFile: () => wasmUrl });
    return encode;
  });
  return jpeg;
}

// --- WebP: libwebp via @jsquash/webp (picks its SIMD build itself) -------------------------

type WebpEncode = (data: ImageData, options: { quality: number }) => Promise<ArrayBuffer>;
let webp: Promise<WebpEncode> | null = null;

export function loadWebp(): Promise<WebpEncode> {
  webp ??= load(async () => {
    const [{ default: encode, init }, { default: plainUrl }, { default: simdUrl }] =
      await Promise.all([
        import("@jsquash/webp/encode.js"),
        import("@jsquash/webp/codec/enc/webp_enc.wasm?url"),
        import("@jsquash/webp/codec/enc/webp_enc_simd.wasm?url"),
      ]);
    await init({ locateFile: (path: string) => (path.includes("simd") ? simdUrl : plainUrl) });
    return encode;
  });
  return webp;
}

// --- PNG lossless: OxiPNG via @jsquash/oxipng (single-thread build only) -------------------

export const OXIPNG_LEVEL = 2;

interface Oxipng {
  optimise(data: Uint8Array, level: number, interlace: boolean, optimizeAlpha: boolean): Uint8Array;
  optimiseRaw(data: Uint8ClampedArray, width: number, height: number, level: number): Uint8Array;
}
let oxipng: Promise<Oxipng> | null = null;

export function loadOxipng(): Promise<Oxipng> {
  oxipng ??= load(async () => {
    const [module, { default: wasmUrl }] = await Promise.all([
      import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js"),
      import("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url"),
    ]);
    await module.default(wasmUrl);
    return {
      optimise: (data, level, interlace, optimizeAlpha) =>
        module.optimise(data, level, interlace, optimizeAlpha),
      // optimizeAlpha=false: never alter pixels, even fully transparent ones.
      optimiseRaw: (data, width, height, level) =>
        module.optimise_raw(data, width, height, level, false, false),
    };
  });
  return oxipng;
}

// --- PNG colour reduction: libimagequant via libimagequant-wasm (raw WASM export) ----------

/** libimagequant-wasm refuses larger images (its README: 16,777,216 pixels). */
export const QUANTIZER_MAX_PIXELS = 16_777_216;

type QuantModule = typeof import("libimagequant-wasm/wasm/libimagequant_wasm.js");
let quant: Promise<QuantModule> | null = null;

export function loadQuantizer(): Promise<QuantModule> {
  quant ??= load(async () => {
    const [module, { default: wasmUrl }] = await Promise.all([
      import("libimagequant-wasm/wasm/libimagequant_wasm.js"),
      import("libimagequant-wasm/wasm/libimagequant_wasm_bg.wasm?url"),
    ]);
    await module.default({ module_or_path: wasmUrl });
    return module;
  });
  return quant;
}

/**
 * Reduces the image to at most 256 colours at the given libimagequant quality (0–100)
 * and returns an indexed PNG (not yet optimised).
 */
export async function quantizeToPng(image: ImageData, quality: number): Promise<Uint8Array> {
  const module = await loadQuantizer();
  const quantizer = new module.ImageQuantizer();
  try {
    quantizer.setMaxColors(256);
    quantizer.setQuality(0, quality);
    const result = quantizer.quantizeImage(image.data, image.width, image.height);
    try {
      const indices = result.getPaletteIndices(image.data, image.width, image.height);
      return module.encode_palette_to_png(indices, result.getPalette(), image.width, image.height);
    } finally {
      result.free();
    }
  } finally {
    quantizer.free();
  }
}
