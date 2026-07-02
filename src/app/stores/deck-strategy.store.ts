import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, debounceTime, shareReplay, switchMap, catchError, of as rxOf } from 'rxjs';
import {
  DeckCompletionDirection,
  CompletionRagResult,
  buildCompletionProfile,
  profileSummary,
} from '../utils/completion-prompt.utils';
import { CompletionRagService } from '../services/completion-rag.service';
import { OllamaService } from '../services/ollama.service';

const STORAGE_DIRECTION = 'ygo-strategy-direction';
const STORAGE_PROMPT = 'ygo-strategy-prompt';
const STORAGE_USE_OLLAMA = 'ygo-strategy-use-ollama';

@Injectable({ providedIn: 'root' })
export class DeckStrategyStore {
  private readonly rag = inject(CompletionRagService);
  private readonly ollama = inject(OllamaService);

  readonly direction = signal<DeckCompletionDirection>(this.readDirection());
  readonly prompt = signal(this.readPrompt());
  readonly useOllama = signal(this.readUseOllama());
  readonly ollamaAvailable = signal<boolean | null>(null);

  readonly ragResult$: Observable<CompletionRagResult>;

  constructor() {
    this.ragResult$ = combineLatest([
      toObservable(this.direction),
      toObservable(this.prompt),
      toObservable(this.useOllama),
    ]).pipe(
      debounceTime(280),
      switchMap(([direction, prompt, useOllama]) =>
        this.rag.buildProfile$(direction, prompt, useOllama).pipe(
          catchError(() => {
            const profile = buildCompletionProfile(direction, prompt);
            return rxOf({
              profile,
              summary: profileSummary(profile),
              sources: ['rules'] as CompletionRagResult['sources'],
              ollamaUsed: false,
            });
          }),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.ollama.isAvailable$().subscribe((online) => this.ollamaAvailable.set(online));
  }

  setDirection(direction: DeckCompletionDirection): void {
    this.direction.set(direction);
    localStorage.setItem(STORAGE_DIRECTION, direction);
  }

  setPrompt(prompt: string): void {
    this.prompt.set(prompt);
    localStorage.setItem(STORAGE_PROMPT, prompt);
  }

  setUseOllama(enabled: boolean): void {
    this.useOllama.set(enabled);
    localStorage.setItem(STORAGE_USE_OLLAMA, enabled ? '1' : '0');
  }

  refreshOllamaStatus(): void {
    this.ollama.isAvailable$().subscribe((online) => this.ollamaAvailable.set(online));
  }

  private readDirection(): DeckCompletionDirection {
    const stored = localStorage.getItem(STORAGE_DIRECTION);
    if (
      stored === 'combo' ||
      stored === 'staples' ||
      stored === 'side_meta' ||
      stored === 'archetype'
    ) {
      return stored;
    }
    return 'archetype';
  }

  private readPrompt(): string {
    return localStorage.getItem(STORAGE_PROMPT) ?? '';
  }

  private readUseOllama(): boolean {
    const stored = localStorage.getItem(STORAGE_USE_OLLAMA);
    return stored !== '0';
  }
}
