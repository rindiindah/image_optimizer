import { useMemo, useState } from "react";
import { strings } from "../../content/strings";
import { buildZip, saveBlob, ZIP_NAME, zipEntries, type LeftOut } from "../download/zip";
import { cancelAll, optimizeImages } from "../process/run";
import { useQueue } from "./store";

type ZipState =
  | { phase: "idle" }
  | { phase: "preparing"; done: number; total: number }
  | { phase: "done"; count: number }
  | { phase: "failed" };

function leftOutText(leftOut: LeftOut, total: number): string | null {
  const t = strings.batch.reasons;
  const reasons = [
    leftOut.noResult > 0 ? t.noResult(leftOut.noResult) : "",
    leftOut.outdated > 0 ? t.outdated(leftOut.outdated) : "",
    leftOut.noFile > 0 ? t.noFile(leftOut.noFile) : "",
  ].filter(Boolean);
  const left = leftOut.noResult + leftOut.outdated + leftOut.noFile;
  return left > 0 ? strings.batch.leftOut(left, total, reasons) : null;
}

/** Batch actions for the checked images (M6, D23). */
export function BatchBar() {
  const items = useQueue((state) => state.items);
  const checked = useQueue((state) => state.checked);
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const busy = items.some((item) => item.job.status === "queued" || item.job.status === "running");
  const { entries, leftOut } = useMemo(() => zipEntries(items, checked), [items, checked]);
  const [zip, setZip] = useState<ZipState>({ phase: "idle" });
  const t = strings.batch;
  const preparing = zip.phase === "preparing";
  const leftText = leftOutText(leftOut, checked.length);

  const download = async () => {
    setZip({ phase: "preparing", done: 0, total: entries.length });
    try {
      const blob = await buildZip(entries, (done, total) => {
        setZip({ phase: "preparing", done, total });
      });
      saveBlob(blob, ZIP_NAME);
      setZip({ phase: "done", count: entries.length });
      useQueue.getState().announce(t.zipReady(entries.length));
    } catch {
      setZip({ phase: "failed" });
      useQueue.getState().announce(t.zipFailed);
    }
  };

  const button = "rounded-control border border-border px-3 py-1 text-sm disabled:opacity-50";

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{t.selected(checked.length)}</p>
        <button
          type="button"
          className={button}
          disabled={checked.length === ids.length}
          onClick={() => {
            useQueue.getState().setAllChecked(ids);
          }}
        >
          {t.selectAll}
        </button>
        <button
          type="button"
          className={button}
          disabled={checked.length === 0}
          onClick={() => {
            useQueue.getState().setAllChecked([]);
          }}
        >
          {t.clear}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-control bg-accent px-3 py-1 text-sm font-medium text-accent-contrast disabled:opacity-50"
          disabled={checked.length === 0}
          onClick={() => {
            optimizeImages(checked, { skipUpToDate: true });
          }}
        >
          {t.optimize}
        </button>
        {busy && (
          <button type="button" className={button} onClick={cancelAll}>
            {t.cancelAll}
          </button>
        )}
        <button
          type="button"
          className={button}
          disabled={entries.length === 0 || preparing}
          aria-describedby="zip-status"
          onClick={() => {
            void download();
          }}
        >
          {t.zip}
        </button>
      </div>
      <div id="zip-status" className="text-sm text-text-muted">
        {checked.length > 0 && entries.length === 0 && <p>{t.zipNone}</p>}
        {leftText && <p>{leftText}</p>}
        {preparing && <p>{t.preparing(zip.done, zip.total)}</p>}
        {zip.phase === "done" && <p>{t.zipReady(zip.count)}</p>}
        {zip.phase === "failed" && (
          <p role="alert" className="font-medium text-danger">
            {t.zipFailed}
          </p>
        )}
      </div>
    </div>
  );
}
