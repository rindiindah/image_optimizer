import { strings } from "../../content/strings";
import { useQueue } from "../queue/store";

/**
 * Larger view of the selected image (Q5), made in the worker so HEIC shows in every browser.
 * Shows the original only; nothing processed exists yet in M2.
 */
export function ImagePreview() {
  const item = useQueue((state) => state.items.find((other) => other.id === state.selectedId));
  if (!item) return null;
  const name = item.name || strings.queue.untitled;

  return (
    <section
      aria-labelledby="preview-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="preview-heading" className="text-lg font-semibold">
        {strings.preview.heading}
      </h2>
      {item.previewUrl ? (
        <figure className="mt-3">
          <img
            src={item.previewUrl}
            alt={strings.preview.alt(name)}
            className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
          />
          <figcaption className="mt-2 text-sm text-text-muted">
            {strings.preview.caption}
          </figcaption>
        </figure>
      ) : (
        <p className="mt-3 text-sm text-text-muted">{strings.queue.status[item.status]}</p>
      )}
    </section>
  );
}
