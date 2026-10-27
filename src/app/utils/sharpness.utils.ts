/** Variance of the 4-neighbour Laplacian over the luminance of an RGBA image (higher = sharper). */
export function laplacianVariance(rgba: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const r = lum[i - width] + lum[i + width] + lum[i - 1] + lum[i + 1] - 4 * lum[i];
      sum += r;
      sumSq += r * r;
      n++;
    }
  }
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

/**
 * Frames below this variance are treated as blurry and skipped.
 * Measured on 60 cached card images resized to 224 px width (Laplacian variance of luminance):
 *   sharp          min 1280  p10 2536  median 3742  max 7004
 *   blur sigma 0.8 min  262  median  471  max  797
 *   blur sigma 1.5 (harsh) min 43  median 83  max 149
 * 300 sits between the harsh blur (<= 149) and the sharp originals (>= 1280); webcam sensor noise
 * only raises the variance, so the gate is conservative.
 */
export const SHARPNESS_THRESHOLD = 300;

export function isSharp(variance: number, threshold: number = SHARPNESS_THRESHOLD): boolean {
  return variance >= threshold;
}
