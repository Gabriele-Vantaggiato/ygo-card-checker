import { toProbeSample, looksLikeDetailModal, looksLikeDetailClosed } from './mdpro-detail-probe';

describe('mdpro-detail-probe', () => {
  function paintCanvas(fill: string, goldBar = false): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 320, 180);
    if (goldBar) {
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(60, 20, 200, 18);
    }
    return canvas;
  }

  it('detects warm gold header as detail modal vs cool baseline', () => {
    const baseline = toProbeSample(paintCanvas('#152030', false));
    const detailCanvas = paintCanvas('#101820', false);
    const ctx = detailCanvas.getContext('2d')!;
    // Large warm title band so probe warmRatio clears threshold after downscale.
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(40, 16, 240, 36);
    const detail = toProbeSample(detailCanvas);
    expect(looksLikeDetailModal(detail, baseline)).toBeTrue();
  });

  it('treats cool frame similar to baseline as closed', () => {
    const baseline = toProbeSample(paintCanvas('#152030', false));
    const closed = toProbeSample(paintCanvas('#162132', false));
    expect(looksLikeDetailClosed(closed, baseline)).toBeTrue();
  });
});
