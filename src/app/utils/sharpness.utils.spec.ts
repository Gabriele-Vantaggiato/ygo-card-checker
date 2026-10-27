import { isSharp, laplacianVariance, SHARPNESS_THRESHOLD } from './sharpness.utils';

function make(w: number, h: number, f: (x: number, y: number) => number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const i = (y * w + x) * 4;
      a[i] = v;
      a[i + 1] = v;
      a[i + 2] = v;
      a[i + 3] = 255;
    }
  }
  return a;
}

function boxBlur(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += src[(yy * w + xx) * 4];
          n++;
        }
      }
      const i = (y * w + x) * 4;
      out[i] = s / n;
      out[i + 1] = s / n;
      out[i + 2] = s / n;
      out[i + 3] = 255;
    }
  }
  return out;
}

describe('laplacianVariance', () => {
  const W = 32;
  const H = 32;

  it('is 0 for a flat image', () => {
    expect(laplacianVariance(make(W, H, () => 120), W, H)).toBe(0);
  });

  it('is higher for a checkerboard than for its blurred copy', () => {
    const sharp = make(W, H, (x, y) => ((x + y) % 2 ? 255 : 0));
    expect(laplacianVariance(sharp, W, H)).toBeGreaterThan(laplacianVariance(boxBlur(sharp, W, H), W, H));
  });

  it('is higher for a sharp edge than for its 3x3 box blur', () => {
    const edge = make(W, H, x => (x < W / 2 ? 20 : 230));
    const v = laplacianVariance(edge, W, H);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeGreaterThan(laplacianVariance(boxBlur(edge, W, H), W, H));
  });

  it('returns 0 for images too small for the kernel', () => {
    expect(laplacianVariance(make(2, 2, () => 5), 2, 2)).toBe(0);
  });
});

describe('isSharp', () => {
  it('compares against the default threshold', () => {
    expect(isSharp(SHARPNESS_THRESHOLD + 1)).toBeTrue();
    expect(isSharp(SHARPNESS_THRESHOLD - 1)).toBeFalse();
  });

  it('accepts a custom threshold', () => {
    expect(isSharp(10, 5)).toBeTrue();
    expect(isSharp(10, 50)).toBeFalse();
  });
});
