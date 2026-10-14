import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { GeminiCoachService } from '../../services/gemini-coach.service';
import { GateCardFacts } from './deck-builder-gate.util';
import { CardDecisionService } from '../../services/decision/card-decision.service';
import { OpenRouterService } from '../../services/openrouter.service';
import { AiProviderPreferencesService } from '../../services/ai-provider-preferences.service';

export interface DeckBuilderSuggestion {
  cardId: number;
  reason: string;
}

const MAX_REASON_LENGTH = 300;

@Injectable({ providedIn: 'root' })
export class DeckBuilderAiService {
  private readonly gemini = inject(GeminiCoachService);
  private readonly decision = inject(CardDecisionService);
  private readonly openRouter = inject(OpenRouterService, { optional: true });
  private readonly aiPreferences = inject(AiProviderPreferencesService);

  /**
   * Ranks/explains within an ALREADY gate-filtered candidate pool — this service never
   * decides admissibility, only order and reasoning. Every returned suggestion is
   * validated against `candidates` before being handed back; a card id the model
   * mentions that isn't in the pool is silently dropped, never shown. Returns [] (not
   * an error) whenever Gemini is unavailable/unconfigured/fails — callers fall back to
   * the deterministic co-occurrence ranking. Opting into local decisions uses E5 only;
   * failures/abstentions in that mode never trigger a cloud request.
   */
  rank$(
    candidates: readonly GateCardFacts[],
    deckSummary: string,
    lang: 'it' | 'en',
  ): Observable<DeckBuilderSuggestion[]> {
    if (candidates.length === 0) {
      return of([]);
    }
    if (this.aiPreferences.preferences().provider === 'local' || this.decision.preferences().enabled) {
      const prompt = this.decision.preferences().prompt;
      const objective = prompt
        ? `${prompt}\nCurrent deck:\n${deckSummary}`
        : deckSummary;
      return this.decision.rank$(objective, candidates.map(c => ({
        cardId: c.id,
        text: `${c.name}. ${c.type}. ${c.archetype ?? ''}. ${c.desc ?? ''}`,
      }))).pipe(map(ranked => ranked.map(item => ({
        cardId: item.cardId,
        reason: lang === 'it'
          ? 'Affinità con l’obiettivo, combinata con le sinergie note (sperimentale).'
          : 'Objective relevance combined with known synergies (experimental).',
      }))));
    }
    const prompt = buildPrompt(candidates, deckSummary, lang);
    if (this.aiPreferences.preferences().provider === 'local') return of([]);
    const freeModel$ = this.openRouter?.ask$(prompt) ?? of('');
    return freeModel$.pipe(
      switchMap((raw) => {
        const parsed = parseAndValidateSuggestions(raw, candidates);
        if (parsed.length > 0) return of(parsed);
        if (this.aiPreferences.preferences().provider !== 'gemini') return of([]);
        return this.gemini.ask$(prompt).pipe(
          map((fallback) => parseAndValidateSuggestions(fallback, candidates)),
          catchError(() => of([])),
        );
      }),
      catchError(() => of([])),
    );
  }
  /**
   * Picks among a handful of options for ONE slot, reading each card's effect text. Unlike rank$, the cloud
   * prompt carries the effects and the reason the slot exists, so the answer can speak about costs, recursion
   * and fit with the deck. Same safety rules: only the given ids are accepted, [] when no provider answers.
   */
  rankWithEffects$(
    candidates: readonly GateCardFacts[],
    deckSummary: string,
    context: string,
    lang: 'it' | 'en',
  ): Observable<DeckBuilderSuggestion[]> {
    if (candidates.length === 0) {
      return of([]);
    }
    if (this.aiPreferences.preferences().provider === 'local' || this.decision.preferences().enabled) {
      const objective = `${context}\nCurrent deck:\n${deckSummary}`;
      return this.decision
        .rank$(
          objective,
          candidates.map((c) => ({ cardId: c.id, text: `${c.name}. ${c.type}. ${c.desc ?? ''}` })),
        )
        .pipe(
          map((ranked) =>
            ranked.map((item) => ({
              cardId: item.cardId,
              reason:
                lang === 'it'
                  ? 'Il modello locale la ritiene più affine alla situazione (sperimentale).'
                  : 'The local model finds it closest to the situation (experimental).',
            })),
          ),
        );
    }
    const prompt = buildEffectPrompt(candidates, deckSummary, context, lang);
    const freeModel$ = this.openRouter?.ask$(prompt) ?? of('');
    return freeModel$.pipe(
      switchMap((raw) => {
        const parsed = parseAndValidateSuggestions(raw, candidates);
        if (parsed.length > 0) return of(parsed);
        if (this.aiPreferences.preferences().provider !== 'gemini') return of([]);
        return this.gemini.ask$(prompt).pipe(
          map((fallback) => parseAndValidateSuggestions(fallback, candidates)),
          catchError(() => of([])),
        );
      }),
      catchError(() => of([])),
    );
  }
}

