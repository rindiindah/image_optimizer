import { useRef, useState } from "react";
import { strings } from "../../content/strings";
import type { QueueItem } from "../../types/image";
import { useQueue } from "../queue/store";
import type { ApplyGroup } from "./settings";

const GROUPS: ApplyGroup[] = ["size", "format", "more"];

/**
 * "Apply to selected images…" (M6, D23 Q2): copies the chosen setting groups from this image to
 * the other checked images, after saying what gets overwritten and what is never copied.
 */
export function ApplyDialog({ item }: { item: QueueItem }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [groups, setGroups] = useState<ApplyGroup[]>(GROUPS);
  const checked = useQueue((state) => state.checked);
  const targets = checked.filter((id) => id !== item.id);
  const runningCount = useQueue(
    (state) =>
      state.items.filter(
        (other) =>
          other.id !== item.id &&
          state.checked.includes(other.id) &&
          other.job.status === "running",
      ).length,
  );
  if (targets.length === 0) return null;
  const t = strings.apply;
  const name = item.name || strings.queue.untitled;

  const close = () => {
    dialog.current?.close();
  };
  const apply = () => {
    const queue = useQueue.getState();
    const count = queue.applySettings(item.id, targets, groups);
    queue.announce(t.applied(count));
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setGroups(GROUPS);
          dialog.current?.showModal();
        }}
        className="rounded-control border border-border px-4 py-2 font-medium"
      >
        {t.open}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="apply-heading"
        className="m-auto max-w-lg rounded-card border border-border bg-surface p-4 text-text backdrop:bg-black/40"
      >
        <h2 id="apply-heading" className="text-lg font-semibold">
          {t.heading}
        </h2>
        <p className="mt-2 text-sm">{t.intro(name, targets.length)}</p>
        <fieldset className="mt-3">
          <legend className="font-medium">{t.legend}</legend>
          {GROUPS.map((group) => (
            <label key={group} className="mt-1 flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={groups.includes(group)}
                onChange={(e) => {
                  setGroups((now) =>
                    e.target.checked ? [...now, group] : now.filter((g) => g !== group),
                  );
                }}
                className="mt-0.5"
              />
              {t.groups[group]}
            </label>
          ))}
        </fieldset>
        <p className="mt-3 text-sm text-text-muted">{t.never}</p>
        {runningCount > 0 && <p className="mt-2 text-sm font-medium">{t.running(runningCount)}</p>}
        <p className="mt-2 text-sm text-text-muted">{t.outdated}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={groups.length === 0}
            onClick={apply}
            className="rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast disabled:opacity-50"
          >
            {t.apply}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-control border border-border px-4 py-2 font-medium"
          >
            {t.cancel}
          </button>
        </div>
      </dialog>
    </>
  );
}
