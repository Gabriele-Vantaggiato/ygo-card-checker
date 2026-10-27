import { MODEL_INPUT_SIZE, poolTokens, rgbaToChw } from './embedding-preprocess.utils';

describe('rgbaToChw', () => {
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  function uniform(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      a[i * 4] = r;
      a[i * 4 + 1] = g;
      a[i * 4 + 2] = b;
      a[i * 4 + 3] = 7;
    }
    return a;
  }

  it('fills each channel plane with (v/255-mean)/std', () => {
    const out = rgbaToChw(uniform(10, 10, 255, 128, 0), 10, 10, mean, std);
    const plane = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    expect(out.length).toBe(3 * plane);
    const exp = [(1 - mean[0]) / std[0], (128 / 255 - mean[1]) / std[1], (0 - mean[2]) / std[2]];
    for (let c = 0; c < 3; c++) {
      expect(out[c * plane]).toBeCloseTo(exp[c], 4);
      expect(out[c * plane + plane - 1]).toBeCloseTo(exp[c], 4);
      expect(out[c * plane + 12345]).toBeCloseTo(exp[c], 4);
    }
  });

  it('works on non-square input', () => {
    const out = rgbaToChw(uniform(30, 7, 10, 20, 30), 30, 7, mean, std);
    expect(out.length).toBe(3 * 224 * 224);
    expect(out[0]).toBeCloseTo((10 / 255 - mean[0]) / std[0], 4);
  });

  it('keeps a horizontal gradient monotonic when downscaling', () => {
    const w = 640;
    const h = 20;
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round((x * 255) / (w - 1));
        const i = (y * w + x) * 4;
        a[i] = v;
        a[i + 1] = v;
        a[i + 2] = v;
      }
    }
    const out = rgbaToChw(a, w, h, mean, std);
    const S = MODEL_INPUT_SIZE;
    const row = 100 * S;
    for (let x = 1; x < S; x++) {
      expect(out[row + x]).toBeGreaterThanOrEqual(out[row + x - 1] - 1e-5);
    }
    expect(out[row + S - 1]).toBeGreaterThan(out[row]);
  });

  it('gives identical results when the cached taps and scratch buffer are reused', () => {
    const img = uniform(50, 40, 200, 100, 50);
    img[(10 * 50 + 10) * 4] = 0;
    const first = rgbaToChw(img, 50, 40, mean, std);
    rgbaToChw(uniform(33, 21, 1, 2, 3), 33, 21, mean, std);
    const again = rgbaToChw(img, 50, 40, mean, std);
    expect(Array.from(again)).toEqual(Array.from(first));
  });
});

describe('poolTokens', () => {
  it('matches a hand-computed example (d=2, t=3)', () => {
    // cls=[3,4] -> [0.6,0.8]; patches [1,0]+[0,1]=[1,1] -> [s,s], s=sqrt(0.5); concat norm = sqrt(2)
    const tokens = new Float32Array([3, 4, 1, 0, 0, 1]);
    const v = poolTokens(tokens, 3, 2);
    const s = Math.SQRT1_2;
    expect(v.length).toBe(4);
    expect(v[0]).toBeCloseTo(0.6 / Math.SQRT2, 5);
    expect(v[1]).toBeCloseTo(0.8 / Math.SQRT2, 5);
    expect(v[2]).toBeCloseTo(s / Math.SQRT2, 5);
    expect(v[3]).toBeCloseTo(s / Math.SQRT2, 5);
  });

  it('returns a unit vector of length 2*dim', () => {
    const t = 5;
    const d = 4;
    const tokens = Float32Array.from({ length: t * d }, (_, i) => Math.sin(i) * 3 + 1);
    const v = poolTokens(tokens, t, d);
    expect(v.length).toBe(2 * d);
    expect(Math.hypot(...Array.from(v))).toBeCloseTo(1, 5);
  });
});
