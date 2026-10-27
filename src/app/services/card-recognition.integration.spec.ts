// Integration spec, excluded from the default ng test via angular.json. Run explicitly with the
// custom karma config (raises the no-activity timeout; model download + inference take ~35 s):
//   npx ng test --watch=false --karma-config=karma.integration.conf.js
//     --include="src/app/services/card-recognition.integration.spec.ts" --exclude="src/none.ts"
// (the extra --exclude overrides the exclude configured in angular.json).
// Needs network access to the Hugging Face CDN for the dinov2-small model (~24 MB).
import { TestBed } from '@angular/core/testing';
import { CardEmbeddingService } from './embedding/card-embedding.service';
import { CardIndex, encodeIndex, decodeIndex, quantizeInt8, searchIndex } from '../utils/card-index.format';

const IDS = [
  10002346, 12163590, 15083304, 17955766, 20934683, 23837054, 26593852, 2926176, 31411835, 34193084,
  36870345, 39568067, 42199039, 45133463, 47961808, 50930991, 53797637, 56562619, 59385322, 6205579,
  65114115, 68018709, 71228611, 74131780, 76978105, 80073414, 8279188, 85651167, 88619463, 91482773,
];
const ART_BOX = { x0: 0.11, x1: 0.89, y0: 0.18, y1: 0.72 };

async function loadBitmap(id: number): Promise<ImageBitmap> {
  const res = await fetch(`/test-fixtures/cards/${id}.jpg`);
  if (!res.ok) throw new Error(`fixture ${id}: HTTP ${res.status}`);
  return createImageBitmap(await res.blob());
}

function draw(src: ImageBitmap | HTMLCanvasElement, w: number, h: number, filter = 'none',
              crop?: { x: number; y: number; w: number; h: number }) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = filter;
  const sw = 'width' in src ? src.width : 0;
  const sh = 'height' in src ? src.height : 0;
  const r = crop ?? { x: 0, y: 0, w: sw, h: sh };
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { rgba: d.data, width: w, height: h, canvas: c };
}

/** Full image + art crop (11..89% x 18..72%) of the given source, as RGBA payloads. */
function frames(src: ImageBitmap | HTMLCanvasElement) {
  const w = src.width;
  const h = src.height;
  const full = draw(src, w, h);
  const cx = Math.round(w * ART_BOX.x0);
  const cy = Math.round(h * ART_BOX.y0);
  const cw = Math.round(w * (ART_BOX.x1 - ART_BOX.x0));
  const ch = Math.round(h * (ART_BOX.y1 - ART_BOX.y0));
  const art = draw(src, cw, ch, 'none', { x: cx, y: cy, w: cw, h: ch });
  return {
    full: { rgba: full.rgba, width: w, height: h },
    art: { rgba: art.rgba, width: cw, height: ch },
  };
}

describe('card recognition (integration, real model)', () => {
  it('recognises degraded cards against a 30-card index', async () => {
    const emb = TestBed.inject(CardEmbeddingService);
    const bitmaps: ImageBitmap[] = [];
    try {
      await emb.load();
      expect(emb.state()).toBe('ready');

      const dim = 768;
      const count = IDS.length;
      const full = new Int8Array(count * dim);
      const art = new Int8Array(count * dim);
      const fullScale = new Float32Array(count);
      const artScale = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const bmp = await loadBitmap(IDS[i]);
        bitmaps.push(bmp);
        const f = frames(bmp);
        const e = await emb.embed(f.full, f.art);
        const qf = quantizeInt8(e.full);
        const qa = quantizeInt8(e.art);
        full.set(qf.q, i * dim);
        art.set(qa.q, i * dim);
        fullScale[i] = qf.scale;
        artScale[i] = qa.scale;
      }
      const index: CardIndex = {
        meta: { version: 1, model: 'onnx-community/dinov2-small', dtype: 'q8', dim, count, recipe: 'integration' },
        ids: Uint32Array.from(IDS), fullScale, artScale, full, art,
      };
      const roundTripped = decodeIndex(encodeIndex(index).slice().buffer);

      let hits = 0;
      const tested = 10;
      for (let n = 0; n < tested; n++) {
        const i = n * 3;
        const bmp = bitmaps[i];
        // degrade: downscale to 200 px wide, blur, then upsample back to the 400 px webcam-like frame
        const small = draw(bmp, 200, Math.round(200 * bmp.height / bmp.width), 'blur(1.2px)');
        const q = frames(small.canvas);
        const e = await emb.embed(q.full, q.art);
        const top = searchIndex(roundTripped, e.full, e.art, 1)[0];
        if (top.id === IDS[i]) hits++;
      }
      console.log(`[integration] backend=${emb.backend()} top-1 ${hits}/${tested}`);
      expect(hits).toBeGreaterThanOrEqual(8);
    } finally {
      bitmaps.forEach((b) => b.close());
      emb.dispose();
    }
  }, 600_000);
});
