/**
 * Reads the bit depth of a HEIF/HEIC file's primary image straight from the container
 * (owner decision Q6 a, M2). Works whatever decodes the pixels (Safari's own decoder or
 * libheif), so a 10-bit image always gets the `hdr_converted` notice / `hdr_tone_mapped` flag.
 *
 * Path: `meta` → `pitm` (primary item) → if it's a `grid`, its first tile via `iref dimg` →
 * the item's properties (`ipma` → `ipco`) → `pixi` (bits per channel) or `hvcC` (HEVC).
 * Untrusted input: every read is bounds-checked and the function returns `null` instead of
 * throwing on anything malformed or unknown.
 */

interface Box {
  type: string;
  /** First byte of the payload (after the header). */
  start: number;
  /** First byte after the box. */
  end: number;
}

class Reader {
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  has(offset: number, length: number): boolean {
    return offset >= 0 && length >= 0 && offset + length <= this.bytes.length;
  }
  u8(offset: number): number {
    if (!this.has(offset, 1)) throw new RangeError("out of bounds");
    return this.view.getUint8(offset);
  }
  u16(offset: number): number {
    if (!this.has(offset, 2)) throw new RangeError("out of bounds");
    return this.view.getUint16(offset);
  }
  u32(offset: number): number {
    if (!this.has(offset, 4)) throw new RangeError("out of bounds");
    return this.view.getUint32(offset);
  }
  fourcc(offset: number): string {
    if (!this.has(offset, 4)) throw new RangeError("out of bounds");
    return String.fromCharCode(...this.bytes.subarray(offset, offset + 4));
  }

  /** Child boxes in [start, end). Stops at the first box that doesn't fit. */
  boxes(start: number, end: number): Box[] {
    const out: Box[] = [];
    let offset = start;
    while (offset + 8 <= end) {
      let size = this.u32(offset);
      const type = this.fourcc(offset + 4);
      let header = 8;
      if (size === 1) {
        const high = this.u32(offset + 8);
        if (high !== 0) break; // > 4 GB: not a realistic metadata box
        size = this.u32(offset + 12);
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) break;
      out.push({ type, start: offset + header, end: offset + size });
      offset += size;
    }
    return out;
  }
}

const find = (boxes: Box[], type: string) => boxes.find((box) => box.type === type);

/** Bit depth of the primary image (8, 10, 12…), or `null` if it can't be determined. */
export function readHeifBitDepth(bytes: Uint8Array): number | null {
  try {
    return bitDepth(new Reader(bytes));
  } catch {
    return null;
  }
}

function bitDepth(r: Reader): number | null {
  const top = r.boxes(0, r.bytes.length);
  if (top[0]?.type !== "ftyp") return null;
  const meta = find(top, "meta");
  if (!meta) return null;
  const children = r.boxes(meta.start + 4, meta.end); // meta is a FullBox

  const pitm = find(children, "pitm");
  if (!pitm) return null;
  const primary = r.u8(pitm.start) === 0 ? r.u16(pitm.start + 4) : r.u32(pitm.start + 4);

  // A grid image has no codec config of its own: use its first tile.
  let item = primary;
  if (itemType(r, children, primary) === "grid") {
    const tile = firstDerivedFrom(r, children, primary);
    if (tile === null) return null;
    item = tile;
  }
  return depthFromProperties(r, children, item);
}

function itemType(r: Reader, children: Box[], id: number): string | null {
  const iinf = find(children, "iinf");
  if (!iinf) return null;
  const headerSize = r.u8(iinf.start) === 0 ? 2 : 4;
  for (const infe of r.boxes(iinf.start + 4 + headerSize, iinf.end)) {
    if (infe.type !== "infe") continue;
    const version = r.u8(infe.start);
    if (version < 2) continue; // v0/v1 have no item type
    const idSize = version === 2 ? 2 : 4;
    const itemId = idSize === 2 ? r.u16(infe.start + 4) : r.u32(infe.start + 4);
    if (itemId === id) return r.fourcc(infe.start + 4 + idSize + 2);
  }
  return null;
}

/** First item that `from` is derived from (`iref` `dimg`), e.g. a grid's first tile. */
function firstDerivedFrom(r: Reader, children: Box[], from: number): number | null {
  const iref = find(children, "iref");
  if (!iref) return null;
  const idSize = r.u8(iref.start) === 0 ? 2 : 4;
  const read = (offset: number) => (idSize === 2 ? r.u16(offset) : r.u32(offset));
  for (const ref of r.boxes(iref.start + 4, iref.end)) {
    if (ref.type !== "dimg") continue;
    if (read(ref.start) !== from) continue;
    const count = r.u16(ref.start + idSize);
    return count > 0 ? read(ref.start + idSize + 2) : null;
  }
  return null;
}

function depthFromProperties(r: Reader, children: Box[], id: number): number | null {
  const iprp = find(children, "iprp");
  if (!iprp) return null;
  const iprpChildren = r.boxes(iprp.start, iprp.end);
  const ipco = find(iprpChildren, "ipco");
  if (!ipco) return null;
  const properties = r.boxes(ipco.start, ipco.end);

  let pixi: number | null = null;
  let codec: number | null = null;
  for (const index of propertyIndexes(r, iprpChildren, id)) {
    const property = properties[index - 1]; // 1-based; 0 means "no property"
    if (!property) continue;
    if (property.type === "pixi") {
      // FullBox: num_channels, then bits per channel.
      const channels = r.u8(property.start + 4);
      if (channels > 0) pixi = r.u8(property.start + 5);
    } else if (property.type === "hvcC") {
      codec = (r.u8(property.start + 17) & 0x07) + 8; // bitDepthLumaMinus8
    }
  }
  const depth = pixi ?? codec;
  return depth !== null && depth >= 1 && depth <= 16 ? depth : null;
}

/** Property indexes (1-based) associated with `id`, from every `ipma` box. */
function propertyIndexes(r: Reader, iprpChildren: Box[], id: number): number[] {
  const indexes: number[] = [];
  for (const ipma of iprpChildren.filter((box) => box.type === "ipma")) {
    const version = r.u8(ipma.start);
    const flags = r.u32(ipma.start) & 0xffffff;
    let offset = ipma.start + 4;
    const entries = r.u32(offset);
    offset += 4;
    for (let e = 0; e < entries; e += 1) {
      const itemId = version < 1 ? r.u16(offset) : r.u32(offset);
      offset += version < 1 ? 2 : 4;
      const count = r.u8(offset);
      offset += 1;
      for (let k = 0; k < count; k += 1) {
        const index = flags & 1 ? r.u16(offset) & 0x7fff : r.u8(offset) & 0x7f;
        offset += flags & 1 ? 2 : 1;
        if (itemId === id) indexes.push(index);
      }
    }
  }
  return indexes;
}
