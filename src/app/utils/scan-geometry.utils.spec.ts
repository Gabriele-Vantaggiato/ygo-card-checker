import { ART_BOX, cropRect, guideRect } from './scan-geometry.utils';

describe('guideRect', () => {
  it('fits a portrait stream by width', () => {
    const r = guideRect(720, 1280);
    expect(r.w).toBeCloseTo(0.94, 2);
    expect(r.x).toBeCloseTo(0.03, 2);
    expect(r.h).toBeCloseTo(0.771, 2);
    expect(r.y).toBeCloseTo((1 - r.h) / 2, 3);
  });

  it('fits a landscape stream by height', () => {
    const r = guideRect(1280, 720);
    expect(r.h).toBeCloseTo(0.88, 2);
    expect(r.w).toBeCloseTo(0.34, 2);
    expect(r.x).toBeCloseTo((1 - r.w) / 2, 3);
  });

  it('keeps the card aspect ratio in pixels', () => {
    const r = guideRect(1000, 1000);
    expect((r.w * 1000) / (r.h * 1000)).toBeCloseTo(59 / 86, 3);
  });
});

describe('cropRect', () => {
  it('computes the art box of a 1000x1400 card', () => {
    expect(cropRect(1000, 1400, ART_BOX)).toEqual({ sx: 110, sy: 252, sw: 780, sh: 756 });
  });

  it('rounds fractional coordinates', () => {
    const r = cropRect(101, 143, ART_BOX);
    expect(r.sx).toBe(11);
    expect(r.sy).toBe(26);
    expect(r.sw).toBe(Math.round(101 * 0.78));
    expect(r.sh).toBe(Math.round(143 * 0.54));
  });

  it('clamps to at least 1 px and inside the frame', () => {
    const tiny = cropRect(1, 1, ART_BOX);
    expect(tiny.sw).toBeGreaterThanOrEqual(1);
    expect(tiny.sh).toBeGreaterThanOrEqual(1);
    const r = cropRect(100, 100, { x0: 0.9, x1: 1.5, y0: -0.2, y1: 0.0001 });
    expect(r.sx + r.sw).toBeLessThanOrEqual(100);
    expect(r.sy).toBe(0);
    expect(r.sh).toBe(1);
  });
});