const MAX_EFFECT_TEXT = 700;

/** Prompt that includes every option's effect text and the reason the choice exists. Exported for tests. */
export function buildEffectPrompt(
  candidates: readonly GateCardFacts[],
  deckSummary: string,
  context: string,
  lang: 'it' | 'en',
): string {
  const list = candidates
    .map((c) => `- id ${c.id}: ${c.name} (${c.type})\n  ${(c.desc ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_EFFECT_TEXT) || '(no effect text)'}`)
    .join('\n');
  if (lang === 'it') {
    return [
      'Sei un assistente esperto di Yu-Gi-Oh! che aiuta a completare un mazzo.',
      'Devi scegliere tra le carte candidate per UNO slot. Leggi il testo di ogni effetto, considera costi (come i Life Points), rischio di non poterla giocare, riciclo e sinergia con il mazzo.',
      'Ordina le candidate dalla più alla meno adatta e spiega in una frase, citando l\'effetto, perché.',
      'IMPORTANTE: puoi usare SOLO gli id elencati qui sotto. Non inventare carte.',
      'Rispondi SOLO con un array JSON nel formato esatto: [{"id": <id numerico>, "reason": "<motivo breve, una frase>"}, ...]',
      '',
      `SITUAZIONE:\n${context}`,
      '',
      `MAZZO ATTUALE:\n${deckSummary}`,
      '',
      `CARTE CANDIDATE (id ammessi):\n${list}`,
    ].join('\n');
  }
  return [
    'You are a Yu-Gi-Oh! expert helping to complete a deck.',
    'Choose among the candidate cards for ONE slot. Read each effect text and weigh costs (such as Life Points), the risk of being unable to play it, recursion and synergy with the deck.',
    'Rank the candidates from most to least suitable and explain in one sentence, citing the effect, why.',
    'IMPORTANT: you may only use the ids listed below. Never invent cards.',
    'Reply with ONLY a JSON array in exactly this shape: [{"id": <numeric id>, "reason": "<short one-sentence reason>"}, ...]',
    '',
    `SITUATION:\n${context}`,
    '',
    `CURRENT DECK:\n${deckSummary}`,
    '',
    `CANDIDATE CARDS (admissible ids):\n${list}`,
  ].join('\n');
}

function buildPrompt(
  candidates: readonly GateCardFacts[],
  deckSummary: string,
  lang: 'it' | 'en',
): string {
  const list = candidates
    .map((c) => `- id ${c.id}: ${c.name} (${c.type}${c.archetype ? `, archetype: ${c.archetype}` : ''})`)
    .join('\n');
  if (lang === 'it') {
    return [
      'Sei un assistente per il completamento di un mazzo Yu-Gi-Oh!.',
      'Ordina le carte candidate qui sotto dalla più alla meno consigliata per completare il mazzo, e spiega brevemente perché.',
      'IMPORTANTE: puoi usare SOLO gli id elencati qui sotto. Non inventare carte, non usare id diversi da questi.',
      'Rispondi SOLO con un array JSON, nessun testo fuori dal JSON, in questo formato esatto:',
      '[{"id": <id numerico>, "reason": "<motivo breve, una frase>"}, ...]',
      '',
      `MAZZO ATTUALE:\n${deckSummary}`,
      '',
      `CARTE CANDIDATE (id ammessi):\n${list}`,
    ].join('\n');
  }
  return [
    'You are a Yu-Gi-Oh! deck-completion assistant.',
    'Rank the candidate cards below from most to least recommended to complete the deck, with a brief reason each.',
    'IMPORTANT: you may only use the ids listed below. Never invent cards or use ids not in this list.',
    'Reply with ONLY a JSON array, no text outside the JSON, in exactly this shape:',
    '[{"id": <numeric id>, "reason": "<short one-sentence reason>"}, ...]',
    '',
    `CURRENT DECK:\n${deckSummary}`,
    '',
    `CANDIDATE CARDS (admissible ids):\n${list}`,
  ].join('\n');
}

/** Exported for direct unit testing — the safety-critical half of this service (the
 *  actual model call is not deterministic and is never asserted on in tests). */
export function parseAndValidateSuggestions(
  raw: string,
  candidates: readonly GateCardFacts[],
): DeckBuilderSuggestion[] {
  const validIds = new Set(candidates.map((c) => c.id));
  const jsonText = extractJsonArray(raw);
  if (!jsonText) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const out: DeckBuilderSuggestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = Number((item as { id?: unknown }).id);
    if (!Number.isFinite(id) || !validIds.has(id)) {
      continue;
    }
    const reasonRaw = (item as { reason?: unknown }).reason;
    if (typeof reasonRaw !== 'string') {
      continue;
    }
    out.push({ cardId: id, reason: reasonRaw.slice(0, MAX_REASON_LENGTH) });
  }
  return out;
}

function extractJsonArray(raw: string): string | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return raw.slice(start, end + 1);
}
