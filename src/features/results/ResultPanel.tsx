import { strings } from "../../content/strings";
import { percentFromTarget } from "../../engine/policy";
import type { Candidate, SizeGoal } from "../../types/engine";
import type { ItemResult, QueueItem } from "../../types/image";
import { downloadName } from "../../utils/download-name";
import { formatSize, type SizeBound } from "../../utils/file-size";
import { useQueue } from "../queue/store";
import { formatName } from "../settings/settings";
import { ComparisonViewer } from "./ComparisonViewer";

/** The bound a size is shown against, so it never appears on the wrong side of it (D4). */
function boundFor(goal: SizeGoal, bytes: number): SizeBound {
  if (goal.mode === "maximum") return { kind: "upper", bytes: goal.maxBytes };
  if (goal.mode === "target") return { kind: "upper", bytes: goal.targetBytes };
  return bytes < goal.minBytes
    ? { kind: "lower", bytes: goal.minBytes }
    : { kind: "upper", bytes: goal.maxBytes };
}

const sizeOf = (goal: SizeGoal, bytes: number) => formatSize(bytes, boundFor(goal, bytes));

function goalText(goal: SizeGoal): string {
  if (goal.mode === "maximum") return formatSize(goal.maxBytes);
  if (goal.mode === "target") return formatSize(goal.targetBytes);
  return strings.result.rangeGoal(formatSize(goal.minBytes), formatSize(goal.maxBytes));
}

function difference(c: Candidate, target: number): string {
  if (c.bytes === target) return strings.result.atTarget;
  return strings.result.difference(percentFromTarget(c.bytes, target), c.side);
}

function statusText(goal: SizeGoal, c: Candidate): string {
  const t = strings.result.status;
  const size = sizeOf(goal, c.bytes);
  if (goal.mode === "maximum") return t.maximumMet(size, formatSize(goal.maxBytes));
  if (goal.mode === "range")
    return t.rangeMet(size, formatSize(goal.minBytes), formatSize(goal.maxBytes));
  if (c.outcome === "met") return t.targetMet(size, difference(c, goal.targetBytes));
  if (c.outcome === "close") return t.targetClose(size, difference(c, goal.targetBytes));
  return t.targetMissed(size, percentFromTarget(c.bytes, goal.targetBytes), c.side);
}

/** Never overstates a saving: rounds a saving down and an increase up. */
function changePercent(source: number, bytes: number): number {
  return bytes <= source
    ? Math.floor(((source - bytes) / source) * 100)
    : -Math.ceil(((bytes - source) / source) * 100);
}

/** The bytes saved (rounded down) or added (rounded up), via the D4 bound rules. */
function changeSize(source: number, bytes: number): string {
  const diff = Math.abs(source - bytes);
  if (diff === 0) return formatSize(0);
  return bytes <= source
    ? formatSize(diff, { kind: "lower", bytes: diff + 1 }) // below a bound → rounds down
    : formatSize(diff, { kind: "upper", bytes: diff - 1 }); // above a bound → rounds up
}

function NoOutput({ result }: { result: ItemResult }) {
  const { goal } = result;
  const { closest, outcome } = result.result;
  const t = strings.result;
  const below = goal.mode === "range" && closest !== null && closest.bytes < goal.minBytes;
  let what: string = t.status.failed;
  let next: string = t.next.failed;
  if (outcome === "unreachable" && goal.mode !== "target") {
    what = below ? t.status.rangeBelow : t.status.maximumMissed(formatSize(goal.maxBytes));
    next = below ? t.next.rangeBelow : t.next.maximum;
  }
  return (
    <div className="mt-3 text-sm">
      <p className="font-medium">{what}</p>
      {closest && <p>{t.status.closest(sizeOf(goal, closest.bytes))}</p>}
      <p className="text-text-muted">{t.originalSafe}</p>
      <p className="text-text-muted">{next}</p>
    </div>
  );
}

/** The result of the last run for the selected image (M3), with the comparison (M5). */
export function ResultPanel() {
  const item = useQueue((state) => state.items.find((other) => other.id === state.selectedId));
  if (!item?.result) return null;
  return <Panel item={item} result={item.result} />;
}

