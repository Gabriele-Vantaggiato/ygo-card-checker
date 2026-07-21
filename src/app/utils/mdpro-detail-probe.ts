import pixelmatch from 'pixelmatch';
import { CaptureCrop } from '../services/screen-capture.service';

/** Centered panel region used to detect MDPRO card-detail modal. */
export const MDPRO_MODAL_PROBE_CROP: CaptureCrop = {
  x: 0.18,
  y: 0.08,
  w: 0.64,
  h: 0.55,
};

/**
 * Right info panel (stats + `[Type] [passcode]`) — preferred OCR target.
 * Passcodes are unique and far more reliable than truncated title OCR.
 */
export const MDPRO_PASSCODE_CROP: CaptureCrop = {
  x: 0.46,
  y: 0.12,
  w: 0.5,
  h: 0.38,
};

/** Wider title + panel strip — fallback when passcode crop finds nothing. */
export const MDPRO_OCR_CROP: CaptureCrop = {
  x: 0.2,
  y: 0.08,
  w: 0.72,
  h: 0.45,
};

const PROBE_WIDTH = 160;

export interface DetailProbeSample {
  imageData: ImageData;
  warmRatio: number;
  darkRatio: number;
}

/**
 * Downscale a canvas to a tiny probe for cheap comparisons (no OCR).
 */
export function toProbeSample(source: HTMLCanvasElement): DetailProbeSample {
  const canvas = document.createElement('canvas');
  const scale = PROBE_WIDTH / Math.max(1, source.width);
  canvas.width = PROBE_WIDTH;
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      imageData: new ImageData(1, 1),
      warmRatio: 0,
      darkRatio: 0,
    };
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    imageData,
    warmRatio: warmPixelRatio(imageData),
    darkRatio: darkPixelRatio(imageData),
  };
}

/**
 * Fraction of mismatched pixels via pixelmatch (0–1).
 */
export function frameDiffRatio(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) {
    return 1;
  }
  const diff = new Uint8ClampedArray(a.data.length);
  const mismatched = pixelmatch(a.data, b.data, diff, a.width, a.height, {
    threshold: 0.12,
    includeAA: false,
  });
  return mismatched / (a.width * a.height);
}

/**
 * MDPRO detail modal: large visual change vs deck baseline.
 * Warm gold header is a soft signal (crop ratios vary by window size).
 */
export function looksLikeDetailModal(sample: DetailProbeSample, baseline: DetailProbeSample | null): boolean {
  if (!baseline) {
    return sample.warmRatio >= 0.008 && sample.darkRatio >= 0.3;
  }
  const changed = frameDiffRatio(sample.imageData, baseline.imageData) >= 0.055;
  // Big scene change is enough — gold bar alone is unreliable across resolutions.
  return changed;
}

export function looksLikeDetailClosed(sample: DetailProbeSample, baseline: DetailProbeSample | null): boolean {
  if (!baseline) {
    return sample.warmRatio < 0.008;
  }
  return frameDiffRatio(sample.imageData, baseline.imageData) < 0.04;
}

function warmPixelRatio(imageData: ImageData): number {
  const { data } = imageData;
  let warm = 0;
  const step = 16; // sample every 4th pixel (RGBA)
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Gold / brown title bar of MDPRO detail
    if (r > 110 && g > 70 && b < 110 && r > b + 25 && g > b) {
      warm += 1;
    }
  }
  return warm / (data.length / step);
}

function darkPixelRatio(imageData: ImageData): number {
  const { data } = imageData;
  let dark = 0;
  const step = 16;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r + g + b < 180) {
      dark += 1;
    }
  }
  return dark / (data.length / step);
}
