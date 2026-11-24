import { useEffect, useRef, useState, type DragEvent } from "react";
import { strings } from "../../content/strings";
import { addFiles } from "./intake";

/** Lets HEIC files show in pickers that don't map them to image/*. Content is checked anyway. */
const ACCEPT = "image/*,.heic,.heif,.hif,.avif";

const hasFiles = (event: { dataTransfer: DataTransfer | null }) =>
  event.dataTransfer?.types.includes("Files") ?? false;

/** Add images: "Choose images" button, drag and drop onto this area, or paste anywhere. */
export function UploadArea({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // A file dropped outside the drop area would make the browser open it and leave the app
    // (losing the list), so the page itself ignores file drops.
    const block = (event: globalThis.DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
      window.removeEventListener("paste", paste);
    };
  }, []);

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <section
      aria-labelledby="upload-heading"
      onDragOver={onDragOver}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
      className={`rounded-card border-2 border-dashed px-6 text-center ${compact ? "py-5" : "py-10"} ${
        dragging ? "border-accent bg-canvas" : "border-border bg-surface"
      }`}
    >
      <h2 id="upload-heading" className="text-lg font-semibold">
        {dragging ? strings.upload.dropActive : strings.upload.heading}
      </h2>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="mt-3 rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
      >
        {strings.upload.chooseButton}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        aria-label={strings.upload.chooseButton}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = ""; // choosing the same file again still triggers a change
          void addFiles(files);
        }}
      />
      <p className="mt-3 text-sm text-text-muted">{strings.upload.hint}</p>
      <p className="mt-1 text-xs text-text-muted">{strings.upload.supported}</p>
    </section>
  );
}
