/**
 * Download file names (M3 Q5): "{name}-optimized.{ext}", safe on Windows, macOS and Linux.
 * The extension comes from the real MIME type of the output (it can differ after a fallback).
 */
import { cleanFileName } from "./filename";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Longest stem kept, in characters (most systems allow 255 bytes for the whole name). */
const MAX_STEM_LENGTH = 100;

// Characters Windows forbids in names (macOS/Linux forbid a subset).
const FORBIDDEN = /[<>:"/\\|?*]/gu;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

export function downloadName(originalName: string, mime: string): string {
  const clean = cleanFileName(originalName);
  const dot = clean.lastIndexOf(".");
  let stem = (dot > 0 ? clean.slice(0, dot) : clean).replace(FORBIDDEN, "_");
  stem = Array.from(stem).slice(0, MAX_STEM_LENGTH).join("");
  // Windows drops trailing dots and spaces; leading dots hide files on macOS/Linux.
  stem = stem.replace(/^[.\s]+|[.\s]+$/gu, "");
  if (stem === "" || WINDOWS_RESERVED.test(stem)) stem = stem ? `${stem}_` : "image";
  return `${stem}-optimized.${EXTENSIONS[mime] ?? "img"}`;
}
