import { guideRect } from './scan-geometry.utils';

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
