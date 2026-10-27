import { Injectable, signal } from '@angular/core';
import { CardIndex, decodeIndex, searchIndex } from '../utils/card-index.format';

export const CARD_INDEX_URL = 'assets/card-index/card-index.bin';

@Injectable({ providedIn: 'root' })
export class CardIndexService {
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly progress = signal(0);
  readonly index = signal<CardIndex | null>(null);
  readonly version = signal<string | null>(null);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.state() === 'ready') return Promise.resolve();
    return (this.loading ??= this.doLoad().finally(() => { this.loading = null; }));
  }

  private async doLoad(): Promise<void> {
    this.state.set('loading');
    this.progress.set(0);
    try {
      const res = await fetch(CARD_INDEX_URL);
      if (!res.ok) throw new Error(`card index fetch failed: HTTP ${res.status}`);
      const buf = await this.readBody(res);
      const index = decodeIndex(buf);
      this.index.set(index);
      this.version.set(`${index.meta.recipe}/v${index.meta.version}`);
      this.progress.set(1);
      this.state.set('ready');
    } catch (e) {
      console.error('[card-index] load failed', e);
      this.index.set(null);
      this.version.set(null);
      this.state.set('error');
    }
  }

  /** Streams the body for progress when content-length is known, else reads it in one go (indeterminate). */
  private async readBody(res: Response): Promise<ArrayBuffer> {
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total) return res.arrayBuffer();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      this.progress.set(Math.min(1, received / total));
    }
    const out = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out.buffer;
  }

  search(full: Float32Array, art: Float32Array | null, k: number): { id: number; score: number }[] {
    const index = this.index();
    if (this.state() !== 'ready' || !index) throw new Error('card index not ready');
    return searchIndex(index, full, art, k).map(({ id, score }) => ({ id, score }));
  }
}
