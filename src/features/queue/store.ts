/**
 * The image list (Zustand, M2 Q1): one entry per added file, keyed by a stable id.
 * Owns the object URLs of thumbnails/previews and revokes them when an entry goes away,
 * including results that arrive after their entry was already removed.
 */
import { create } from "zustand";
import type { ImageErrorCode, ImageInfo, QueueItem } from "../../types/image";

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
}

function revoke(...urls: (string | null)[]): void {
  for (const url of urls) if (url) URL.revokeObjectURL(url);
}

export const useQueue = create<QueueState>()((set, get) => ({
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
    revoke(item.thumbnailUrl, item.previewUrl);
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
    set((state) => ({
      items: state.items.map((other) =>
        other.id === id
          ? {
              ...other,
              status: "ready",
              error: null,
              thumbnailUrl,
              previewUrl,
              metadata: {
                ...info,
                name: other.name,
                extension: other.extension,
                sizeBytes: other.sizeBytes,
                notices: [...other.notices, ...info.notices],
              },
            }
          : other,
      ),
    }));
  },

  setError: (id, code) => {
    set((state) => ({
      items: state.items.map((other) =>
        other.id === id ? { ...other, status: "error", error: code } : other,
      ),
    }));
  },

  announce: (message) => {
    set({ announcement: message });
  },
}));
