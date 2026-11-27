/**
 * "Download selected (ZIP)" (M6, D23 Q5–Q7): each checked image's selected candidate (D14), only
 * up-to-date results; the rest are counted so the UI can say what was left out and why.
 * STORE only (client-zip doesn't compress; images are already compressed), Zip64 when needed.
 */
import { downloadZip } from "client-zip";
import type { QueueItem } from "../../types/image";
import { downloadName } from "../../utils/download-name";

export const ZIP_NAME = "optimized-images.zip";

export interface ZipEntry {
  name: string;
  file: Blob;
}

export interface LeftOut {
  /** Not optimized yet (or it couldn't be read, failed, or was cancelled before a result). */
  noResult: number;
  /** Made with earlier settings. */
  outdated: number;
  /** Optimized, but no file fits (Maximum/Range unreachable). */
  noFile: number;
}

/** Entries for the checked images, in list order, with collision-safe names. */
export function zipEntries(
  items: QueueItem[],
  checked: string[],
): { entries: ZipEntry[]; leftOut: LeftOut } {
  const wanted = new Set(checked);
  const leftOut: LeftOut = { noResult: 0, outdated: 0, noFile: 0 };
  const picked: { item: QueueItem; file: Blob; mime: string }[] = [];
  for (const item of items) {
    if (!wanted.has(item.id)) continue;
    const result = item.result;
    const index = result?.selected ?? null;
    const file = index === null ? undefined : result?.files[index];
    const mime = index === null ? undefined : result?.result.candidates[index]?.mime;
    if (!result) leftOut.noResult += 1;
    else if (result.outdated) leftOut.outdated += 1;
    else if (!file || !mime) leftOut.noFile += 1;
    else picked.push({ item, file, mime });
  }
  const used = new Set<string>();
  const entries = picked.map(({ item, file, mime }) => {
    let copy = 1;
    let name = downloadName(item.file.name, mime);
    // Windows and macOS treat names case-insensitively, so "A.jpg" and "a.jpg" collide.
    while (used.has(name.toLowerCase())) name = downloadName(item.file.name, mime, ++copy);
    used.add(name.toLowerCase());
    return { name, file };
  });
  return { entries, leftOut };
}

/** Builds the ZIP. `onProgress(done, total)` counts entries written so far. */
export async function buildZip(
  entries: ZipEntry[],
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const lastModified = new Date(); // not the originals' dates: nothing about the source leaks
  const total = entries.length;
  function* inputs() {
    for (const [index, entry] of entries.entries()) {
      onProgress(index, total); // client-zip asks for the next entry once the last one is written
      yield { name: entry.name, input: entry.file, lastModified };
    }
  }
  const blob = await downloadZip(inputs()).blob();
  onProgress(total, total);
  return blob;
}

/** Saves a blob through a temporary link, then releases the URL. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // shortcut: revoking right after click() can cancel the download in some browsers; 60 s is
  // ample for the browser to take over the blob. Revisit if huge ZIPs show a problem (M7 audit).
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
