import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQueue } from "../../src/features/queue/store";
import type { ImageInfo, QueueItem } from "../../src/types/image";

const revoke = vi.fn();

function item(id: string, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    file: new File(["x"], `${id}.png`),
    name: `${id}.png`,
    extension: "png",
    sizeBytes: 1,
    status: "reading",
    notices: [],
    metadata: null,
    thumbnailUrl: null,
    previewUrl: null,
    error: null,
    ...overrides,
  };
}

const info: ImageInfo = {
  format: "heic",
  mime: "image/heic",
  width: 3024,
  height: 4032,
  hasAlpha: false,
  notices: [{ code: "hdr_converted" }],
};

const state = () => useQueue.getState();
const ids = () => state().items.map((i) => i.id);

beforeEach(() => {
  useQueue.setState(useQueue.getInitialState(), true);
  revoke.mockReset();
  URL.revokeObjectURL = revoke;
});

describe("image list store", () => {
  it("adds items in order and selects the first one when nothing is selected", () => {
    state().add([item("a"), item("b")]);
    expect(ids()).toEqual(["a", "b"]);
    expect(state().selectedId).toBe("a");
    state().select("b");
    state().add([item("c")]);
    expect(state().selectedId).toBe("b");
  });

  it("ignores selecting an id that isn't in the list", () => {
    state().add([item("a")]);
    state().select("nope");
    expect(state().selectedId).toBe("a");
  });

  it("marks an item ready with merged metadata and notices, keeping its id", () => {
    state().add([item("a", { notices: [{ code: "extension_mismatch", extension: "jpg" }] })]);
    state().setReady("a", info, "blob:t", "blob:p");
    const ready = state().items[0];
    expect(ready).toMatchObject({
      id: "a",
      status: "ready",
      thumbnailUrl: "blob:t",
      previewUrl: "blob:p",
    });
    expect(ready?.metadata).toEqual({
      ...info,
      name: "a.png",
      extension: "png",
      sizeBytes: 1,
      notices: [{ code: "extension_mismatch", extension: "jpg" }, { code: "hdr_converted" }],
    });
  });

  it("marks an item as failed with its error code", () => {
    state().add([item("a")]);
    state().setError("a", "decode_failed");
    expect(state().items[0]).toMatchObject({ status: "error", error: "decode_failed" });
  });

  it("revokes an item's object URLs when it is removed", () => {
    state().add([item("a")]);
    state().setReady("a", info, "blob:t", "blob:p");
    state().remove("a");
    expect(revoke).toHaveBeenCalledWith("blob:t");
    expect(revoke).toHaveBeenCalledWith("blob:p");
    expect(ids()).toEqual([]);
    expect(state().selectedId).toBeNull();
  });

  it("revokes the URLs of a result that arrives after its item was removed", () => {
    state().add([item("a")]);
    state().remove("a");
    state().setReady("a", info, "blob:late-t", "blob:late-p");
    expect(revoke).toHaveBeenCalledWith("blob:late-t");
    expect(revoke).toHaveBeenCalledWith("blob:late-p");
    expect(ids()).toEqual([]);
  });

  it("removing the selected item selects the next one, else the previous one", () => {
    state().add([item("a"), item("b"), item("c")]);
    state().select("b");
    state().remove("b");
    expect(state().selectedId).toBe("c");
    state().remove("c");
    expect(state().selectedId).toBe("a");
  });

  it("removing another item keeps the selection", () => {
    state().add([item("a"), item("b")]);
    state().remove("b");
    expect(state().selectedId).toBe("a");
  });
});
