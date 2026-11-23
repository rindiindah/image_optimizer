import type { EncodeOutput, EncodeRequest, Encoder } from "../../../src/engine/encoder";
import type { Flag } from "../../../src/types/engine";

export interface FakeEncoderOptions {
  /** Size in bytes for a given quality at full size (quality is null for lossless-only encoders). */
  sizeAt: (quality: number | null) => number;
  qualityRange?: { min: number; max: number } | null;
  /** Source dimensions; sizes scale with pixel area when dimensions are reduced. */
  source?: { width: number; height: number };
  mime?: string;
  flags?: Flag[];
  /** Called before each encode, e.g. to advance a fake clock or abort. */
  onEncode?: (request: EncodeRequest) => void;
}

export interface FakeEncoder extends Encoder<string> {
  calls: EncodeRequest[];
}

/** Monotonic size curve: grows exponentially with quality (similar to real JPEG/WebP). */
export function exponentialSizes(at1: number, at100: number): (q: number | null) => number {
  const ratio = Math.log(at100 / at1) / 99;
  return (q) => Math.round(at1 * Math.exp(ratio * ((q ?? 100) - 1)));
}

export function createFakeEncoder(options: FakeEncoderOptions): FakeEncoder {
  const source = options.source ?? { width: 4000, height: 3000 };
  const calls: EncodeRequest[] = [];
  return {
    qualityRange: options.qualityRange === undefined ? { min: 1, max: 100 } : options.qualityRange,
    calls,
    encode(request: EncodeRequest): Promise<EncodeOutput<string>> {
      calls.push(request);
      options.onEncode?.(request);
      const areaRatio = (request.width * request.height) / (source.width * source.height);
      const bytes = Math.max(1, Math.round(options.sizeAt(request.quality) * areaRatio));
      return Promise.resolve({
        bytes,
        mime: options.mime ?? "image/jpeg",
        payload: `q=${String(request.quality)} ${String(request.width)}x${String(request.height)}`,
        flags: options.flags ?? [],
      });
    },
  };
}
