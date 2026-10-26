import {
  CardIndex,
  decodeIndex,
  encodeIndex,
  quantizeInt8,
  searchIndex,
} from './card-index.format';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function randomUnit(dim: number, rnd: () => number): Float32Array {
  const v = new Float32Array(dim);
  let s = 0;
  for (let i = 0; i < dim; i++) {
    v[i] = rnd() * 2 - 1;
    s += v[i] * v[i];
  }
  s = Math.sqrt(s);
  for (let i = 0; i < dim; i++) v[i] /= s;
  return v;
}

/** Builds an index from float rows (quantizing each), ids given per row. */
function buildIndex(ids: number[], fullRows: Float32Array[], artRows: Float32Array[]): CardIndex {
  const count = ids.length;
  const dim = fullRows[0].length;
  const index: CardIndex = {
    meta: { version: 1, model: 'test', dtype: 'q8', dim, count, recipe: 'unit-test' },
    ids: Uint32Array.from(ids),
    fullScale: new Float32Array(count),
    artScale: new Float32Array(count),
    full: new Int8Array(count * dim),
    art: new Int8Array(count * dim),
  };
  for (let r = 0; r < count; r++) {
    const f = quantizeInt8(fullRows[r]);
    const a = quantizeInt8(artRows[r]);
    index.full.set(f.q, r * dim);
    index.art.set(a.q, r * dim);
    index.fullScale[r] = f.scale;
    index.artScale[r] = a.scale;
  }
  return index;
}

function noisyCopy(v: Float32Array, amount: number, rnd: () => number): Float32Array {
  const out = new Float32Array(v.length);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    out[i] = v[i] + (rnd() * 2 - 1) * amount;
    s += out[i] * out[i];
  }
  s = Math.sqrt(s);
  for (let i = 0; i < v.length; i++) out[i] /= s;
  return out;
}

