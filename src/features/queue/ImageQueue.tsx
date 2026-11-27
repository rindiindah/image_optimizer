import { useShallow } from "zustand/react/shallow";
import { strings } from "../../content/strings";
import type { ImageNotice, InputFormat, QueueItem } from "../../types/image";
import { formatSize } from "../../utils/file-size";
import { cancelImage, optimizeImages } from "../process/run";
import { sizeOf } from "../results/size";
import { BatchBar } from "./BatchBar";
import { useQueue } from "./store";

const formatLabel = (format: InputFormat, mime: string) =>
  strings.formats[mime === "image/heif" ? "heif" : format];

const noticeText = (notice: ImageNotice, type: string) =>
  notice.code === "extension_mismatch"
    ? strings.notices.extension_mismatch(type, notice.extension)
    : strings.notices[notice.code];

const statusColour = { reading: "text-text-muted", ready: "text-success", error: "text-danger" };

/** The row's status in words (D23 Q9): the job, else the result, else "Ready". */
function jobText(item: QueueItem): { text: string; colour: string } {
  const t = strings.queue.job;
  const muted = "text-text-muted";
  const { job, result } = item;
  if (job.status === "queued") return { text: t.waiting, colour: muted };
  if (job.status === "running") {
    const p = job.progress;
    return { text: p ? t.attempt(p.attempt, p.maxAttempts) : t.starting, colour: muted };
  }
  if (job.status === "error")
    return { text: t.failed(strings.process.errors[job.code].what), colour: "text-danger" };
  if (job.status === "cancelled") return { text: t.cancelled, colour: muted };
  if (job.status === "skipped") return { text: t.skipped, colour: "text-warning" };
  if (!result) return { text: strings.queue.status.ready, colour: "text-success" };
  if (result.outdated) return { text: t.outdated, colour: "text-warning" };
  const c = result.selected === null ? undefined : result.result.candidates[result.selected];
  if (!c) return { text: t.noFile, colour: "text-warning" };
  const size = sizeOf(result.goal, c.bytes);
  if (result.goal.mode !== "target") return { text: t.done(size), colour: "text-success" };
  if (c.outcome === "met") return { text: t.targetMet(size), colour: "text-success" };
  if (c.outcome === "close") return { text: t.targetClose(size), colour: "text-success" };
  return { text: t.targetMissed(size), colour: "text-warning" };
}

/** One image. Subscribes only to its own entry, so other images changing don't re-render it. */
function Row({ id }: { id: string }) {
  const item = useQueue((state) => state.items.find((other) => other.id === id));
  const selected = useQueue((state) => state.selectedId === id);
  const checked = useQueue((state) => state.checked.includes(id));
  if (!item) return null;
  const { select, remove, setChecked } = useQueue.getState();

  const name = item.name || strings.queue.untitled;
  const meta = item.metadata;
  const type = meta ? formatLabel(meta.format, meta.mime) : "";
  const details = [
    type,
    formatSize(item.sizeBytes),
    meta && strings.queue.dimensions(meta.width, meta.height),
    meta?.hasAlpha && strings.queue.transparent,
  ].filter(Boolean);
  const error = item.error && strings.imageErrors[item.error];
  const notices = meta?.notices ?? item.notices;
  const status =
    item.status === "ready"
      ? jobText(item)
      : { text: strings.queue.status[item.status], colour: statusColour[item.status] };
  const busy = item.job.status === "queued" || item.job.status === "running";
  const retry = item.job.status === "error" || item.job.status === "cancelled";

  return (
    <li
      className={`rounded-card border bg-surface p-3 ${selected ? "border-accent" : "border-border"}`}
    >
      <div className="flex gap-3">
        <input
          type="checkbox"
          checked={checked}
          aria-label={strings.queue.checkLabel(name)}
          onChange={(e) => {
            setChecked(id, e.target.checked);
          }}
          className="mt-1 size-5 shrink-0"
        />
        <button
          type="button"
          aria-pressed={selected}
          aria-label={strings.queue.selectLabel(name)}
          onClick={() => {
            select(id);
          }}
          className="flex min-w-0 flex-1 gap-3 text-left"
        >
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-canvas">
            {item.thumbnailUrl && (
              <img src={item.thumbnailUrl} alt="" className="size-full object-contain" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium" title={name}>
              {name}
            </span>
            <span className="block text-sm text-text-muted">{details.join(" · ")}</span>
            <span className={`block text-sm font-medium ${status.colour}`}>{status.text}</span>
          </span>
        </button>
        {busy && (
          <button
            type="button"
            aria-label={strings.queue.cancelLabel(name)}
            onClick={() => {
              cancelImage(id);
            }}
            className="self-start rounded-control border border-border px-2 py-1 text-sm"
          >
            {strings.process.cancel}
          </button>
        )}
        {retry && (
          <button
            type="button"
            aria-label={strings.queue.retryLabel(name)}
            onClick={() => {
              optimizeImages([id]);
            }}
            className="self-start rounded-control border border-border px-2 py-1 text-sm"
          >
            {strings.queue.retry}
          </button>
        )}
        <button
          type="button"
          aria-label={strings.queue.removeLabel(name)}
          onClick={() => {
            remove(id);
          }}
          className="self-start rounded-control border border-border px-2 py-1 text-sm"
        >
          {strings.queue.remove}
        </button>
      </div>
      {error ? (
        <div className="mt-2 text-sm">
          <p>{error.what}</p>
          <p className="text-text-muted">{strings.imageErrors.originalSafe}</p>
          <p className="text-text-muted">{error.next}</p>
        </div>
      ) : (
        notices.length > 0 && (
          <ul className="mt-2 list-disc ps-5 text-sm text-text-muted">
            {notices.map((notice) => (
              <li key={notice.code}>{noticeText(notice, type)}</li>
            ))}
          </ul>
        )
      )}
    </li>
  );
}

export function ImageQueue() {
  const ids = useQueue(useShallow((state) => state.items.map((item) => item.id)));
  return (
    <section aria-labelledby="queue-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h1 id="queue-heading" className="text-xl font-semibold">
          {strings.queue.heading}
        </h1>
        <p className="text-sm text-text-muted">{strings.queue.count(ids.length)}</p>
      </div>
      <BatchBar />
      <ul className="mt-3 flex flex-col gap-2">
        {ids.map((id) => (
          <Row key={id} id={id} />
        ))}
      </ul>
    </section>
  );
}
