export const CARD_ASPECT = 59 / 86;

export interface GuideRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Centered card-shaped rectangle inside a video frame, as fractions (0..1) of
 * the frame. The overlay and the OCR crop both use it so they stay aligned.
 */
export function guideRect(videoWidth: number, videoHeight: number): GuideRect {
  let h = videoHeight * 0.88;
  let w = h * CARD_ASPECT;
  if (w > videoWidth * 0.94) {
    w = videoWidth * 0.94;
    h = w / CARD_ASPECT;
  }
  return {
    x: (videoWidth - w) / 2 / videoWidth,
    y: (videoHeight - h) / 2 / videoHeight,
    w: w / videoWidth,
    h: h / videoHeight,
  };
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Artwork region of a card as fractions of the card (matches tools/card-index/embedder.mjs). */
export const ART_BOX: Box = { x0: 0.11, x1: 0.89, y0: 0.18, y1: 0.72 };

/** Pixel rectangle of a fractional box inside a w x h frame (rounded, clamped to >= 1 px). */
export function cropRect(w: number, h: number, box: Box): { sx: number; sy: number; sw: number; sh: number } {
  const clamp = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max);
  const sx = clamp(w * box.x0, Math.max(0, w - 1));
  const sy = clamp(h * box.y0, Math.max(0, h - 1));
  const sw = Math.max(1, clamp(w * box.x1, w) - sx);
  const sh = Math.max(1, clamp(h * box.y1, h) - sy);
  return { sx, sy, sw, sh };
}
