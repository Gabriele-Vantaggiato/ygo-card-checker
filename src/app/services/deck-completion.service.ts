import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { ComboIndex, ComboLine } from '../models/card-combo.model';
import { CardKnowledgeEntry, CardRelatedSuggestion } from '../models/card-knowledge.model';
import {
  DeckCompletionAdd,
  DeckCompletionOptions,
  DeckCompletionPlan,
  DeckCompletionStatus,
} from '../models/deck-completion.model';
import { Decklist, AddToDecklistPayload } from '../models/decklist.model';
import { YgoFormat } from '../models/ygo-format.model';
import { YgoCard } from '../models/ygo-card.model';
import { sectionCardCount, splitDeckSections } from '../utils/deck-card.utils';
import {
  CompletionRagResult,
  CompletionScoringProfile,
  scoreForCompletion,
} from '../utils/completion-prompt.utils';
import { isExtraDeckType, resolveDeckSection } from './ydke.service';
import { CardKnowledgeService } from './card-knowledge.service';
import { CardLegalityFacade } from './card-legality.facade';
import { YgoApiService } from './ygo-api.service';
import { CompletionRagService } from './completion-rag.service';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { DeckStrategyStore } from '../features/decklist/stores/deck-strategy.store';

const DEFAULT_TARGET_MAIN = 40;
const MIN_TARGET_MAIN = 40;
const MAX_TARGET_MAIN = 60;
const TARGET_EXTRA = 15;
const DEFAULT_TARGET_SIDE = 15;
const SUGGESTION_POOL = 96;
const MAX_COMPLETION_API_CARDS = 80;

