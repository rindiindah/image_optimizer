import type { ReactNode } from "react";
import { strings } from "../../content/strings";
import type { Dimensions, Mode, OptimizeSettings, OutputFormat } from "../../types/engine";
import type { EditSettings, ImageSettings, QueueItem, SizeField } from "../../types/image";
import { editedSize, linkedSide } from "../../utils/edits";
import { formatSize, type SizeUnit } from "../../utils/file-size";
import { cancelOptimize, optimizeImage } from "../process/run";
import { useQueue } from "../queue/store";
import {
  formatName,
  hasQuality,
  needsBackground,
  parsePixels,
  toImageEdits,
  toOptimizeSettings,
  type SettingsErrors,
} from "./settings";

const MODES: Mode[] = ["maximum", "range", "target"];
const FORMATS: OutputFormat[] = ["image/jpeg", "image/png", "image/webp"];
const BACKGROUNDS = ["#ffffff", "#000000"] as const;

const inputClass =
  "rounded-control border border-border bg-surface px-2 py-1 aria-[invalid=true]:border-danger";

function Hint({ id, children, error }: { id: string; children: ReactNode; error?: boolean }) {
  return (
    <p id={id} className={`mt-1 text-sm ${error ? "font-medium text-danger" : "text-text-muted"}`}>
      {children}
    </p>
  );
}

function SizeInput(props: {
  id: string;
  label: string;
  field: SizeField;
  /** Shown only once something was typed ("empty" just keeps Optimize disabled). */
  error: SettingsErrors["min"];
  onChange: (field: SizeField) => void;
}) {
  const { id, label, field, onChange } = props;
  const error = props.error === "empty" ? undefined : props.error;
  return (
    <div>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={field.text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            onChange({ ...field, text: e.target.value });
          }}
          className={`${inputClass} w-32`}
        />
        <select
          aria-label={strings.settings.unitLabel(label)}
          value={field.unit}
          onChange={(e) => {
            onChange({ ...field, unit: e.target.value as SizeUnit });
          }}
          className={inputClass}
        >
          <option value="KB">KB</option>
          <option value="MB">MB</option>
        </select>
      </div>
      {error && (
        <Hint id={`${id}-error`} error>
          {strings.settings.sizeErrors[error]}
        </Hint>
      )}
    </div>
  );
}

/** Two whole-pixel fields (width, height) in a labelled group, with one shared message. */
function PixelPair(props: {
  id: string;
  legend: string;
  labels: [string, string];
  values: [string, string];
  placeholders?: [string, string];
  message: string;
  error: boolean;
  onChange: (index: 0 | 1, text: string) => void;
}) {
  const { id, legend, labels, values, placeholders, message, error, onChange } = props;
  return (
    <fieldset aria-describedby={`${id}-message`}>
      <legend className="font-medium">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {([0, 1] as const).map((i) => (
          <div key={i}>
            <label htmlFor={`${id}-${String(i)}`} className="block text-sm">
              {labels[i]}
            </label>
            <input
              id={`${id}-${String(i)}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={values[i]}
              placeholder={placeholders?.[i]}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-message`}
              onChange={(e) => {
                onChange(i, e.target.value);
              }}
              className={`${inputClass} mt-1 w-24`}
            />
          </div>
        ))}
      </div>
      <Hint id={`${id}-message`} error={error}>
        {message}
      </Hint>
    </fieldset>
  );
}

function summaryLines(
  s: OptimizeSettings,
  edits: EditSettings | null,
  edited: Dimensions,
  output: Dimensions,
): string[] {
  const t = strings.settings.summary;
  const { goal } = s;
  const lines = [
    goal.mode === "maximum"
      ? t.maximum(formatSize(goal.maxBytes))
      : goal.mode === "range"
        ? t.range(formatSize(goal.minBytes), formatSize(goal.maxBytes))
        : t.target(formatSize(goal.targetBytes)),
    t.format(formatName(s.format)),
  ];
  if (s.background)
    lines.push(t.transparencyFilled(strings.settings.colourNames[s.background] ?? s.background));
  if (s.minQuality !== null) lines.push(t.minQuality(s.minQuality));
  lines.push(edits?.crop ? t.cropped(edits.crop.width, edits.crop.height) : t.notCropped);
  if (edits?.rotation) lines.push(t.rotated(edits.rotation));
  const changed =
    output.width !== edited.width ||
    output.height !== edited.height ||
    edits?.crop != null ||
    (edits?.rotation ?? 0) !== 0;
  lines.push(changed ? t.output(output.width, output.height) : t.dimensionsKept);
  if (s.allowDimensionReduction) {
    lines.push(t.dimensionsMayShrink);
    if (s.minDimensions) lines.push(t.notBelow(s.minDimensions.width, s.minDimensions.height));
  }
  if (s.allowColorReduction) lines.push(t.colorsMayReduce);
  return lines;
}

