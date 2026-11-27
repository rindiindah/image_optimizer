/**
 * Batch scheduling rules (M6, D23 Q4). Pure: which queued image may start next.
 * 2 jobs at once, or 1 on a touch-first or small device; a HEIC job runs alone; the running jobs'
 * source pixels together stay within the per-image limit (50 MP), and one job may always run alone.
 */
import { MAX_PIXELS } from "../../utils/limits";

export interface BatchJob {
  id: string;
  /** Source pixels after orientation (width × height). */
  pixels: number;
  heic: boolean;
}

/** Most jobs at once: 1 on a coarse pointer (phones, tablets) or with ≤ 4 CPU cores, else 2. */
export function concurrencyFor(coarsePointer: boolean, cores: number): 1 | 2 {
  return coarsePointer || cores <= 4 ? 1 : 2;
}

/** The rule for this browser; 1 when it can't tell. */
export function detectConcurrency(): 1 | 2 {
  const coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : true;
  const cores = typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency;
  return concurrencyFor(coarse, cores);
}

export function canStart(running: BatchJob[], next: BatchJob, limit: number): boolean {
  if (running.length === 0) return true;
  if (running.length >= limit) return false;
  if (next.heic || running.some((job) => job.heic)) return false;
  const used = running.reduce((sum, job) => sum + job.pixels, 0);
  return used + next.pixels <= MAX_PIXELS;
}
