/**
 * Binary format + brute-force search for the image-embedding card index.
 * Pure module shared by the Node builder (tools/card-index) and the browser runtime.
 *
 * Layout (all little-endian):
 *   'YGCI' (4 bytes) | u32 header JSON byte length H | header JSON utf8, space-padded so H % 4 === 0
 *   | ids u32 x count | fullScale f32 x count | artScale f32 x count | full i8 x count*dim | art i8 x count*dim
 */

export interface CardIndexMeta {
  version: 1;
  model: string;
  dtype: string;
  dim: number;
  count: number;
  recipe: string;
}

export interface CardIndex {
  meta: CardIndexMeta;
  /** Card passcode per row; alternate-art rows repeat the same id. */
  ids: Uint32Array;
  fullScale: Float32Array;
  artScale: Float32Array;
  /** count*dim, row-major. Dequantized value = q * scale of that row. */
  full: Int8Array;
  art: Int8Array;
}

export interface CardIndexHit {
  id: number;
  score: number;
  row: number;
}

const MAGIC = [0x59, 0x47, 0x43, 0x49]; // 'YGCI'
const PREFIX_BYTES = 8;

/** Symmetric int8 quantization with a per-vector scale = maxabs/127. */
export function quantizeInt8(vec: Float32Array): { q: Int8Array; scale: number } {
  let maxAbs = 0;
  for (let i = 0; i < vec.length; i++) {
    const a = Math.abs(vec[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const q = new Int8Array(vec.length);
  if (maxAbs === 0) return { q, scale: 0 };
  const scale = Math.fround(maxAbs / 127);
  for (let i = 0; i < vec.length; i++) {
    const v = Math.round(vec[i] / scale);
    q[i] = v > 127 ? 127 : v < -127 ? -127 : v;
  }
  return { q, scale };
}

function validateShape(index: CardIndex): void {
  const { dim, count } = index.meta;
  if (!Number.isInteger(dim) || dim <= 0) throw new Error(`card-index: invalid dim ${dim}`);
  if (!Number.isInteger(count) || count < 0) throw new Error(`card-index: invalid count ${count}`);
  const checks: [string, number, number][] = [
    ['ids', index.ids.length, count],
    ['fullScale', index.fullScale.length, count],
    ['artScale', index.artScale.length, count],
    ['full', index.full.length, count * dim],
    ['art', index.art.length, count * dim],
  ];
  for (const [name, got, want] of checks) {
    if (got !== want) {
      throw new Error(`card-index: ${name} has ${got} entries, expected ${want} (count=${count}, dim=${dim})`);
    }
  }
}

export function encodeIndex(index: CardIndex): Uint8Array {
  validateShape(index);
  const { dim, count } = index.meta;
  let headerBytes = new TextEncoder().encode(JSON.stringify(index.meta));
  const pad = (4 - (headerBytes.length % 4)) % 4;
  if (pad) {
    const padded = new Uint8Array(headerBytes.length + pad).fill(0x20);
    padded.set(headerBytes);
    headerBytes = padded;
  }
  const total = PREFIX_BYTES + headerBytes.length + count * 12 + count * dim * 2;
  const out = new Uint8Array(total);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, headerBytes.length, true);
  out.set(headerBytes, PREFIX_BYTES);
  let off = PREFIX_BYTES + headerBytes.length;
  const dv = new DataView(out.buffer);
  for (let i = 0; i < count; i++, off += 4) dv.setUint32(off, index.ids[i], true);
  for (let i = 0; i < count; i++, off += 4) dv.setFloat32(off, index.fullScale[i], true);
  for (let i = 0; i < count; i++, off += 4) dv.setFloat32(off, index.artScale[i], true);
  out.set(new Uint8Array(index.full.buffer, index.full.byteOffset, index.full.byteLength), off);
  off += count * dim;
  out.set(new Uint8Array(index.art.buffer, index.art.byteOffset, index.art.byteLength), off);
  return out;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function readU32Array(buf: ArrayBuffer, off: number, n: number): Uint32Array {
  if (LITTLE_ENDIAN && off % 4 === 0) return new Uint32Array(buf, off, n);
  const dv = new DataView(buf, off, n * 4);
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getUint32(i * 4, true);
  return out;
}

function readF32Array(buf: ArrayBuffer, off: number, n: number): Float32Array {
  if (LITTLE_ENDIAN && off % 4 === 0) return new Float32Array(buf, off, n);
  const dv = new DataView(buf, off, n * 4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}

export function decodeIndex(buf: ArrayBuffer): CardIndex {
  if (buf.byteLength < PREFIX_BYTES) {
    throw new Error(`card-index: buffer too short (${buf.byteLength} bytes)`);
  }
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('card-index: bad magic (expected "YGCI")');
  }
  const dv = new DataView(buf);
  const headerLen = dv.getUint32(4, true);
  if (PREFIX_BYTES + headerLen > buf.byteLength) {
    throw new Error(`card-index: truncated header (${headerLen} bytes declared)`);
  }
  let meta: CardIndexMeta;
  try {
    meta = JSON.parse(new TextDecoder().decode(bytes.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLen)));
  } catch (e) {
    throw new Error(`card-index: invalid header JSON (${(e as Error).message})`);
  }
  if (meta.version !== 1) throw new Error(`card-index: unsupported version ${meta.version}`);
  const { dim, count } = meta;
  if (!Number.isInteger(dim) || dim <= 0 || !Number.isInteger(count) || count < 0) {
    throw new Error(`card-index: invalid dim/count in header (${dim}/${count})`);
  }
  let off = PREFIX_BYTES + headerLen;
  const expected = off + count * 12 + count * dim * 2;
  if (buf.byteLength < expected) {
    throw new Error(`card-index: truncated payload (${buf.byteLength} bytes, expected ${expected})`);
  }
  if (buf.byteLength > expected) {
    throw new Error(`card-index: trailing bytes (${buf.byteLength} bytes, expected ${expected})`);
  }
  const ids = readU32Array(buf, off, count);
  off += count * 4;
  const fullScale = readF32Array(buf, off, count);
  off += count * 4;
  const artScale = readF32Array(buf, off, count);
  off += count * 4;
  const full = new Int8Array(buf, off, count * dim);
  off += count * dim;
  const art = new Int8Array(buf, off, count * dim);
  return { meta, ids, fullScale, artScale, full, art };
}

/**
 * Brute-force top-k: score = dot(qFull, full_r)*fullScale_r + dot(qArt, art_r)*artScale_r.
 * Rows sharing an id (alternate arts) are collapsed to their best row.
 */
export function searchIndex(
  index: CardIndex,
  queryFull: Float32Array,
  queryArt: Float32Array | null,
  k: number,
): CardIndexHit[] {
  const { dim, count } = index.meta;
  if (queryFull.length !== dim || (queryArt && queryArt.length !== dim)) {
    throw new Error(`card-index: query dim ${queryFull.length}/${queryArt?.length} != index dim ${dim}`);
  }
  if (k <= 0 || count === 0) return [];
  const { ids, full, art, fullScale, artScale } = index;
  // top-k buffer (unsorted), distinct ids; track the current worst slot
  const topScore = new Float64Array(k);
  const topRow = new Int32Array(k);
  const topId = new Float64Array(k);
  let size = 0;
  let worst = 0; // slot index of the minimum score (valid when size === k)

  for (let r = 0; r < count; r++) {
    const base = r * dim;
    let s = 0;
    for (let j = 0; j < dim; j++) s += queryFull[j] * full[base + j];
    s *= fullScale[r];
    if (queryArt) {
      let a = 0;
      for (let j = 0; j < dim; j++) a += queryArt[j] * art[base + j];
      s += a * artScale[r];
    }
    if (size === k && s <= topScore[worst]) continue;
    const id = ids[r];
    let slot = -1;
    for (let t = 0; t < size; t++) {
      if (topId[t] === id) {
        slot = t;
        break;
      }
    }
    if (slot >= 0) {
      if (s <= topScore[slot]) continue;
    } else if (size < k) {
      slot = size++;
    } else {
      slot = worst;
    }
    topScore[slot] = s;
    topRow[slot] = r;
    topId[slot] = id;
    if (size === k) {
      worst = 0;
      for (let t = 1; t < k; t++) if (topScore[t] < topScore[worst]) worst = t;
    }
  }

  const out: CardIndexHit[] = [];
  for (let t = 0; t < size; t++) out.push({ id: topId[t], score: topScore[t], row: topRow[t] });
  out.sort((a, b) => b.score - a.score || a.row - b.row);
  return out;
}
