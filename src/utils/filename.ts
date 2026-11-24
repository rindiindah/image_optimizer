/**
 * Display-safe file names. Names come from the user's system and are untrusted: they are
 * always rendered as text (never as HTML), and invisible characters that could disguise a
 * name are removed (control characters, bidirectional overrides such as "photo\u202Egpj.exe").
 */

/** Longest name shown, in characters; longer names keep their start and their extension. */
export const MAX_DISPLAY_NAME_LENGTH = 80;

// C0/C1 controls, bidi embeddings/overrides/isolates/marks, zero-width chars and the BOM.
const INVISIBLE =
  // eslint-disable-next-line no-control-regex -- matching control characters is the purpose here
  /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu;

export function cleanFileName(name: string): string {
  // Whitespace first (tabs/newlines become spaces), so words aren't glued together.
  return name.replace(/\s+/gu, " ").replace(INVISIBLE, "").replace(/ {2,}/gu, " ").trim();
}

/** Lower-case extension without the dot ("" when there is none, or for names like ".env"). */
export function fileExtension(name: string): string {
  const clean = cleanFileName(name);
  const dot = clean.lastIndexOf(".");
  if (dot <= 0 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

/**
 * The name as shown in the UI: cleaned, then shortened to `MAX_DISPLAY_NAME_LENGTH` characters
 * with "…" while keeping the extension visible. Counts code points, so emoji aren't split.
 * Returns "" when nothing printable is left (the UI shows a fallback label).
 */
export function displayName(name: string): string {
  const clean = cleanFileName(name);
  const chars = Array.from(clean);
  if (chars.length <= MAX_DISPLAY_NAME_LENGTH) return clean;

  const extension = fileExtension(clean);
  const tail = extension && extension.length <= 10 ? `.${extension}` : "";
  const keep = MAX_DISPLAY_NAME_LENGTH - Array.from(tail).length - 1;
  return `${chars.slice(0, keep).join("").trimEnd()}…${tail}`;
}
