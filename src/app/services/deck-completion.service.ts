import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { ComboIndex, ComboLine } from '../models/card-combo.model';
import { CardRelatedSuggestion } from '../models/card-knowledge.model';
import {
  DeckCompletionAdd,
  DeckCompletionPlan,
  DeckCompletionStatus,
} from '../models/deck-completion.model';
import { Decklist, AddToDecklistPayload } from '../models/decklist.model';
import { YgoFormat } from '../models/ygo-format.model';
import { YgoCard } from '../models/ygo-card.model';
import { sectionCardCount, splitDeckSections } from '../utils/deck-card.utils';
import { isExtraDeckType, resolveDeckSection } from './ydke.service';
import { CardKnowledgeService } from './card-knowledge.service';
import { CardLegalityFacade } from './card-legality.facade';
import { YgoApiService } from './ygo-api.service';

const DEFAULT_TARGET_MAIN = 40;
const MIN_TARGET_MAIN = 40;
const MAX_TARGET_MAIN = 60;
const TARGET_EXTRA = 15;
const SUGGESTION_POOL = 512;
const COMBO_INDEX_URL = 'assets/data/card-knowledge/combos.json';

@Injectable({ providedIn: 'root' })
export class DeckCompletionService {
  private readonly knowledge = inject(CardKnowledgeService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly http = inject(HttpClient);

  private readonly comboIndex$ = this.http.get<ComboIndex>(COMBO_INDEX_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  normalizeTargetMain(value: number): number {
    return Math.min(MAX_TARGET_MAIN, Math.max(MIN_TARGET_MAIN, Math.round(value)));
  }

  defaultTargetMain(): number {
    return DEFAULT_TARGET_MAIN;
  }

  plan$(deck: Decklist, format: YgoFormat, targetMain = DEFAULT_TARGET_MAIN): Observable<DeckCompletionPlan> {
    const normalizedTarget = this.normalizeTargetMain(targetMain);
    const sections = splitDeckSections(deck.cards);
    const currentMain = sectionCardCount(sections.main);
    const currentExtra = sectionCardCount(sections.extra);
    const mainGap = normalizedTarget - currentMain;
    const extraGap = TARGET_EXTRA - currentExtra;

    if (mainGap <= 0 && extraGap <= 0) {
      return of(this.emptyPlan('already_complete', normalizedTarget, currentMain, mainGap, currentExtra, extraGap));
    }

    const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
    if (uniqueCards.length === 0) {
      return of(this.emptyPlan('empty_deck', normalizedTarget, currentMain, mainGap, currentExtra, extraGap));
    }

    return combineLatest([
      this.knowledge.rankDeckSuggestions$(deck, format, SUGGESTION_POOL, { forCompletion: true }),
      this.comboIndex$,
    ]).pipe(
      switchMap(([suggestions, comboIndex]) => {
        if (suggestions.length === 0) {
          return of(this.emptyPlan('no_candidates', normalizedTarget, currentMain, mainGap, currentExtra, extraGap));
        }

        const ids = [...new Set(suggestions.map((item) => item.cardId))];
        return this.ygoApi.getCardsByIds$(ids, 'en').pipe(
          switchMap((cards) =>
            this.cardLegality.evaluateMany$(cards, format).pipe(
              map((legality) =>
                this.buildPlan(
                  deck,
                  normalizedTarget,
                  currentMain,
                  mainGap,
                  currentExtra,
                  extraGap,
                  suggestions,
                  cards,
                  legality,
                  comboIndex,
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  private buildPlan(
    deck: Decklist,
    targetMain: number,
    currentMain: number,
    mainGap: number,
    currentExtra: number,
    extraGap: number,
    suggestions: CardRelatedSuggestion[],
    cards: YgoCard[],
    legality: Map<number, import('../models/ygo-card.model').LegalityResult>,
    comboIndex: ComboIndex | null,
  ): DeckCompletionPlan {
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const plannedQty = new Map<number, number>();
    const adds: DeckCompletionAdd[] = [];

    if (mainGap > 0) {
      this.fillSection(
        deck,
        suggestions,
        cardById,
        legality,
        plannedQty,
        adds,
        'main',
        mainGap,
      );
    }

    if (extraGap > 0) {
      this.fillSection(
        deck,
        suggestions,
        cardById,
        legality,
        plannedQty,
        adds,
        'extra',
        extraGap,
      );
    }

    const comboLines = this.pickComboLines(deck, comboIndex, plannedQty);
    const payloads = this.toPayloads(adds, legality);

    return {
      status: adds.length > 0 ? 'ready' : 'no_candidates',
      targetMain,
      currentMain,
      gap: mainGap,
      currentExtra,
      extraGap,
      adds,
      comboLines,
      payloads,
    };
  }

  private fillSection(
    deck: Decklist,
    suggestions: CardRelatedSuggestion[],
    cardById: Map<number, YgoCard>,
    legality: Map<number, import('../models/ygo-card.model').LegalityResult>,
    plannedQty: Map<number, number>,
    adds: DeckCompletionAdd[],
    section: 'main' | 'extra',
    gap: number,
  ): void {
    let remaining = gap;

    for (const suggestion of suggestions) {
      if (remaining <= 0) {
        break;
      }

      const card = cardById.get(suggestion.cardId);
      if (!card) {
        continue;
      }

      const verdict = legality.get(card.id)?.verdict;
      if (verdict !== 'legal' && verdict !== 'restricted') {
        continue;
      }

      const cardSection = resolveDeckSection({ type: card.type, section: undefined });
      const isExtra = cardSection === 'extra' || isExtraDeckType(card.type);
      if (section === 'main' ? isExtra : !isExtra) {
        continue;
      }

      const inDeck =
        deck.cards.find(
          (entry) => entry.id === card.id && resolveDeckSection(entry) === section,
        )?.quantity ?? 0;
      const already = plannedQty.get(card.id) ?? 0;
      const max = suggestion.maxCopies ?? 3;
      const room = Math.max(0, max - inDeck - already);
      const quantity = Math.min(room, remaining);
      if (quantity <= 0) {
        continue;
      }

      plannedQty.set(card.id, already + quantity);
      remaining -= quantity;

      const existing = adds.find((add) => add.cardId === card.id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        adds.push({
          cardId: card.id,
          name: card.name,
          quantity,
          type: card.type,
          imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
          reasonKey: suggestion.reasonKey,
          reasonParams: suggestion.reasonParams,
          score: suggestion.score,
          section,
        });
      }
    }
  }

  private pickComboLines(
    deck: Decklist,
    comboIndex: ComboIndex | null,
    plannedQty: ReadonlyMap<number, number>,
  ): ComboLine[] {
    if (!comboIndex) {
      return [];
    }

    const deckIds = new Set(deck.cards.map((card) => card.id));
    const plannedIds = new Set(plannedQty.keys());
    const lines: ComboLine[] = [];
    const seen = new Set<string>();

    for (const card of deck.cards) {
      const entry = comboIndex.entries[String(card.id)];
      if (!entry) {
        continue;
      }

      for (const line of entry.lines) {
        if (seen.has(line.id)) {
          continue;
        }

        const targetSteps = line.steps.filter((step) => step.role === 'target');
        if (targetSteps.length === 0) {
          continue;
        }

        const addsTarget = targetSteps.some((step) => plannedIds.has(step.cardId));
        if (!addsTarget) {
          continue;
        }

        const enablerSteps = line.steps.filter((step) => step.role === 'enabler');
        const enablersOk = enablerSteps.every((step) => deckIds.has(step.cardId));
        if (!enablersOk) {
          continue;
        }

        seen.add(line.id);
        lines.push(line);
        if (lines.length >= 6) {
          return lines;
        }
      }
    }

    return lines;
  }

  private toPayloads(
    adds: DeckCompletionAdd[],
    legality: Map<number, import('../models/ygo-card.model').LegalityResult>,
  ): AddToDecklistPayload[] {
    return adds.map((add) => {
      const result = legality.get(add.cardId);
      return {
        id: add.cardId,
        name: add.name,
        type: add.type,
        imageUrlSmall: add.imageUrlSmall,
        section: add.section ?? 'main',
        banlistStatus: result?.banlistStatus ?? null,
        legalityVerdict: result?.verdict ?? null,
      };
    });
  }

  private emptyPlan(
    status: DeckCompletionStatus,
    targetMain: number,
    currentMain: number,
    mainGap: number,
    currentExtra: number,
    extraGap: number,
  ): DeckCompletionPlan {
    return {
      status,
      targetMain,
      currentMain,
      gap: mainGap,
      currentExtra,
      extraGap,
      adds: [],
      comboLines: [],
      payloads: [],
    };
  }
}
