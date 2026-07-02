import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { MatchupCatalogEntry } from '../models/card-knowledge.model';
import { DeckCompletionDirection } from '../utils/completion-prompt.utils';

export interface OllamaCompletionIntent {
  matchups: string[];
  tags: string[];
  keywords: string[];
  sections: Array<'main' | 'extra' | 'side'>;
  comboFocus: boolean;
}

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'llama3.2:1b';
const OLLAMA_TIMEOUT_MS = 12_000;

@Injectable({ providedIn: 'root' })
export class OllamaService {
  private readonly http = inject(HttpClient);

  readonly baseUrl = OLLAMA_BASE_URL;
  readonly model = OLLAMA_MODEL;

  isAvailable$(): Observable<boolean> {
    return this.http.get<{ models: Array<{ name: string }> }>(`${OLLAMA_BASE_URL}/api/tags`).pipe(
      timeout(OLLAMA_TIMEOUT_MS),
      map(() => true),
      catchError(() => of(false)),
    );
  }

  parseCompletionIntent$(
    prompt: string,
    direction: DeckCompletionDirection,
    catalog: readonly MatchupCatalogEntry[],
  ): Observable<OllamaCompletionIntent | null> {
    const trimmed = prompt.trim();
    if (trimmed.length < 8) {
      return of(null);
    }

    const matchupKeys = catalog.map((entry) => entry.key).join(', ');
    const system = [
      'You are a Yu-Gi-Oh TCG deck-building assistant.',
      'Return ONLY valid JSON with this shape:',
      '{"matchups":["artifact"],"tags":["destroys","hand_trap"],"keywords":["ash blossom"],"sections":["side"],"comboFocus":false}',
      `Allowed matchup keys: ${matchupKeys}`,
      'Allowed tags: hand_trap, negates, destroys, banishes, bounce_to_hand, draw, mills, gy_interaction, special_summons, searches_deck',
      'sections must be subset of: main, extra, side',
      'comboFocus true only when user wants more combos/extenders.',
    ].join(' ');

    return this.http
      .post<{ response: string }>(`${OLLAMA_BASE_URL}/api/generate`, {
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        prompt: `${system}\nDirection: ${direction}\nUser notes: ${trimmed}`,
      })
      .pipe(
        timeout(OLLAMA_TIMEOUT_MS),
        map((payload) => this.parseIntent(payload.response)),
        catchError(() => of(null)),
      );
  }

  private parseIntent(raw: string): OllamaCompletionIntent | null {
    try {
      const parsed = JSON.parse(raw) as Partial<OllamaCompletionIntent>;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      return {
        matchups: Array.isArray(parsed.matchups) ? parsed.matchups.map(String) : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
        sections: Array.isArray(parsed.sections)
          ? parsed.sections.filter(
              (section): section is 'main' | 'extra' | 'side' =>
                section === 'main' || section === 'extra' || section === 'side',
            )
          : [],
        comboFocus: Boolean(parsed.comboFocus),
      };
    } catch {
      return null;
    }
  }
}
