import { TestBed } from '@angular/core/testing';
import { CardIndexService } from './card-index.service';
import { CardIndex, encodeIndex, quantizeInt8 } from '../utils/card-index.format';

function buildIndex(): Uint8Array {
  const dim = 4;
  const vecs = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]].map(v => new Float32Array(v));
  const full = new Int8Array(3 * dim);
  const scales = new Float32Array(3);
  vecs.forEach((v, i) => {
    const { q, scale } = quantizeInt8(v);
    full.set(q, i * dim);
    scales[i] = scale;
  });
  const index: CardIndex = {
    meta: { version: 1, model: 'm', dtype: 'q8', dim, count: 3, recipe: 'test' },
    ids: new Uint32Array([11, 22, 33]),
    fullScale: scales,
    artScale: scales.slice(),
    full,
    art: full.slice(),
  };
  return encodeIndex(index);
}

describe('CardIndexService', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    TestBed.configureTestingModule({});
  });
  afterEach(() => { window.fetch = originalFetch; });

  it('loads an index and searches it', async () => {
    const bytes = buildIndex();
    window.fetch = (() => Promise.resolve(new Response(bytes as BlobPart))) as typeof fetch;
    const svc = TestBed.inject(CardIndexService);
    await svc.load();
    expect(svc.state()).toBe('ready');
    expect(svc.version()).toBe('test/v1');
    const hits = svc.search(new Float32Array([0, 1, 0, 0]), null, 2);
    expect(hits[0].id).toBe(22);
  });

  it('reports streamed progress when the body is not content-encoded', async () => {
    const bytes = buildIndex();
    window.fetch = (() => Promise.resolve(new Response(bytes as BlobPart, {
      headers: { 'content-length': String(bytes.length) },
    }))) as typeof fetch;
    const svc = TestBed.inject(CardIndexService);
    const seen: number[] = [];
    const set = svc.progress.set.bind(svc.progress);
    spyOn(svc.progress, 'set').and.callFake((v: number) => { seen.push(v); set(v); });
    await svc.load();
    expect(svc.state()).toBe('ready');
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen.some(v => v > 0 && v <= 1)).toBeTrue();
  });

  it('skips streamed progress for a content-encoded body (content-length is the compressed size)', async () => {
    const bytes = buildIndex();
    window.fetch = (() => Promise.resolve(new Response(bytes as BlobPart, {
      headers: { 'content-encoding': 'gzip', 'content-length': '10' },
    }))) as typeof fetch;
    const svc = TestBed.inject(CardIndexService);
    const seen: number[] = [];
    const set = svc.progress.set.bind(svc.progress);
    spyOn(svc.progress, 'set').and.callFake((v: number) => { seen.push(v); set(v); });
    await svc.load();
    expect(svc.state()).toBe('ready');
    expect(seen).toEqual([0, 1]);
  });

  it('goes to error on 404 and search throws', async () => {
    spyOn(console, 'error');
    window.fetch = (() => Promise.resolve(new Response('nope', { status: 404 }))) as typeof fetch;
    const svc = TestBed.inject(CardIndexService);
    await svc.load();
    expect(svc.state()).toBe('error');
    expect(() => svc.search(new Float32Array(4), null, 1)).toThrow();
  });
});
