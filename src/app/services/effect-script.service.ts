import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, tap } from 'rxjs';
import {
  EffectRole,
  EffectScript,
  EffectScriptIndex,
  emptyEffectScriptIndex,
} from '../models/effect-script.model';

const SCRIPTS_URL = '/assets/data/effect-scripts/scripts.json';
const HAT_FALLBACK_URL = '/assets/data/effect-scripts/hat-2014.json';

@Injectable({ providedIn: 'root' })
export class EffectScriptService {
  private readonly http = inject(HttpClient);

  private readonly indexSignal = signal<EffectScriptIndex>(emptyEffectScriptIndex());
  private load$: Observable<EffectScriptIndex> | null = null;

  readonly scripts = computed(() => this.indexSignal().scripts);

  ensureLoaded$(): Observable<EffectScriptIndex> {
    if (!this.load$) {
      this.load$ = this.http.get<EffectScriptIndex>(SCRIPTS_URL).pipe(
        catchError(() => this.loadHatFallback$()),
        tap((index) => this.indexSignal.set(index)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.load$;
  }

  getScript(cardId: number): EffectScript | undefined {
    return this.indexSignal().scripts[String(cardId)];
  }

  getRoles(cardId: number): EffectRole[] {
    return this.getScript(cardId)?.roles ?? [];
  }

  isStarter(cardId: number): boolean {
    return this.getRoles(cardId).includes('starter');
  }

  private loadHatFallback$(): Observable<EffectScriptIndex> {
    return this.http.get<EffectScript[]>(HAT_FALLBACK_URL).pipe(
      map((hatScripts) => this.indexFromHat(hatScripts)),
      catchError(() => of(emptyEffectScriptIndex())),
    );
  }

  private indexFromHat(hatScripts: EffectScript[]): EffectScriptIndex {
    const scripts: Record<string, EffectScript> = {};
    for (const script of hatScripts) {
      scripts[String(script.cardId)] = script;
    }
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      cardCount: hatScripts.length,
      scripts,
    };
  }
}
