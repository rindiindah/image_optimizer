import type { ReactNode } from "react";
import { strings } from "../../content/strings";
import type { Mode, OptimizeSettings, OutputFormat } from "../../types/engine";
import type { ImageSettings, QueueItem, SizeField } from "../../types/image";
import { formatSize, type SizeUnit } from "../../utils/file-size";
import { cancelOptimize, optimizeImage } from "../process/run";
import { useQueue } from "../queue/store";
import {
  formatName,
  hasQuality,
  needsBackground,
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

function summaryLines(s: OptimizeSettings): string[] {
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
  lines.push(s.allowDimensionReduction ? t.dimensionsMayShrink : t.dimensionsKept);
  if (s.allowColorReduction) lines.push(t.colorsMayReduce);
  return lines;
}

/** Settings, summary and Optimize/Cancel for the selected image (M3). */
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
  const check = toOptimizeSettings(settings, hasAlpha);
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
            {summaryLines(check.settings).map((line) => (
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
              if (check.ok) void optimizeImage(item.id, check.settings);
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