describe('card-index.format', () => {
  describe('quantizeInt8', () => {
    it('uses scale = maxabs/127 and reconstructs within half a step', () => {
      const v = randomUnit(768, lcg(1));
      const { q, scale } = quantizeInt8(v);
      let maxAbs = 0;
      for (const x of v) maxAbs = Math.max(maxAbs, Math.abs(x));
      expect(scale).toBeCloseTo(maxAbs / 127, 7);
      expect(q.length).toBe(768);
      for (let i = 0; i < v.length; i++) {
        expect(Math.abs(q[i] * scale - v[i])).toBeLessThanOrEqual(scale / 2 + 1e-7);
        expect(Math.abs(q[i])).toBeLessThanOrEqual(127);
      }
    });

    it('handles the zero vector without NaN', () => {
      const { q, scale } = quantizeInt8(new Float32Array(8));
      expect(Number.isFinite(scale)).toBeTrue();
      expect(Array.from(q)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('keeps cosine with the original above 0.999', () => {
      const v = randomUnit(768, lcg(2));
      const { q, scale } = quantizeInt8(v);
      let dot = 0;
      let n = 0;
      for (let i = 0; i < v.length; i++) {
        dot += v[i] * q[i] * scale;
        n += (q[i] * scale) ** 2;
      }
      expect(dot / Math.sqrt(n)).toBeGreaterThan(0.999);
    });
  });

  describe('encodeIndex / decodeIndex', () => {
    const rnd = lcg(3);
    const dim = 6;
    const ids = [10, 20, 20, 4294967295, 7];
    const fullRows = ids.map(() => randomUnit(dim, rnd));
    const artRows = ids.map(() => randomUnit(dim, rnd));
    let index: CardIndex;
    beforeEach(() => {
      index = buildIndex(ids, fullRows, artRows);
    });

    it('round-trips every field', () => {
      const bin = encodeIndex(index);
      expect(String.fromCharCode(bin[0], bin[1], bin[2], bin[3])).toBe('YGCI');
      // header padded to a multiple of 4
      const headerLen = new DataView(bin.buffer, bin.byteOffset).getUint32(4, true);
      expect(headerLen % 4).toBe(0);
      const copy = bin.slice().buffer;
      const back = decodeIndex(copy);
      expect(back.meta).toEqual(index.meta);
      expect(Array.from(back.ids)).toEqual(Array.from(index.ids));
      expect(Array.from(back.fullScale)).toEqual(Array.from(index.fullScale));
      expect(Array.from(back.artScale)).toEqual(Array.from(index.artScale));
      expect(Array.from(back.full)).toEqual(Array.from(index.full));
      expect(Array.from(back.art)).toEqual(Array.from(index.art));
      expect(back.ids instanceof Uint32Array).toBeTrue();
      expect(back.fullScale instanceof Float32Array).toBeTrue();
      expect(back.full instanceof Int8Array).toBeTrue();
    });

    it('decodes from an unaligned slice of a larger buffer', () => {
      const bin = encodeIndex(index);
      const big = new Uint8Array(bin.length + 3);
      big.set(bin, 3);
      const back = decodeIndex(big.buffer.slice(3));
      expect(Array.from(back.ids)).toEqual(ids);
    });

    it('rejects a bad magic', () => {
      const bin = encodeIndex(index).slice();
      bin[0] = 'X'.charCodeAt(0);
      expect(() => decodeIndex(bin.buffer)).toThrowError(/magic/i);
    });

    it('rejects a short / truncated buffer', () => {
      expect(() => decodeIndex(new Uint8Array(3).buffer)).toThrowError(/short|truncated/i);
      const bin = encodeIndex(index);
      expect(() => decodeIndex(bin.slice(0, bin.length - 1).buffer)).toThrowError(
        /short|truncated/i,
      );
    });

    it('rejects a header whose dim/count do not match the payload', () => {
      const bad = { ...index, meta: { ...index.meta, count: 99 } };
      expect(() => encodeIndex(bad)).toThrowError(/count/i);
    });
  });

  describe('searchIndex', () => {
    const dim = 32;
    const rnd = lcg(42);
    const n = 200;
    const ids = Array.from({ length: n }, (_, i) => 1000 + i);
    const full = ids.map(() => randomUnit(dim, rnd));
    const art = ids.map(() => randomUnit(dim, rnd));

    it('returns the planted nearest vector first', () => {
      const index = buildIndex(ids, full, art);
      const target = 137;
      const res = searchIndex(
        index,
        noisyCopy(full[target], 0.05, rnd),
        noisyCopy(art[target], 0.05, rnd),
        5,
      );
      expect(res.length).toBe(5);
      expect(res[0].id).toBe(1000 + target);
      expect(res[0].row).toBe(target);
      for (let i = 1; i < res.length; i++) {
        expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
      }
      expect(res[0].score).toBeGreaterThan(1.8);
      expect(res[0].score).toBeLessThanOrEqual(2.01);
    });

    it('works with queryArt null (full score only)', () => {
      const index = buildIndex(ids, full, art);
      const res = searchIndex(index, noisyCopy(full[3], 0.05, rnd), null, 3);
      expect(res[0].id).toBe(1003);
      expect(res[0].score).toBeGreaterThan(0.9);
      expect(res[0].score).toBeLessThanOrEqual(1.01);
    });

    it('dedupes alternate-art rows by id, keeping the best row', () => {
      // rows 0..n-1 as above, plus two alternate rows of card 1050 close to the query
      const q = randomUnit(dim, rnd);
      const qa = randomUnit(dim, rnd);
      const allIds = [...ids, 1050, 1050];
      const allFull = [...full, noisyCopy(q, 0.02, rnd), noisyCopy(q, 0.2, rnd)];
      const allArt = [...art, noisyCopy(qa, 0.02, rnd), noisyCopy(qa, 0.2, rnd)];
      const index = buildIndex(allIds, allFull, allArt);
      const res = searchIndex(index, q, qa, 10);
      expect(res.length).toBe(10);
      expect(res[0].id).toBe(1050);
      expect(res[0].row).toBe(n);
      expect(new Set(res.map((r) => r.id)).size).toBe(10);
      expect(res.filter((r) => r.id === 1050).length).toBe(1);
    });

    it('returns at most the number of distinct ids', () => {
      const index = buildIndex([1, 1, 2], full.slice(0, 3), art.slice(0, 3));
      const res = searchIndex(index, full[0], art[0], 10);
      expect(res.map((r) => r.id).sort()).toEqual([1, 2]);
    });

    it('rejects a query of the wrong dimension', () => {
      const index = buildIndex(ids, full, art);
      expect(() => searchIndex(index, new Float32Array(dim - 1), null, 1)).toThrowError(/dim/i);
    });
  });
});
