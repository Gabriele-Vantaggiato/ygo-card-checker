import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { MatchupCatalogEntry } from '../models/card-knowledge.model';
import { DeckCompletionDirection } from '../utils/completion-prompt.utils';
import type { OllamaCompletionIntent } from './ollama.service';
import { AiProviderPreferencesService } from './ai-provider-preferences.service';

export interface OpenRouterResponse {
  text?: unknown;
  model?: unknown;
}

const OPENROUTER_TIMEOUT_MS = 30_000;

/** Calls the Vercel relay. No provider key is ever bundled into the SPA. */
@Injectable({ providedIn: 'root' })
export class OpenRouterService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly preferences = inject(AiProviderPreferencesService);

  ask$(prompt: string): Observable<string> {
    const trimmed = prompt.trim();
    const settings = this.preferences.preferences();
    if (!trimmed || !this.http || settings.provider !== 'openrouter' || !settings.openRouterApiKey) return of('');
    return this.http.post<OpenRouterResponse>('/api/openrouter', {
      prompt: trimmed.slice(0, 12000),
      model: settings.openRouterModel,
    }, { headers: { 'X-OpenRouter-Key': settings.openRouterApiKey } }).pipe(
      timeout(OPENROUTER_TIMEOUT_MS),
      map((response) => typeof response.text === 'string' ? response.text : ''),
      catchError(() => of('')),
    );
  }

  parseCompletionIntent$(prompt: string, direction: DeckCompletionDirection, catalog: readonly MatchupCatalogEntry[]): Observable<OllamaCompletionIntent | null> {
    const trimmed = prompt.trim();
    if (trimmed.length < 8) return of(null);
    const request = ['You are a Yu-Gi-Oh TCG deck-building assistant.', 'Return ONLY valid JSON with keys matchups, tags, keywords, sections, comboFocus.', `Allowed matchup keys: ${catalog.map((entry) => entry.key).join(', ') || '(none)'}.`, 'Allowed tags: hand_trap, negates, destroys, banishes, bounce_to_hand, draw, mills, gy_interaction, special_summons, searches_deck.', 'sections must be a subset of main, extra, side.', `Direction: ${direction}. User notes: ${trimmed}`].join(' ');
    return this.ask$(request).pipe(map((raw) => parseIntent(raw)));
  }
}

function parseIntent(raw: string): OllamaCompletionIntent | null {
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<OllamaCompletionIntent>;
    return { matchups: Array.isArray(parsed.matchups) ? parsed.matchups.map(String) : [], tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [], keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [], sections: Array.isArray(parsed.sections) ? parsed.sections.filter((s): s is 'main' | 'extra' | 'side' => s === 'main' || s === 'extra' || s === 'side') : [], comboFocus: Boolean(parsed.comboFocus) };
  } catch { return null; }
}
