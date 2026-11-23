import type { Flag } from "../types/engine";

export interface EncodeRequest {
  width: number;
  height: number;
  /** Encoder quality, or null for encoders without a quality setting. */
  quality: number | null;
}

export interface EncodeOutput<P> {
  /** Size of the generated file in bytes (blob.size / byteLength), never estimated. */
  bytes: number;
  /** MIME type actually produced. */
  mime: string;
  /** The encoded file (opaque to the engine). */
  payload: P;
  /** Flags this encode caused, e.g. "colors_reduced" or "format_fallback". */
  flags: readonly Flag[];
}

/**
 * One output format. The engine only sees sizes; the implementation resizes and encodes.
 * `qualityRange: null` means a single setting (e.g. lossless PNG without colour reduction).
 */
export interface Encoder<P> {
  readonly qualityRange: { min: number; max: number } | null;
  encode(request: EncodeRequest, signal: AbortSignal): Promise<EncodeOutput<P>>;
}
