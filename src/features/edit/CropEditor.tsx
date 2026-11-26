import { useEffect, useRef, useState } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { strings } from "../../content/strings";
import type { Dimensions, Rect, Rotation } from "../../types/engine";
import type { EditSettings, QueueItem, RatioPreset } from "../../types/image";
import {
  clampRect,
  fitAspect,
  isValidRect,
  linkedSide,
  rotatedSize,
  rotateRect,
  turn,
  unrotateRect,
} from "../../utils/edits";
import { useQueue } from "../queue/store";
import { defaultEdits, parsePixels } from "../settings/settings";
import { drawEdited, loadImage } from "./draw";

const t = strings.edit;
const RATIOS: RatioPreset[] = ["free", "original", "1:1", "4:3", "3:2", "16:9", "exact"];
/** Ratios with a portrait version (Q4). */
const ORIENTED: Partial<Record<RatioPreset, number>> = {
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
};
const FIELDS = ["x", "y", "width", "height"] as const;
type Field = (typeof FIELDS)[number];

const buttonClass = "rounded-control border border-border px-3 py-1.5 font-medium";
const inputClass =
  "w-24 rounded-control border border-border bg-surface px-2 py-1 aria-[invalid=true]:border-danger";

/** Width / height of the selection for a preset; undefined = free. */
function aspectFor(
  ratio: RatioPreset,
  portrait: boolean,
  shown: Dimensions,
  exact: Dimensions | null,
): number | undefined {
  if (ratio === "free") return undefined;
  if (ratio === "original") return shown.width / shown.height;
  if (ratio === "1:1") return 1;
  if (ratio === "exact") return exact ? exact.width / exact.height : undefined;
  const landscape = ORIENTED[ratio] ?? 1;
  return portrait ? 1 / landscape : landscape;
}

function parseExact(text: { width: string; height: string }): Dimensions | null {
  const width = parsePixels(text.width);
  const height = parsePixels(text.height);
  if (width === null || height === null || Number.isNaN(width) || Number.isNaN(height)) return null;
  return { width, height };
}

/**
 * Crop and rotate for one image (M4). Works on the rotated preview the user sees; the stored
 * crop is converted back to source pixels before rotation (Q2: the crop rotates with the image).
 * Nothing changes until "Apply crop".
 */
