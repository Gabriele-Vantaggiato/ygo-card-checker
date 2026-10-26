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
