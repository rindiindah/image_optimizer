import { useEffect, useRef, useState } from "react";
import { strings } from "../../content/strings";
import type { QueueItem } from "../../types/image";
import { CropEditor } from "../edit/CropEditor";
import { drawEdited, loadImage } from "../edit/draw";
import { useQueue } from "../queue/store";

/**
 * The selected image (M2 Q5), made in the worker so HEIC shows in every browser. After crop
 * or rotate (M4) it shows the edited view, labelled, with "Show original" (Q7).
 */
export function ImagePreview() {
  const item = useQueue((state) => state.items.find((other) => other.id === state.selectedId));
  if (!item) return null;
  // A new key per image: the editor and the toggle never carry over to another image.
  return <Preview key={item.id} item={item} />;
}

function Preview({ item }: { item: QueueItem }) {
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const name = item.name || strings.queue.untitled;
  const edits = item.edits;
  const edited = edits !== null && (edits.crop !== null || edits.rotation !== 0);
  const running = item.job.status === "running";

  if (editing && item.metadata) {
    return (
      <CropEditor
        item={item}
        onClose={() => {
          setEditing(false);
          setShowOriginal(false);
          requestAnimationFrame(() => editButton.current?.focus());
        }}
      />
    );
  }

  return (
    <section
      aria-labelledby="preview-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="preview-heading" className="text-lg font-semibold">
          {strings.preview.heading}
        </h2>
        {item.status === "ready" && item.metadata && (
          <div className="flex flex-wrap gap-2">
            {edited && (
              <button
                type="button"
                aria-pressed={showOriginal}
                onClick={() => {
                  setShowOriginal(!showOriginal);
                }}
                className="rounded-control border border-border px-3 py-1.5 text-sm font-medium"
              >
                {strings.preview.showOriginal}
              </button>
            )}
            <button
              ref={editButton}
              type="button"
              disabled={running}
              aria-describedby={running ? "edit-busy" : undefined}
              onClick={() => {
                setEditing(true);
              }}
              className="rounded-control border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {strings.preview.edit}
            </button>
          </div>
        )}
      </div>
      {running && (
        <p id="edit-busy" className="mt-1 text-sm text-text-muted">
          {strings.preview.editBusy}
        </p>
      )}
      {item.previewUrl ? (
        <figure className="mt-3">
          {edited && !showOriginal && item.metadata ? (
            <EditedView item={item} name={name} />
          ) : (
            <img
              src={item.previewUrl}
              alt={strings.preview.alt(name)}
              className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
            />
          )}
          <figcaption className="mt-2 text-sm text-text-muted">
            {edited && !showOriginal
              ? strings.preview.edited(
                  edits.crop ? strings.queue.dimensions(edits.crop.width, edits.crop.height) : null,
                  edits.rotation,
                )
              : strings.preview.caption}
          </figcaption>
        </figure>
      ) : (
        <p className="mt-3 text-sm text-text-muted">{strings.queue.status[item.status]}</p>
      )}
    </section>
  );
}

/** The preview drawn cropped and rotated (display only; the worker does the real edit). */
function EditedView({ item, name }: { item: QueueItem; name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { previewUrl, metadata, edits } = item;
  const width = metadata?.width ?? 1;
  const height = metadata?.height ?? 1;
  const crop = edits?.crop ?? null;
  const rotation = edits?.rotation ?? 0;

  useEffect(() => {
    let live = true;
    if (previewUrl) {
      void loadImage(previewUrl).then((image) => {
        if (live && image && canvas.current) {
          drawEdited(canvas.current, image, { width, height }, crop, rotation);
        }
      });
    }
    return () => {
      live = false;
    };
  }, [previewUrl, width, height, crop, rotation]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={strings.preview.editedAlt(name)}
      className="mx-auto block h-auto max-h-[70vh] max-w-full"
    />
  );
}
