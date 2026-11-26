/**
 * The image list (Zustand, M2 Q1): one entry per added file, keyed by a stable id.
 * Owns the object URLs of thumbnails, previews and results, and revokes them when they're no
 * longer needed, including results that arrive after their entry was already removed.
 */
import { create } from "zustand";
import type { Progress } from "../../engine/optimize";
import type { OptimizationResult, SizeGoal } from "../../types/engine";
import type {
  EditSettings,
  ImageErrorCode,
  ImageInfo,
  ImageSettings,
  ItemResult,
  QueueItem,
} from "../../types/image";
import type { EngineErrorCode } from "../../workers/protocol";
import { defaultEdits, defaultSettings } from "../settings/settings";

interface QueueState {
  items: QueueItem[];
  selectedId: string | null;
  /** Latest status message for screen readers (rendered in an aria-live region). */
  announcement: string;

  add: (items: QueueItem[]) => void;
  select: (id: string) => void;
  remove: (id: string) => void;
  setReady: (id: string, info: ImageInfo, thumbnailUrl: string, previewUrl: string) => void;
  setError: (id: string, code: ImageErrorCode) => void;
  announce: (message: string) => void;

  /** Changes settings; an existing result becomes outdated (product invariant). */
  updateSettings: (id: string, patch: Partial<ImageSettings>) => void;
  /** Applies crop/rotate edits (M4); an existing result becomes outdated. */
  updateEdits: (id: string, edits: EditSettings) => void;
  startJob: (id: string) => void;
  setProgress: (id: string, progress: Progress) => void;
  /** Stores a finished run; replaces (and releases) any earlier result. */
  finishJob: (id: string, result: OptimizationResult, goal: SizeGoal, files: Blob[]) => void;
  failJob: (id: string, code: EngineErrorCode) => void;
  /** Cancelled: back to idle, the earlier result (if any) stays as it was. */
  cancelJob: (id: string) => void;
  chooseCandidate: (id: string, index: number) => void;
}

function revoke(...urls: (string | null)[]): void {
  for (const url of urls) if (url) URL.revokeObjectURL(url);
}

/** D14: when outdated, only the chosen file is kept (shown, not downloadable). */
function outdate(result: ItemResult): ItemResult {
  const keep = result.selected;
  revoke(...result.urls.filter((_, i) => i !== keep));
  const only = <T>(list: T[]): T[] => (keep === null ? [] : list.slice(keep, keep + 1));
  return {
    ...result,
    result: { ...result.result, candidates: only(result.result.candidates) },
    files: only(result.files),
    urls: only(result.urls),
    selected: keep === null ? null : 0,
    outdated: true,
  };
}

export const useQueue = create<QueueState>()((set, get) => {
  const update = (id: string, change: (item: QueueItem) => Partial<QueueItem>) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...change(item) } : item)),
    }));
  };

  return {
    items: [],
    selectedId: null,
    announcement: "",

    add: (items) => {
      set((state) => ({
        items: [...state.items, ...items],
        selectedId: state.selectedId ?? items[0]?.id ?? null,
      }));
    },

    select: (id) => {
      if (get().items.some((item) => item.id === id)) set({ selectedId: id });
    },

    remove: (id) => {
      const { items, selectedId } = get();
      const index = items.findIndex((item) => item.id === id);
      const item = items[index];
      if (!item) return;
      revoke(item.thumbnailUrl, item.previewUrl, ...(item.result?.urls ?? []));
      const rest = items.filter((other) => other.id !== id);
      // Removing the selected image selects its neighbour (next, else previous).
      const nextSelected =
        selectedId === id ? (rest[index]?.id ?? rest[index - 1]?.id ?? null) : selectedId;
      set({ items: rest, selectedId: nextSelected });
    },

    setReady: (id, info, thumbnailUrl, previewUrl) => {
      const item = get().items.find((other) => other.id === id);
      if (!item) {
        revoke(thumbnailUrl, previewUrl); // removed while it was being read
        return;
      }
      revoke(item.thumbnailUrl, item.previewUrl);
      update(id, (other) => ({
        status: "ready",
        error: null,
        thumbnailUrl,
        previewUrl,
        settings: other.settings ?? defaultSettings(info),
        edits: other.edits ?? defaultEdits(),
        metadata: {
          ...info,
          name: other.name,
          extension: other.extension,
          sizeBytes: other.sizeBytes,
          notices: [...other.notices, ...info.notices],
        },
      }));
    },

    setError: (id, code) => {
      update(id, () => ({ status: "error", error: code }));
    },

    announce: (message) => {
      set({ announcement: message });
    },

    updateSettings: (id, patch) => {
      update(id, (item) => ({
        settings: item.settings && { ...item.settings, ...patch },
        result: item.result && !item.result.outdated ? outdate(item.result) : item.result,
      }));
    },

    updateEdits: (id, edits) => {
      update(id, (item) => ({
        edits,
        result: item.result && !item.result.outdated ? outdate(item.result) : item.result,
      }));
    },

    startJob: (id) => {
      update(id, () => ({ job: { status: "running", progress: null } }));
    },

    setProgress: (id, progress) => {
      update(id, (item) =>
        item.job.status === "running" ? { job: { status: "running", progress } } : {},
      );
    },

    finishJob: (id, result, goal, files) => {
      const item = get().items.find((other) => other.id === id);
      if (!item) return; // removed while it ran: nothing to keep
      revoke(...(item.result?.urls ?? []));
      update(id, () => ({
        job: { status: "idle" },
        result: {
          result,
          goal,
          files,
          urls: files.map((file) => URL.createObjectURL(file)),
          selected: result.selected,
          outdated: false,
        },
      }));
    },

    failJob: (id, code) => {
      update(id, () => ({ job: { status: "error", code } }));
    },

    cancelJob: (id) => {
      update(id, () => ({ job: { status: "idle" } }));
    },

    chooseCandidate: (id, index) => {
      update(id, (item) =>
        item.result && !item.result.outdated && index < item.result.files.length
          ? { result: { ...item.result, selected: index } }
          : {},
      );
    },
  };
});
