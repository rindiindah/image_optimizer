/**
 * Minimal types for the libheif-js ESM bundle (the WASM is embedded and passed to Emscripten
 * as `wasmBinary`, so it compiles from memory and never fetches a URL). Only what we use.
 * The package ships no types for this entry point.
 */
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  export interface HeifImageHandle {
    /** Display width after libheif's own transforms (irot/imir/clap). */
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    has_alpha_channel(): boolean;
    /** Decodes to interleaved 8-bit RGBA into `target.data`; calls back with `null` on failure. */
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: { data: Uint8ClampedArray } | null) => void,
    ): void;
    free(): void;
  }

  export interface HeifDecoderInstance {
    /** One handle per top-level image, in file order; `[]` when the file can't be parsed. */
    decode(input: ArrayBuffer | Uint8Array): HeifImageHandle[];
  }

  export interface LibHeif {
    HeifDecoder: new () => HeifDecoderInstance;
  }

  const factory: (options?: Record<string, unknown>) => LibHeif;
  export default factory;
}