function Panel({ item, result }: { item: QueueItem; result: ItemResult }) {
  const { goal, outdated } = result;
  const t = strings.result;
  const index = result.selected;
  const candidate = index === null ? undefined : result.result.candidates[index];
  const url = index === null ? undefined : result.urls[index];
  const candidates = result.result.candidates;
  const kept = candidate?.flags.includes("passthrough") ?? false;
  const meta = item.metadata;

  return (
    <section
      aria-labelledby="result-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="result-heading" className="text-lg font-semibold">
        {t.heading}
      </h2>
      {outdated && <p className="mt-2 font-medium text-warning">{t.outdated}</p>}

      {!candidate || !url ? (
        <NoOutput result={result} />
      ) : (
        <>
          <p className="mt-2 font-medium">{statusText(goal, candidate)}</p>

          {candidates.length > 1 && goal.mode === "target" && (
            <fieldset className="mt-3">
              <legend className="font-medium">{t.choose}</legend>
              {candidates.map((c, i) => (
                <label key={c.side} className="mt-1 flex items-center gap-2">
                  <input
                    type="radio"
                    name="candidate"
                    checked={i === index}
                    onChange={() => {
                      useQueue.getState().chooseCandidate(item.id, i);
                    }}
                  />
                  {t.candidate(
                    sizeOf(goal, c.bytes),
                    difference(c, goal.targetBytes),
                    c.width,
                    c.height,
                  )}
                </label>
              ))}
            </fieldset>
          )}

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-muted">{t.labels.original}</dt>
            <dd>{formatSize(item.sizeBytes)}</dd>
            <dt className="text-text-muted">{t.labels.goal[goal.mode]}</dt>
            <dd>{goalText(goal)}</dd>
            <dt className="text-text-muted">{t.labels.output}</dt>
            <dd>{sizeOf(goal, candidate.bytes)}</dd>
            <dt className="text-text-muted">{t.labels.saving}</dt>
            <dd>
              {t.saving(
                changePercent(item.sizeBytes, candidate.bytes),
                changeSize(item.sizeBytes, candidate.bytes),
              )}
            </dd>
            {meta && (
              <>
                <dt className="text-text-muted">{t.labels.originalDimensions}</dt>
                <dd>{strings.queue.dimensions(meta.width, meta.height)}</dd>
              </>
            )}
            <dt className="text-text-muted">{t.labels.dimensions}</dt>
            <dd>{strings.queue.dimensions(candidate.width, candidate.height)}</dd>
            <dt className="text-text-muted">{t.labels.format}</dt>
            <dd>{formatName(candidate.mime)}</dd>
            {meta && (
              <>
                <dt className="text-text-muted">{t.labels.originalFormat}</dt>
                <dd>{strings.formats[meta.format]}</dd>
              </>
            )}
            <dt className="text-text-muted">{t.labels.quality}</dt>
            <dd>
              {kept
                ? t.notReencoded
                : candidate.quality === null
                  ? t.lossless
                  : String(candidate.quality)}
            </dd>
            <dt className="text-text-muted">{t.labels.attempts}</dt>
            <dd>{result.result.attempts}</dd>
          </dl>

          {candidate.flags.length > 0 && (
            <>
              <h3 className="mt-3 font-medium">{t.flagsHeading}</h3>
              <ul className="mt-1 list-disc ps-5 text-sm">
                {candidate.flags.map((flag) => (
                  <li key={flag}>{t.flags[flag]}</li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-3 text-sm">{kept ? t.metadata.kept : t.metadata.removed}</p>

          {outdated && !kept && (
            <p className="mt-3 text-sm text-text-muted">{t.compare.outdated}</p>
          )}
          {outdated || kept ? (
            <img
              src={url}
              alt={t.previewAlt}
              className="mx-auto mt-3 max-h-[70vh] w-auto max-w-full object-contain"
            />
          ) : (
            <ComparisonViewer item={item} candidate={candidate} url={url} />
          )}

          <div className="mt-3">
            {outdated ? (
              <button
                type="button"
                disabled
                className="rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast opacity-50"
              >
                {t.download}
              </button>
            ) : (
              <a
                href={url}
                download={downloadName(item.file.name, candidate.mime)}
                className="inline-block rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
              >
                {t.download}
              </a>
            )}
          </div>
        </>
      )}
    </section>
  );
}
