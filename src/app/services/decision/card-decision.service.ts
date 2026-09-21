import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import {
  DecisionCandidate, DecisionResponse, DecisionScore, MAX_DECISION_CANDIDATES,
  blendDecisionRanking,
} from './card-decision.model';
import { AiProviderPreferencesService } from '../ai-provider-preferences.service';

export const DECISION_WORKER = new InjectionToken<() => Worker>('decision worker', {
  providedIn: 'root',
  factory: () => () => new Worker(new URL('./card-decision.worker', import.meta.url), { type: 'module' }),
});

@Injectable({ providedIn: 'root' })
export class CardDecisionService {
  private static readonly STORAGE_KEY = 'ygo-card-decision-preferences';
  private readonly createWorker = inject(DECISION_WORKER);
  private readonly aiPreferences = inject(AiProviderPreferencesService);
  // Explicit opt-in; no model download on page load and no private prompt persisted.
  readonly preferences = signal(this.readPreferences());
  readonly preferences$ = toObservable(this.preferences).pipe(
    distinctUntilChanged((a, b) => a.enabled === b.enabled && a.prompt === b.prompt),
  );
  readonly status = signal<'idle' | 'loading' | 'ranking' | 'ready' | 'fallback'>('idle');
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, (scores: unknown) => void>();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() { inject(DestroyRef).onDestroy(() => this.stop()); }

  setPreferences(enabled: boolean, prompt: string): void {
    const next = { enabled, prompt: prompt.trim().slice(0, 500) };
    this.preferences.set(next);
    try {
      localStorage.setItem(CardDecisionService.STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing/storage-disabled environments still support the feature per page.
    }
    if (!enabled) { this.stop(); this.status.set('idle'); }
  }

  private readPreferences(): { enabled: boolean; prompt: string } {
    try {
      const raw = localStorage.getItem(CardDecisionService.STORAGE_KEY);
      if (!raw) return { enabled: false, prompt: '' };
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { enabled: false, prompt: '' };
      const value = parsed as { enabled?: unknown; prompt?: unknown };
      return {
        enabled: value.enabled === true,
        prompt: typeof value.prompt === 'string' ? value.prompt.trim().slice(0, 500) : '',
      };
    } catch {
      return { enabled: false, prompt: '' };
    }
  }

  rank$(query: string, candidates: readonly DecisionCandidate[]): Observable<DecisionScore[]> {
    if ((this.aiPreferences.preferences().provider !== 'local' && !this.preferences().enabled) || !query.trim() || candidates.length < 2) return of([]);
    const pool = candidates.slice(0, MAX_DECISION_CANDIDATES)
      .map(c => ({ cardId: c.cardId, text: c.text.slice(0, 1200) }));
    if (pool.some(c => !Number.isSafeInteger(c.cardId) || c.cardId <= 0 || !c.text.trim())) return of([]);
    return new Observable<unknown>(subscriber => {
      const id = ++this.nextId;
      clearTimeout(this.idleTimer);
      if (this.pending.size >= 2) { subscriber.next([]); subscriber.complete(); return; }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finished = false;
      this.pending.set(id, scores => { finished = true; subscriber.next(scores); subscriber.complete(); });
      try {
        if (!this.worker) {
          this.worker = this.createWorker();
          this.worker.onmessage = ({ data }: MessageEvent<DecisionResponse>) => {
            if (!this.pending.has(data.id)) return;
            if (data.kind === 'loading') { this.status.set('loading'); return; }
            this.pending.get(data.id)?.(data.kind === 'result' ? data.scores : []);
          };
          this.worker.onerror = () => this.stop();
          this.worker.onmessageerror = () => this.stop();
        }
        this.status.set('ranking');
        timer = setTimeout(() => this.stop(), 90_000);
        this.worker.postMessage({ kind: 'rank', id, query: query.slice(0, 1800), candidates: pool });
      } catch { this.stop(); }
      return () => {
        clearTimeout(timer);
        this.pending.delete(id);
        // A terminated worker is the only reliable way to cancel an ONNX computation.
        if (!finished) {
          if (this.pending.size === 0) { this.stop(); this.status.set('idle'); }
          else this.worker?.postMessage({ kind: 'cancel', id });
        }
        if (this.pending.size === 0) this.idleTimer = setTimeout(() => this.stop(), 60_000);
      };
    }).pipe(map(raw => {
      const ranked = blendDecisionRanking(pool, raw);
      this.status.set(ranked.length ? 'ready' : 'fallback');
      return ranked;
    }));
  }

  private stop(): void {
    clearTimeout(this.idleTimer);
    this.worker?.terminate();
    this.worker = null;
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach(finish => finish([]));
    clearTimeout(this.idleTimer);
  }
}