export function CropEditor({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const source: Dimensions = {
    width: item.metadata?.width ?? 1,
    height: item.metadata?.height ?? 1,
  };
  const start = item.edits ?? defaultEdits();
  const [rotation, setRotation] = useState<Rotation>(start.rotation);
  const shown = rotatedSize(source, rotation);
  // The selection in the rotated image as shown, in source pixels; null = whole image.
  const [crop, setCrop] = useState<Rect | null>(
    start.crop ? rotateRect(start.crop, source, start.rotation) : null,
  );
  const [ratio, setRatio] = useState<RatioPreset>(start.ratio);
  const [portrait, setPortrait] = useState(start.portrait);
  const [exactText, setExactText] = useState({
    width: start.exact ? String(start.exact.width) : "",
    height: start.exact ? String(start.exact.height) : "",
  });
  /** Field text while it doesn't (yet) describe a valid selection; null = show the selection. */
  const [draft, setDraft] = useState<Record<Field, string> | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  /** The library's selection while a drag is in progress (it starts at zero size). */
  const [live, setLive] = useState<PercentCrop | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  /** Sets the selection from the fields, a shape, rotate or reset (not from a drag). */
  const select = (rect: Rect | null) => {
    setCrop(rect);
    setLive(null);
  };

  const exact = ratio === "exact" ? parseExact(exactText) : null;
  const aspect = aspectFor(ratio, portrait, shown, exact);
  const area = crop ?? { x: 0, y: 0, ...shown };

  useEffect(() => {
    heading.current?.focus();
    let live = true;
    if (item.previewUrl) {
      void loadImage(item.previewUrl).then((loaded) => {
        if (live) setImage(loaded);
      });
    }
    return () => {
      live = false;
    };
  }, [item.previewUrl]);

  useEffect(() => {
    if (image && canvas.current) drawEdited(canvas.current, image, source, null, rotation);
  }, [image, rotation, source.width, source.height]); // eslint-disable-line react-hooks/exhaustive-deps -- `source` is rebuilt each render; its sides are the inputs

  /**
   * A new selection shape: the largest centred selection of that shape in the whole image.
   * (Fitting inside the current selection would shrink it again on every keystroke of an
   * Exact size.) Free keeps the current selection.
   */
  const refit = (nextAspect: number | undefined, current: Rect | null, size: Dimensions) => {
    if (nextAspect === undefined) return current;
    return fitAspect({ x: 0, y: 0, ...size }, nextAspect);
  };

  const rotate = (by: 90 | -90) => {
    const next = turn(rotation, by);
    const nextShown = rotatedSize(source, next);
    const rotated = crop ? rotateRect(crop, shown, by === 90 ? 90 : 270) : null;
    // Landscape presets become their portrait version (and back) with the image.
    const nextPortrait = ORIENTED[ratio] !== undefined ? !portrait : portrait;
    setRotation(next);
    setPortrait(nextPortrait);
    select(
      ratio === "exact"
        ? refit(aspectFor(ratio, nextPortrait, nextShown, exact), rotated, nextShown)
        : rotated,
    );
    setDraft(null);
  };

  const chooseRatio = (next: RatioPreset) => {
    setRatio(next);
    const nextExact = next === "exact" ? parseExact(exactText) : null;
    select(refit(aspectFor(next, portrait, shown, nextExact), crop, shown));
    setDraft(null);
  };

  const fromLibrary = (percent: PercentCrop) => {
    setLive(percent); // the library is controlled: it continues a drag from what we pass back
    if (percent.width <= 0 || percent.height <= 0) return;
    setCrop(
      clampRect(
        {
          x: (percent.x / 100) * shown.width,
          y: (percent.y / 100) * shown.height,
          width: (percent.width / 100) * shown.width,
          height: (percent.height / 100) * shown.height,
        },
        shown,
      ),
    );
    setDraft(null);
  };

  const fieldValues: Record<Field, string> = draft ?? {
    x: String(area.x),
    y: String(area.y),
    width: String(area.width),
    height: String(area.height),
  };
  const typeField = (field: Field, text: string) => {
    const next = { ...fieldValues, [field]: text };
    // With a fixed shape, typing one side sets the other.
    const n = parsePixels(text);
    if (aspect !== undefined && n !== null && !Number.isNaN(n)) {
      if (field === "width") next.height = String(linkedSide(n, aspect, 1));
      if (field === "height") next.width = String(linkedSide(n, 1, aspect));
    }
    const values = FIELDS.map((f) => (next[f].trim() === "" ? Number.NaN : Number(next[f])));
    const rect = {
      x: values[0] ?? 0,
      y: values[1] ?? 0,
      width: values[2] ?? 0,
      height: values[3] ?? 0,
    };
    if (FIELDS.every((f) => /^\d+$/.test(next[f].trim())) && isValidRect(rect, shown)) {
      select(rect);
      setDraft(null);
    } else setDraft(next);
  };

  const exactTooLarge = exact !== null && (exact.width > area.width || exact.height > area.height);
  const exactInvalid = ratio === "exact" && exact === null;
  const canApply = draft === null && !exactTooLarge && !exactInvalid;

  const apply = () => {
    // A selection of the whole image is stored as "no crop".
    const partial = crop && (crop.width < shown.width || crop.height < shown.height) ? crop : null;
    const edits: EditSettings = {
      crop: partial ? unrotateRect(partial, source, rotation) : null,
      rotation,
      ratio,
      portrait,
      exact,
    };
    useQueue.getState().updateEdits(item.id, edits);
    onClose();
  };

  const reset = () => {
    setRotation(0);
    select(null);
    setRatio("free");
    setPortrait(false);
    setExactText({ width: "", height: "" });
    setDraft(null);
  };

  return (
    <section
      aria-labelledby="crop-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="crop-heading" ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {t.heading}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{t.help}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="crop-ratio" className="block font-medium">
            {t.ratioLabel}
          </label>
          <select
            id="crop-ratio"
            value={ratio}
            onChange={(e) => {
              chooseRatio(e.target.value as RatioPreset);
            }}
            className={`${inputClass} mt-1 w-auto`}
          >
            {RATIOS.map((r) => (
              <option key={r} value={r}>
                {t.ratios[r]}
              </option>
            ))}
          </select>
        </div>
        {ORIENTED[ratio] !== undefined && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={portrait}
              onChange={(e) => {
                setPortrait(e.target.checked);
                select(refit(aspectFor(ratio, e.target.checked, shown, exact), crop, shown));
                setDraft(null);
              }}
            />
            {t.portrait}
          </label>
        )}
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            rotate(-90);
          }}
        >
          {t.rotateLeft}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            rotate(90);
          }}
        >
          {t.rotateRight}
        </button>
      </div>

      {ratio === "exact" && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-3">
            {(["width", "height"] as const).map((side) => (
              <div key={side}>
                <label htmlFor={`exact-${side}`} className="block">
                  {side === "width" ? t.exactWidth : t.exactHeight}
                </label>
                <input
                  id={`exact-${side}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={exactText[side]}
                  aria-invalid={exactInvalid && exactText[side] !== "" ? true : undefined}
                  aria-describedby="exact-help"
                  onChange={(e) => {
                    const next = { ...exactText, [side]: e.target.value };
                    setExactText(next);
                    const parsed = parseExact(next);
                    if (parsed) select(refit(parsed.width / parsed.height, crop, shown));
                    setDraft(null);
                  }}
                  className={`${inputClass} mt-1`}
                />
              </div>
            ))}
          </div>
          <p id="exact-help" className="mt-1 text-sm text-text-muted">
            {t.exactHelp}
          </p>
          {exactInvalid && (exactText.width !== "" || exactText.height !== "") && (
            <p className="mt-1 text-sm font-medium text-danger">{t.exactInvalid}</p>
          )}
          {exactTooLarge && (
            <p className="mt-1 text-sm font-medium text-danger">
              {t.exactTooLarge(area.width, area.height)}
            </p>
          )}
        </div>
      )}

      <div className="crop-editor mt-3 flex justify-center bg-canvas">
        <ReactCrop
          {...(live
            ? { crop: live }
            : crop
              ? {
                  crop: {
                    unit: "%" as const,
                    x: (crop.x / shown.width) * 100,
                    y: (crop.y / shown.height) * 100,
                    width: (crop.width / shown.width) * 100,
                    height: (crop.height / shown.height) * 100,
                  },
                }
              : {})}
          {...(aspect === undefined ? {} : { aspect })}
          keepSelection
          ruleOfThirds
          ariaLabels={t.aria}
          onChange={(_pixels, percent) => {
            fromLibrary(percent);
          }}
          onDragEnd={() => {
            setLive(null); // pointer up: from now on the whole-pixel selection is shown
          }}
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={t.imageLabel}
            className="block h-auto max-h-[60vh] max-w-full"
          />
        </ReactCrop>
      </div>

      <fieldset className="mt-3">
        <legend className="font-medium">{t.fieldsLegend}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {FIELDS.map((field) => (
            <div key={field}>
              <label htmlFor={`crop-${field}`} className="block text-sm">
                {t[field]}
              </label>
              <input
                id={`crop-${field}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={fieldValues[field]}
                aria-invalid={draft ? true : undefined}
                aria-describedby={draft ? "crop-fields-error" : "crop-size"}
                onChange={(e) => {
                  typeField(field, e.target.value);
                }}
                className={`${inputClass} mt-1`}
              />
            </div>
          ))}
        </div>
        {draft && (
          <p id="crop-fields-error" className="mt-1 text-sm font-medium text-danger">
            {t.fieldError(shown.width, shown.height)}
          </p>
        )}
      </fieldset>
      <p id="crop-size" aria-live="polite" className="mt-2 text-sm font-medium">
        {crop ? t.selected(crop.width, crop.height) : t.whole(shown.width, shown.height)}
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!canApply}
          onClick={apply}
          className="rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast disabled:opacity-50"
        >
          {t.apply}
        </button>
        <button type="button" className={buttonClass} onClick={onClose}>
          {t.cancel}
        </button>
        <button type="button" className={buttonClass} onClick={reset}>
          {t.reset}
        </button>
      </div>
    </section>
  );
}
