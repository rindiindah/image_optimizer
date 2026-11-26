import { defaultEdits, defaultSettings } from "../../../src/features/settings/settings";
import type { ImageMetadata, QueueItem } from "../../../src/types/image";

/** A ready image in the list, with default settings (as the store makes it). */
export function readyItem(
  id: string,
  name: string,
  meta: Partial<ImageMetadata> = {},
  patch: Partial<QueueItem> = {},
): QueueItem {
  const metadata: ImageMetadata = {
    name,
    format: "jpeg",
    mime: "image/jpeg",
    extension: name.split(".").pop() ?? "",
    sizeBytes: 2_000_000,
    width: 4000,
    height: 3000,
    hasAlpha: false,
    notices: [],
    ...meta,
  };
  return {
    id,
    file: new File(["x"], name),
    name,
    extension: metadata.extension,
    sizeBytes: metadata.sizeBytes,
    status: "ready",
    notices: [],
    metadata,
    thumbnailUrl: `blob:thumb-${id}`,
    previewUrl: `blob:preview-${id}`,
    error: null,
    settings: defaultSettings(metadata),
    edits: defaultEdits(),
    job: { status: "idle" },
    result: null,
    ...patch,
  };
}
