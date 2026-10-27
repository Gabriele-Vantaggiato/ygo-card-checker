import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { EmbeddingRequest, EmbeddingResponse, RgbaImage } from './card-embedding.worker';

interface Pending {
  resolve: (v: { full: Float32Array; art: Float32Array }) => void;
  reject: (e: Error) => void;
}

@Injectable({ providedIn: 'root' })
export class CardEmbeddingService {
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly progress = signal(0);
  readonly backend = signal<'webgpu' | 'wasm' | null>(null);
  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private loadSettle: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor() { inject(DestroyRef).onDestroy(() => this.dispose()); }

  load(): Promise<void> {
    if (this.state() === 'ready') return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.state.set('loading');
    this.progress.set(0);
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.loadSettle = { resolve, reject };
      try {
        const worker = new Worker(new URL('./card-embedding.worker', import.meta.url), { type: 'module' });
        this.worker = worker;
        worker.onmessage = ({ data }: MessageEvent<EmbeddingResponse>) => this.onMessage(data);
        worker.onerror = e => this.fail(new Error(e.message || 'embedding worker error'));
        worker.onmessageerror = () => this.fail(new Error('embedding worker message error'));
        worker.postMessage({ type: 'load' } satisfies EmbeddingRequest);
      } catch (e) {
        this.fail(e instanceof Error ? e : new Error(String(e)));
      }
    });
    return this.loadPromise;
  }

  /**
   * Calls are serialised: at most one request is in flight in the worker. The `rgba` buffers are
   * transferred to the worker (zero-copy) when the request is posted: callers must not reuse them.
   */
  embed(frame: RgbaImage, art: RgbaImage): Promise<{ full: Float32Array; art: Float32Array }> {
    if (this.state() !== 'ready' || !this.worker) return Promise.reject(new Error('embedding model not ready'));
    const invalid = invalidImage('frame', frame) ?? invalidImage('art', art);
    if (invalid) return Promise.reject(new Error(invalid));
    const run = () => new Promise<{ full: Float32Array; art: Float32Array }>((resolve, reject) => {
      const worker = this.worker;
      if (!worker) { reject(new Error('embedding worker disposed')); return; }
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'embed', id, full: frame, art } satisfies EmbeddingRequest, transferList(frame, art));
    });
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    const err = new Error('embedding service disposed');
    this.rejectAll(err);
    this.loadPromise = null;
    this.backend.set(null);
    this.progress.set(0);
    this.state.set('idle');
  }

  private onMessage(msg: EmbeddingResponse): void {
    switch (msg.type) {
      case 'progress':
        this.progress.set(msg.progress);
        break;
      case 'ready':
        this.backend.set(msg.backend);
        this.progress.set(1);
        this.state.set('ready');
        this.loadSettle?.resolve();
        this.loadSettle = null;
        break;
      case 'embedded': {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        p?.resolve({ full: msg.full, art: msg.art });
        break;
      }
      case 'error': {
        const err = new Error(msg.message);
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          p?.reject(err);
        } else {
          this.fail(err);
        }
        break;
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.loadSettle?.reject(err);
    this.loadSettle = null;
  }

  private fail(err: Error): void {
    console.error('[card-embedding]', err);
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(err);
    this.loadPromise = null;
    this.backend.set(null);
    this.progress.set(0);
    this.state.set('error');
  }
}

/** Error message when `img` is not a well-formed RGBA payload, else null. */
function invalidImage(name: string, img: RgbaImage): string | null {
  const { rgba, width, height } = img;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return `embed: invalid ${name} size ${width}x${height}`;
  }
  if (!rgba || rgba.length !== width * height * 4) {
    return `embed: ${name} has ${rgba?.length ?? 0} bytes, expected ${width * height * 4} (${width}x${height} RGBA)`;
  }
  return null;
}

/** Distinct transferable buffers of the two payloads (a buffer may only be listed once). */
function transferList(...imgs: RgbaImage[]): Transferable[] {
  const out = new Set<ArrayBuffer>();
  for (const img of imgs) {
    if (img.rgba.buffer instanceof ArrayBuffer) out.add(img.rgba.buffer);
  }
  return [...out];
}
