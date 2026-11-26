/**
 * Files from the picker, drag and drop or paste → checks → image list → inspection.
 * Main-thread checks need only the first bytes; decoding happens in the worker, one file at a
 * time (M2: the memory budget comes in M6). The worker never receives a file name.
 */
import { strings } from "../../content/strings";
import type { ImageErrorCode, ImageNotice, QueueItem } from "../../types/image";
import { displayName, fileExtension } from "../../utils/filename";
import { isFileTooLarge, MAX_FILES, remainingSlots } from "../../utils/limits";
import { detectFormat, extensionMismatch, SNIFF_BYTES } from "../../utils/sniff";
import { EngineClient } from "../../workers/engine-client";
import type { EngineErrorCode } from "../../workers/protocol";
import { useQueue } from "../queue/store";

/** Checks one file without decoding it. Returns a list entry: "reading", or "error" with why. */
export async function checkFile(file: File, id: string): Promise<QueueItem> {
  const extension = fileExtension(file.name);
  const base = {
    id,
    file,
    name: displayName(file.name),
    extension,
    sizeBytes: file.size,
    metadata: null,
    thumbnailUrl: null,
    previewUrl: null,
    settings: null,
    job: { status: "idle" } as const,
    result: null,
  };
  const fail = (error: ImageErrorCode): QueueItem => ({
    ...base,
    status: "error",
    notices: [],
    error,
  });

  if (file.size === 0) return fail("empty_file");
  if (isFileTooLarge(file.size)) return fail("file_too_large");
  const sniff = detectFormat(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()));
  if (sniff.kind === "svg") return fail("svg_not_supported");
  if (sniff.kind === "unknown") return fail("unsupported_format");

  const notices: ImageNotice[] = extensionMismatch(sniff.format, extension)
    ? [{ code: "extension_mismatch", extension }]
    : [];
  return { ...base, status: "reading", notices, error: null };
}

/** Engine codes an inspection can end with, as list error codes. */
function toImageError(code: EngineErrorCode): ImageErrorCode {
  switch (code) {
    case "megapixel_limit":
    case "blank_decode":
    case "unsupported_browser":
    case "worker_crashed":
      return code;
    default:
      return "decode_failed";
  }
}

let client: EngineClient | null = null;
/** Inspections run one after another, across batches. */
let queueTail: Promise<void> = Promise.resolve();

async function inspect(item: QueueItem): Promise<void> {
  client ??= new EngineClient();
  const outcome = await client.inspect(item.file);
  const queue = useQueue.getState();
  if (outcome.status === "done") {
    queue.setReady(
      item.id,
      outcome.info,
      URL.createObjectURL(outcome.thumbnail),
      URL.createObjectURL(outcome.preview),
    );
  } else {
    queue.setError(
      item.id,
      outcome.status === "error" ? toImageError(outcome.code) : "decode_failed",
    );
  }
}

/** Adds files to the list (up to the limit), then reads them and announces the outcome. */
export async function addFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;
  const checked = await Promise.all(
    files.slice(0, MAX_FILES).map((file) => checkFile(file, crypto.randomUUID())),
  );
  // Slots are counted when adding (not before the async checks), so two quick batches can't
  // together go over the limit.
  const queue = useQueue.getState();
  const accepted = checked.slice(0, remainingSlots(queue.items.length));
  const notAdded = files.length - accepted.length;
  queue.add(accepted);

  const batch = (queueTail = queueTail.then(async () => {
    for (const item of accepted) {
      if (item.status !== "reading") continue;
      if (!useQueue.getState().items.some((other) => other.id === item.id)) continue; // removed
      try {
        await inspect(item);
      } catch {
        // Never let one file stop the chain for the files after it.
        useQueue.getState().setError(item.id, "decode_failed");
      }
    }
  }));
  await batch;

  const ids = new Set(accepted.map((item) => item.id));
  const now = useQueue.getState().items.filter((item) => ids.has(item.id));
  useQueue
    .getState()
    .announce(
      strings.queue.announcement(
        now.filter((item) => item.status === "ready").length,
        now.filter((item) => item.status === "error").length,
        notAdded,
      ),
    );
}
