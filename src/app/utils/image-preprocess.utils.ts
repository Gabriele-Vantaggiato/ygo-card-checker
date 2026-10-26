/**
 * Pure RGBA pixel helpers (as returned by getImageData) used to make OCR more
 * robust against poor light and reflections. All functions mutate in place and
 * return the same array for chaining.
 */

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function luminanceHistogram(rgba: Uint8ClampedArray): { hist: number[]; total: number } {
  const hist = new Array<number>(256).fill(0);
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    hist[Math.round(luma(rgba[i], rgba[i + 1], rgba[i + 2]))]++;
    total++;
  }
  return { hist, total };
}

export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < rgba.length; i += 4) {
    const v = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  return rgba;
}

export function meanLuminance(rgba: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    sum += luma(rgba[i], rgba[i + 1], rgba[i + 2]);
    n++;
  }
  return n ? sum / n : 0;
}

/** Percentile-based histogram stretch on luminance; output is grayscale. */
export function stretchContrast(rgba: Uint8ClampedArray, lowPct = 2, highPct = 98): Uint8ClampedArray {
  const { hist, total } = luminanceHistogram(rgba);
  if (!total) {
    return rgba;
  }
  const percentile = (pct: number): number => {
    const target = (total * pct) / 100;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) {
        return v;
      }
    }
    return 255;
  };
  const lo = percentile(lowPct);
  const hi = percentile(highPct);
  if (hi <= lo) {
    return rgba; // flat image: nothing to stretch
  }
  const scale = 255 / (hi - lo);
  for (let i = 0; i < rgba.length; i += 4) {
    const v = (luma(rgba[i], rgba[i + 1], rgba[i + 2]) - lo) * scale;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  return rgba;
}

/** Otsu's method on the luminance histogram. Pixels <= threshold are the dark class. */
export function otsuThreshold(rgba: Uint8ClampedArray): number {
  const { hist, total } = luminanceHistogram(rgba);
  if (!total) {
    return 128;
  }
  let sumAll = 0;
  for (let v = 0; v < 256; v++) {
    sumAll += v * hist[v];
  }
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let threshold = 128;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) {
      continue;
    }
    const wF = total - wB;
    if (wF === 0) {
      break;
    }
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  return threshold;
}

/** Luminance > threshold becomes white (black when inverted), the rest the opposite. */
export function binarize(rgba: Uint8ClampedArray, threshold: number, invert = false): Uint8ClampedArray {
  for (let i = 0; i < rgba.length; i += 4) {
    const above = luma(rgba[i], rgba[i + 1], rgba[i + 2]) > threshold;
    const v = above !== invert ? 255 : 0;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  return rgba;
}
