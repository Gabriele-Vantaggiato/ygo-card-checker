import { binarize, meanLuminance, otsuThreshold, stretchContrast, toGrayscale } from './image-preprocess.utils';

function rgbaFrom(values: number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => {
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  });
  return out;
}

function lumaAt(rgba: Uint8ClampedArray, pixel: number): number {
  return rgba[pixel * 4];
}

describe('image-preprocess.utils', () => {
  it('toGrayscale uses luminance weights and keeps alpha', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 200, 0, 255, 0, 255]);
    toGrayscale(rgba);
    expect(rgba[0]).toBe(rgba[1]);
    expect(rgba[1]).toBe(rgba[2]);
    expect(rgba[0]).toBeCloseTo(76, 0);
    expect(rgba[3]).toBe(200);
    expect(rgba[4]).toBeCloseTo(150, 0);
  });

  it('meanLuminance averages the pixels', () => {
    expect(meanLuminance(rgbaFrom([0, 100, 200, 100]))).toBeCloseTo(100, 5);
    expect(meanLuminance(new Uint8ClampedArray(0))).toBe(0);
  });

  it('stretchContrast maps a low-contrast gradient to near 0..255', () => {
    const values: number[] = [];
    for (let i = 0; i < 100; i++) {
      values.push(100 + i * 0.5); // 100..149.5
    }
    const rgba = rgbaFrom(values);
    stretchContrast(rgba);
    let min = 255;
    let max = 0;
    for (let i = 0; i < values.length; i++) {
      min = Math.min(min, lumaAt(rgba, i));
      max = Math.max(max, lumaAt(rgba, i));
    }
    expect(min).toBeLessThanOrEqual(5);
    expect(max).toBeGreaterThanOrEqual(250);
    // monotonic
    expect(lumaAt(rgba, 50)).toBeGreaterThan(lumaAt(rgba, 10));
  });

  it('stretchContrast leaves a flat image unchanged', () => {
    const rgba = rgbaFrom([90, 90, 90, 90]);
    stretchContrast(rgba);
    expect(lumaAt(rgba, 0)).toBe(90);
  });

  it('otsuThreshold separates a bimodal sample', () => {
    const values = [...Array(50).fill(40), ...Array(50).fill(200)];
    const t = otsuThreshold(rgbaFrom(values));
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(200);
  });

  it('binarize thresholds to black/white and can invert', () => {
    const rgba = rgbaFrom([40, 200]);
    binarize(rgba, 120);
    expect(lumaAt(rgba, 0)).toBe(0);
    expect(lumaAt(rgba, 1)).toBe(255);

    const inv = rgbaFrom([40, 200]);
    binarize(inv, 120, true);
    expect(lumaAt(inv, 0)).toBe(255);
    expect(lumaAt(inv, 1)).toBe(0);
    expect(inv[3]).toBe(255);
  });
});