/** Typing one side of the output size; with Keep aspect ratio the other side follows. */
function linkResize(
  resize: ImageSettings["resize"],
  index: 0 | 1,
  text: string,
  edited: Dimensions,
): ImageSettings["resize"] {
  const next = { ...resize, [index === 0 ? "width" : "height"]: text };
  if (!resize.keepAspect) return next;
  const n = parsePixels(text);
  const other =
    n === null || Number.isNaN(n)
      ? ""
      : String(
          index === 0
            ? linkedSide(n, edited.width, edited.height)
            : linkedSide(n, edited.height, edited.width),
        );
  return index === 0 ? { ...next, height: other } : { ...next, width: other };
}

/** Settings, summary and Optimize/Cancel for the selected image (M3, output size M4). */
export function SettingsPanel() {
  const item = useQueue((state) => state.items.find((other) => other.id === state.selectedId));
  const otherRunning = useQueue((state) =>
    state.items.some((other) => other.id !== state.selectedId && other.job.status === "running"),
  );
  if (!item?.settings || !item.metadata) return null;
  return <Panel item={item} settings={item.settings} otherRunning={otherRunning} />;
}

function Panel({
  item,
  settings,
  otherRunning,
}: {
  item: QueueItem;
  settings: ImageSettings;
  otherRunning: boolean;
}) {
  const hasAlpha = item.metadata?.hasAlpha ?? false;
  const set = (patch: Partial<ImageSettings>) => {
    useQueue.getState().updateSettings(item.id, patch);
  };
  const source = { width: item.metadata?.width ?? 1, height: item.metadata?.height ?? 1 };
  const edits = item.edits;
  const edited = editedSize(source, edits ?? { crop: null, rotation: 0 });
  const exact = edits?.ratio === "exact" ? edits.exact : null;
  const check = toOptimizeSettings(settings, hasAlpha, { edited, exact });
  const errors = check.ok ? {} : check.errors;
  const running = item.job.status === "running";
  const sizeLabel = strings.settings.sizeLabel[settings.mode];

  return (
    <section
      aria-labelledby="settings-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="settings-heading" className="text-lg font-semibold">
        {strings.settings.heading}
      </h2>
      <fieldset disabled={running} className="mt-3 flex flex-col gap-4">
        <fieldset>
          <legend className="font-medium">{strings.settings.modeLegend}</legend>
          <div className="mt-1 flex flex-col gap-2">
            {MODES.map((mode) => (
              <label key={mode} className="flex gap-2">
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  checked={settings.mode === mode}
                  aria-describedby={`mode-${mode}-help`}
                  onChange={() => {
                    set({ mode });
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{strings.settings.modes[mode].label}</span>
                  <span id={`mode-${mode}-help`} className="block text-sm text-text-muted">
                    {strings.settings.modes[mode].help}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-4">
          {settings.mode === "range" && (
            <SizeInput
              id="size-min"
              label={strings.settings.minLabel}
              field={settings.min}
              error={errors.min}
              onChange={(min) => {
                set({ min });
              }}
            />
          )}
          <SizeInput
            id="size-main"
            label={sizeLabel}
            field={settings.size}
            error={errors.size}
            onChange={(size) => {
              set({ size });
            }}
          />
        </div>
        <p className="-mt-2 text-sm text-text-muted">{strings.settings.unitsNote}</p>

        <div>
          <label htmlFor="output-format" className="block font-medium">
            {strings.settings.formatLabel}
          </label>
          <select
            id="output-format"
            value={settings.format}
            onChange={(e) => {
              set({ format: e.target.value as OutputFormat });
            }}
            className={`${inputClass} mt-1`}
          >
            {FORMATS.map((format) => (
              <option key={format} value={format}>
                {formatName(format)}
              </option>
            ))}
          </select>
          {settings.format === "image/png" && <Hint id="png-note">{strings.settings.pngNote}</Hint>}
          {hasAlpha && !needsBackground(settings, hasAlpha) && (
            <Hint id="alpha-note">{strings.settings.transparencyKept}</Hint>
          )}
        </div>

        {exact ? (
          <div>
            <p className="font-medium">{strings.settings.resizeLegend}</p>
            <Hint id="resize-exact">{strings.settings.resizeExact(exact.width, exact.height)}</Hint>
            {errors.resize && (
              <Hint id="resize-exact-error" error>
                {strings.settings.resizeErrors.too_large(edited.width, edited.height)}
              </Hint>
            )}
          </div>
        ) : (
          <div>
            <PixelPair
              id="resize"
              legend={strings.settings.resizeLegend}
              labels={[strings.settings.resizeWidth, strings.settings.resizeHeight]}
              values={[settings.resize.width, settings.resize.height]}
              placeholders={[String(edited.width), String(edited.height)]}
              error={errors.resize !== undefined}
              message={
                errors.resize === "too_large"
                  ? strings.settings.resizeErrors.too_large(edited.width, edited.height)
                  : errors.resize === "invalid"
                    ? strings.settings.resizeErrors.invalid
                    : strings.settings.resizeHelp(edited.width, edited.height)
              }
              onChange={(index, text) => {
                set({ resize: linkResize(settings.resize, index, text, edited) });
              }}
            />
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.resize.keepAspect}
                onChange={(e) => {
                  set({ resize: { ...settings.resize, keepAspect: e.target.checked } });
                }}
              />
              {strings.settings.keepAspect}
            </label>
          </div>
        )}

        {needsBackground(settings, hasAlpha) && (
          <fieldset aria-describedby="background-help">
            <legend className="font-medium">{strings.settings.transparencyLegend}</legend>
            <Hint id="background-help">{strings.settings.transparencyHelp}</Hint>
            <div className="mt-1 flex flex-col gap-1">
              {BACKGROUNDS.map((colour) => (
                <label key={colour} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="background"
                    value={colour}
                    checked={settings.background === colour}
                    onChange={() => {
                      set({ background: colour });
                    }}
                  />
                  {strings.settings.backgrounds[colour]}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <details>
          <summary className="cursor-pointer font-medium">{strings.settings.moreOptions}</summary>
          <div className="mt-2 flex flex-col gap-3">
            {hasQuality(settings.format) && (
              <div>
                <label htmlFor="min-quality" className="block">
                  {strings.settings.minQualityLabel}
                </label>
                <input
                  id="min-quality"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={settings.minQuality}
                  aria-invalid={errors.minQuality ? true : undefined}
                  aria-describedby={errors.minQuality ? "min-quality-error" : "min-quality-help"}
                  onChange={(e) => {
                    set({ minQuality: e.target.value });
                  }}
                  className={`${inputClass} mt-1 w-20`}
                />
                {errors.minQuality ? (
                  <Hint id="min-quality-error" error>
                    {strings.settings.minQualityError}
                  </Hint>
                ) : (
                  <Hint id="min-quality-help">{strings.settings.minQualityHelp}</Hint>
                )}
              </div>
            )}
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={settings.allowDimensionReduction}
                onChange={(e) => {
                  set({ allowDimensionReduction: e.target.checked });
                }}
                className="mt-1"
              />
              {strings.settings.allowDimensions}
            </label>
            {settings.allowDimensionReduction && (
              <PixelPair
                id="min-size"
                legend={strings.settings.minSizeLegend}
                labels={[strings.settings.minWidth, strings.settings.minHeight]}
                values={[settings.minSize.width, settings.minSize.height]}
                error={errors.minSize !== undefined}
                message={
                  errors.minSize
                    ? strings.settings.minSizeErrors[errors.minSize]
                    : strings.settings.minSizeHelp
                }
                onChange={(index, text) => {
                  const side = index === 0 ? "width" : "height";
                  set({ minSize: { ...settings.minSize, [side]: text } });
                }}
              />
            )}
            {settings.format === "image/png" && (
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={settings.allowColorReduction}
                  onChange={(e) => {
                    set({ allowColorReduction: e.target.checked });
                  }}
                  className="mt-1"
                />
                {strings.settings.allowColors}
              </label>
            )}
          </div>
        </details>
      </fieldset>

      {check.ok && (
        <div className="mt-4">
          <h3 className="font-medium">{strings.settings.summaryHeading}</h3>
          <ul className="mt-1 list-disc ps-5 text-sm">
            {summaryLines(check.settings, edits, edited, check.outputSize).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {running ? (
          <button
            type="button"
            onClick={cancelOptimize}
            className="rounded-control border border-border px-4 py-2 font-medium"
          >
            {strings.process.cancel}
          </button>
        ) : (
          <button
            type="button"
            disabled={!check.ok || otherRunning}
            aria-describedby="optimize-hint"
            onClick={() => {
              if (check.ok && edits) {
                const engineEdits = toImageEdits(edits, edited, check.outputSize);
                void optimizeImage(item.id, check.settings, engineEdits);
              }
            }}
            className="rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast disabled:opacity-50"
          >
            {strings.process.optimize}
          </button>
        )}
        {/* Progress is announced politely; never a percentage (honest progress, Q7). */}
        <p id="optimize-hint" aria-live="polite" className="text-sm text-text-muted">
          {running
            ? item.job.status === "running" && item.job.progress
              ? strings.process.attempt(
                  item.job.progress.attempt,
                  item.job.progress.maxAttempts,
                  item.job.progress.phase,
                )
              : strings.process.starting
            : otherRunning
              ? strings.process.otherRunning
              : check.ok
                ? ""
                : strings.process.fixFirst}
        </p>
      </div>

      {item.job.status === "error" && (
        <div role="alert" className="mt-3 text-sm">
          <p className="font-medium">{strings.process.errors[item.job.code].what}</p>
          <p className="text-text-muted">{strings.result.originalSafe}</p>
          <p className="text-text-muted">{strings.process.errors[item.job.code].next}</p>
        </div>
      )}
    </section>
  );
}
