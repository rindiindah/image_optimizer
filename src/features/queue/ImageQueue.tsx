import { useShallow } from "zustand/react/shallow";
import { strings } from "../../content/strings";
import type { ImageNotice, InputFormat } from "../../types/image";
import { formatSize } from "../../utils/file-size";
import { useQueue } from "./store";

const formatLabel = (format: InputFormat, mime: string) =>
  strings.formats[mime === "image/heif" ? "heif" : format];

const noticeText = (notice: ImageNotice, type: string) =>
  notice.code === "extension_mismatch"
    ? strings.notices.extension_mismatch(type, notice.extension)
    : strings.notices[notice.code];

const statusColour = { reading: "text-text-muted", ready: "text-success", error: "text-danger" };

/** One image. Subscribes only to its own entry, so other images changing don't re-render it. */
function Row({ id }: { id: string }) {
  const item = useQueue((state) => state.items.find((other) => other.id === id));
  const selected = useQueue((state) => state.selectedId === id);
  if (!item) return null;
  const { select, remove } = useQueue.getState();

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

  return (
    <li
      className={`rounded-card border bg-surface p-3 ${selected ? "border-accent" : "border-border"}`}
    >
      <div className="flex gap-3">
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
            <span className={`block text-sm font-medium ${statusColour[item.status]}`}>
              {strings.queue.status[item.status]}
            </span>
          </span>
        </button>
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
      <ul className="mt-3 flex flex-col gap-2">
        {ids.map((id) => (
          <Row key={id} id={id} />
        ))}
      </ul>
    </section>
  );
}
