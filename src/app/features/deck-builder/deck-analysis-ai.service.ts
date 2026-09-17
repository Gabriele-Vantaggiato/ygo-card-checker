import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { GeminiCoachService } from '../../services/gemini-coach.service';
import { GateCardFacts } from './deck-builder-gate.util';
import { DECK_ROLE_CATEGORIES, DeckRoleAnalysis, DeckRoleCategoryId } from './deck-analysis.model';

export interface DeckAnalysisCard {
  cardId: number;
  name: string;
  desc: string;
}

const VALID_CATEGORY_IDS = new Set<string>(DECK_ROLE_CATEGORIES.map((c) => c.id));
const LABEL_BY_ID = new Map<string, string>(DECK_ROLE_CATEGORIES.map((c) => [c.id, c.labelKey]));
const MAX_REASON_LENGTH = 300;

@Injectable({ providedIn: 'root' })
export class DeckAnalysisAiService {
  private readonly gemini = inject(GeminiCoachService);

  /**
   * Classifies the deck's OWN cards into fixed functional roles (starters, extenders,
   * hand traps, GY recursion, removal/control, searchers) and, for thin/empty roles,
   * proposes fills FROM THE ALREADY-GATED admissible pool only — same validation
   * discipline as DeckBuilderAiService: every suggested id is checked against the pool
   * before use, every cardsInDeck id is checked against the actual deck. Returns []
   * (never throws) when Gemini is unavailable/unconfigured/fails.
   */
  analyze$(
    deckCards: readonly DeckAnalysisCard[],
    candidatePool: readonly GateCardFacts[],
    lang: 'it' | 'en',
  ): Observable<DeckRoleAnalysis[]> {
    if (deckCards.length === 0) {
      return of([]);
    }
    const prompt = buildPrompt(deckCards, candidatePool, lang);
    return this.gemini.ask$(prompt).pipe(
      map((raw) => parseAndValidateAnalysis(raw, deckCards, candidatePool)),
      catchError(() => of([])),
    );
  }
}

function buildPrompt(
  deckCards: readonly DeckAnalysisCard[],
  candidatePool: readonly GateCardFacts[],
  lang: 'it' | 'en',
): string {
  const categoryList = DECK_ROLE_CATEGORIES.map((c) => `- ${c.id}`).join('\n');
  const deckList = deckCards.map((c) => `- id ${c.cardId}: ${c.name} — "${c.desc}"`).join('\n');
  const poolList = candidatePool
    .map((c) => `- id ${c.id}: ${c.name} (${c.type}${c.archetype ? `, archetype: ${c.archetype}` : ''})`)
    .join('\n');

  if (lang === 'it') {
    return [
      'Sei un assistente per l\'analisi di un mazzo Yu-Gi-Oh! esistente.',
      'Per ognuna di queste categorie funzionali FISSE (usa SOLO questi id, non inventarne altri):',
      categoryList,
      '',
      'Analizza le carte del mazzo qui sotto e indica quali carte del mazzo appartengono a ciascuna categoria (anche zero).',
      'Se una categoria ha poche o zero carte nel mazzo, proponi 1-3 carte per colmare il vuoto, SOLO scegliendo tra gli id ammessi elencati sotto CARTE CANDIDATE.',
      'IMPORTANTE: gli id delle carte del mazzo devono venire SOLO dalla lista MAZZO qui sotto; gli id suggeriti devono venire SOLO dalla lista CARTE CANDIDATE. Non inventare id.',
      'Rispondi SOLO con un oggetto JSON, nessun testo fuori dal JSON, in questo formato esatto:',
      '{"categories": [{"id": "<id categoria>", "cardsInDeck": [<id numerici dal mazzo>], "suggestions": [{"id": <id numerico dalle candidate>, "reason": "<motivo breve>"}]}]}',
      '',
      `MAZZO:\n${deckList}`,
      '',
      `CARTE CANDIDATE (id ammessi per i suggerimenti):\n${poolList}`,
    ].join('\n');
  }
  return [
    'You are an assistant analyzing an existing Yu-Gi-Oh! deck.',
    'For each of these FIXED functional categories (use ONLY these ids, never invent others):',
    categoryList,
    '',
    'Analyze the deck cards below and indicate which deck cards belong to each category (possibly zero).',
    'If a category has few or zero deck cards, suggest 1-3 cards to fill the gap, ONLY from the CANDIDATE CARDS ids listed below.',
    'IMPORTANT: deck card ids must come ONLY from the DECK list below; suggested ids must come ONLY from the CANDIDATE CARDS list. Never invent ids.',
    'Reply with ONLY a JSON object, no text outside the JSON, in exactly this shape:',
    '{"categories": [{"id": "<category id>", "cardsInDeck": [<numeric ids from the deck>], "suggestions": [{"id": <numeric id from candidates>, "reason": "<short reason>"}]}]}',
    '',
    `DECK:\n${deckList}`,
    '',
    `CANDIDATE CARDS (admissible ids for suggestions):\n${poolList}`,
  ].join('\n');
}

export function parseAndValidateAnalysis(
  raw: string,
  deckCards: readonly DeckAnalysisCard[],
  candidatePool: readonly GateCardFacts[],
): DeckRoleAnalysis[] {
  const deckById = new Map(deckCards.map((c) => [c.cardId, c]));
  const poolById = new Map(candidatePool.map((c) => [c.id, c]));

  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { categories?: unknown }).categories)) {
    return [];
  }

  const out: DeckRoleAnalysis[] = [];
  for (const item of (parsed as { categories: unknown[] }).categories) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string' || !VALID_CATEGORY_IDS.has(id)) {
      continue;
    }

    const cardsInDeckRaw = (item as { cardsInDeck?: unknown }).cardsInDeck;
    const cardsInDeck = Array.isArray(cardsInDeckRaw)
      ? cardsInDeckRaw
          .map((v) => deckById.get(Number(v)))
          .filter((c): c is DeckAnalysisCard => !!c)
          .map((c) => ({ cardId: c.cardId, name: c.name }))
      : [];

    const suggestionsRaw = (item as { suggestions?: unknown }).suggestions;
    const suggestions = Array.isArray(suggestionsRaw)
      ? suggestionsRaw
          .map((s) => {
            if (!s || typeof s !== 'object') {
              return null;
            }
            const cardId = Number((s as { id?: unknown }).id);
            const facts = poolById.get(cardId);
            if (!facts) {
              return null;
            }
            const reasonRaw = (s as { reason?: unknown }).reason;
            if (typeof reasonRaw !== 'string') {
              return null;
            }
            return {
              cardId,
              name: facts.name,
              imageUrlSmall: `https://images.ygoprodeck.com/images/cards_small/${facts.id}.jpg`,
              reason: reasonRaw.slice(0, MAX_REASON_LENGTH),
            };
          })
          .filter((s): s is NonNullable<typeof s> => !!s)
      : [];

    out.push({
      id: id as DeckRoleCategoryId,
      labelKey: LABEL_BY_ID.get(id) ?? 'deckBuilder.role.unknown',
      cardsInDeck,
      suggestions,
    });
  }
  return out;
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return raw.slice(start, end + 1);
}
