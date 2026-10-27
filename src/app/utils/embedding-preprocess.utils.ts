export const MODEL_INPUT_SIZE = 224;

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

interface Taps {
  start: Int32Array;
  count: Int32Array;
  weights: Float32Array; // S * maxTaps
  maxTaps: number;
}

function lanczos3(x: number): number {
  const ax = Math.abs(x);
  if (ax >= 3) return 0;
  if (ax < 1e-8) return 1;
  const px = Math.PI * ax;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
}

/** Lanczos3 taps (antialiased when shrinking); matches the libvips default used by the Node recipe. */
function buildTaps(srcSize: number, dstSize: number): Taps {
  const scale = srcSize / dstSize;
  const stretch = Math.max(scale, 1);
  const support = 3 * stretch;
  const maxTaps = Math.ceil(support * 2) + 2;
  const start = new Int32Array(dstSize);
  const count = new Int32Array(dstSize);
  const weights = new Float32Array(dstSize * maxTaps);
  for (let o = 0; o < dstSize; o++) {
    const center = (o + 0.5) * scale;
    const lo = Math.max(0, Math.floor(center - support));
    const hi = Math.min(srcSize - 1, Math.ceil(center + support) - 1);
    let sum = 0;
    let n = 0;
    for (let i = lo; i <= hi && n < maxTaps; i++, n++) {
      const w = lanczos3((i + 0.5 - center) / stretch);
      weights[o * maxTaps + n] = w;
      sum += w;
    }
    if (Math.abs(sum) < 1e-6) {
      // degenerate (tiny source): fall back to the nearest source pixel
      const i = Math.min(srcSize - 1, Math.max(0, Math.floor(center)));
      start[o] = i;
      count[o] = 1;
      weights[o * maxTaps] = 1;
      continue;
    }
    for (let k = 0; k < n; k++) weights[o * maxTaps + k] /= sum;
    start[o] = lo;
    count[o] = n;
  }
  return { start, count, weights, maxTaps };
}

/**
 * Squash-resize (separable Lanczos3, antialiased when shrinking; same filter as the Node recipe's
 * sharp/libvips resize) an RGBA region to 224x224 and return normalised CHW floats. Alpha is ignored.
 * Lanczos can overshoot, so resized values are clamped to 0..255.
 */
export function rgbaToChw(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mean: readonly number[],
  std: readonly number[],
): Float32Array {
  const S = MODEL_INPUT_SIZE;
  const plane = S * S;
  const tx = buildTaps(width, S);
  const ty = buildTaps(height, S);

  // horizontal pass: height x S x 3
  const tmp = new Float32Array(height * S * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      const base = x * tx.maxTaps;
      for (let k = 0; k < tx.count[x]; k++) {
        const w = tx.weights[base + k];
        const i = (y * width + tx.start[x] + k) * 4;
        r += rgba[i] * w;
        g += rgba[i + 1] * w;
        b += rgba[i + 2] * w;
      }
      const o = (y * S + x) * 3;
      tmp[o] = r;
      tmp[o + 1] = g;
      tmp[o + 2] = b;
    }
  }

  // vertical pass + normalisation
  const out = new Float32Array(3 * plane);
  for (let y = 0; y < S; y++) {
    const base = y * ty.maxTaps;
    for (let x = 0; x < S; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < ty.count[y]; k++) {
        const w = ty.weights[base + k];
        const o = ((ty.start[y] + k) * S + x) * 3;
        r += tmp[o] * w;
        g += tmp[o + 1] * w;
        b += tmp[o + 2] * w;
      }
      const p = y * S + x;
      out[p] = (clamp255(r) / 255 - mean[0]) / std[0];
      out[plane + p] = (clamp255(g) / 255 - mean[1]) / std[1];
      out[2 * plane + p] = (clamp255(b) / 255 - mean[2]) / std[2];
    }
  }
  return out;
}

function l2(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

/** [L2(cls), L2(meanPatch)] then L2 of the concatenation; tokens = last_hidden_state data [1, t, d]. */
export function poolTokens(tokens: Float32Array, tokenCount: number, dim: number): Float32Array {
  const cls = Float32Array.from(tokens.subarray(0, dim));
  const m = new Float32Array(dim);
  for (let j = 1; j < tokenCount; j++) {
    for (let q = 0; q < dim; q++) m[q] += tokens[j * dim + q];
  }
  const v = new Float32Array(2 * dim);
  v.set(l2(cls));
  v.set(l2(m), dim);
  return l2(v);
}