@Injectable({ providedIn: 'root' })
export class DeckCompletionService {
  private readonly knowledge = inject(CardKnowledgeService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly completionRag = inject(CompletionRagService);
  private readonly strategy = inject(DeckStrategyStore);
  private readonly indexService = inject(CardKnowledgeIndexService);

  private readonly comboIndex$ = this.indexService.combos$;

  defaultOptions(): DeckCompletionOptions {
    return {
      targetMain: DEFAULT_TARGET_MAIN,
      includeSide: true,
      targetSide: DEFAULT_TARGET_SIDE,
      direction: this.strategy.direction(),
      prompt: this.strategy.prompt(),
      useOllama: this.strategy.useOllama(),
    };
  }

  normalizeTargetMain(value: number): number {
    return Math.min(MAX_TARGET_MAIN, Math.max(MIN_TARGET_MAIN, Math.round(value)));
  }

  defaultTargetMain(): number {
    return DEFAULT_TARGET_MAIN;
  }

  plan$(deck: Decklist, format: YgoFormat, options?: Partial<DeckCompletionOptions>): Observable<DeckCompletionPlan> {
    const resolved = { ...this.defaultOptions(), ...options };
    const normalizedTarget = this.normalizeTargetMain(resolved.targetMain);

    const sections = splitDeckSections(deck.cards);
    const currentMain = sectionCardCount(sections.main);
    const currentExtra = sectionCardCount(sections.extra);
    const currentSide = sectionCardCount(sections.side);
    const mainGap = normalizedTarget - currentMain;
    const extraGap = TARGET_EXTRA - currentExtra;
    const sideGap = resolved.includeSide ? resolved.targetSide - currentSide : 0;

    return this.strategy.ragResult$.pipe(
      take(1),
      switchMap((rag) => {
        const profile = rag.profile;
        const promptSummary = rag.summary;

        if (mainGap <= 0 && extraGap <= 0 && sideGap <= 0) {
          return of(
            this.emptyPlan(
              'already_complete',
              normalizedTarget,
              currentMain,
              mainGap,
              currentExtra,
              extraGap,
              resolved,
              currentSide,
              sideGap,
              promptSummary,
              rag,
            ),
          );
        }

        const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
        if (uniqueCards.length === 0) {
          return of(
            this.emptyPlan(
              'empty_deck',
              normalizedTarget,
              currentMain,
              mainGap,
              currentExtra,
              extraGap,
              resolved,
              currentSide,
              sideGap,
              promptSummary,
              rag,
            ),
          );
        }

        const deckCardIds = new Set(deck.cards.map((card) => card.id));

        return combineLatest([
          this.knowledge.rankDeckSuggestions$(deck, format, SUGGESTION_POOL, { forCompletion: true }),
          sideGap > 0 ? this.knowledge.rankSideStapleSuggestions$(deck, format) : of([]),
          this.knowledge.knowledgeIndex$(),
          this.comboIndex$,
        ]).pipe(
          switchMap(([suggestions, sideStaples, index, comboIndex]) => {
            const matchupSuggestions = this.completionRag.toMatchupSuggestions(index, profile, deckCardIds);
            const merged = this.mergeSuggestions(suggestions, sideStaples, matchupSuggestions);
            if (merged.length === 0) {
              return of(
                this.emptyPlan(
                  'no_candidates',
                  normalizedTarget,
                  currentMain,
                  mainGap,
                  currentExtra,
                  extraGap,
                  resolved,
                  currentSide,
                  sideGap,
                  promptSummary,
                  rag,
                ),
              );
            }

            const ids = [...new Set(merged.map((item) => item.cardId))].slice(0, MAX_COMPLETION_API_CARDS);
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
                      currentSide,
                      sideGap,
                      resolved,
                      profile,
                      promptSummary,
                      rag,
                      this.rescoreSuggestions(merged, index?.entries ?? {}, profile),
                      index?.entries ?? {},
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
      }),
    );
  }

  private mergeSuggestions(
    primary: CardRelatedSuggestion[],
    sideStaples: CardRelatedSuggestion[],
    matchupSuggestions: CardRelatedSuggestion[] = [],
  ): CardRelatedSuggestion[] {
    const merged = new Map<number, CardRelatedSuggestion>();
    for (const item of [...primary, ...sideStaples, ...matchupSuggestions]) {
      const existing = merged.get(item.cardId);
      if (!existing || item.score > existing.score) {
        merged.set(item.cardId, item);
      }
    }
    return [...merged.values()];
  }

  private rescoreSuggestions(
    suggestions: CardRelatedSuggestion[],
    entries: Record<string, CardKnowledgeEntry>,
    profile: CompletionScoringProfile,
  ): CardRelatedSuggestion[] {
    return suggestions
      .map((suggestion) => ({
        ...suggestion,
        score: scoreForCompletion(
          suggestion,
          entries[String(suggestion.cardId)],
          profile,
          'main',
        ),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  private buildPlan(
    deck: Decklist,
    targetMain: number,
    currentMain: number,
    mainGap: number,
    currentExtra: number,
    extraGap: number,
    currentSide: number,
    sideGap: number,
    options: DeckCompletionOptions,
    profile: CompletionScoringProfile,
    promptSummary: string | null,
    rag: CompletionRagResult,
    suggestions: CardRelatedSuggestion[],
    entries: Record<string, CardKnowledgeEntry>,
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
        profile,
        entries,
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
        profile,
        entries,
      );
    }

    if (sideGap > 0) {
      const sideRanked = [...suggestions]
        .map((suggestion) => ({
          ...suggestion,
          score: scoreForCompletion(
            suggestion,
            entries[String(suggestion.cardId)],
            profile,
            'side',
          ),
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

      this.fillSection(
        deck,
        sideRanked,
        cardById,
        legality,
        plannedQty,
        adds,
        'side',
        sideGap,
        profile,
        entries,
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
      targetSide: options.includeSide ? options.targetSide : 0,
      currentSide,
      sideGap,
      direction: options.direction,
      promptSummary,
      ragSources: rag.sources,
      ollamaUsed: rag.ollamaUsed,
      matchupKeys: profile.matchupKeys,
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
    section: 'main' | 'extra' | 'side',
    gap: number,
    profile: CompletionScoringProfile,
    entries: Record<string, CardKnowledgeEntry>,
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
      if (section === 'extra') {
        if (!isExtra) {
          continue;
        }
      } else if (isExtra) {
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

      const existing = adds.find((add) => add.cardId === card.id && add.section === section);
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
          score: scoreForCompletion(
            suggestion,
            entries[String(suggestion.cardId)],
            profile,
            section,
          ),
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
    options: DeckCompletionOptions,
    currentSide: number,
    sideGap: number,
    promptSummary: string | null,
    rag: CompletionRagResult,
  ): DeckCompletionPlan {
    return {
      status,
      targetMain,
      currentMain,
      gap: mainGap,
      currentExtra,
      extraGap,
      targetSide: options.includeSide ? options.targetSide : 0,
      currentSide,
      sideGap,
      direction: options.direction,
      promptSummary,
      ragSources: rag.sources,
      ollamaUsed: rag.ollamaUsed,
      matchupKeys: rag.profile.matchupKeys,
      adds: [],
      comboLines: [],
      payloads: [],
    };
  }
}
