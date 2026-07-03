import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  CardKnowledgeIndex,
  CardKnowledgeRelated,
  CardKnowledgeRosterMember,
  CardRelatedSuggestion,
  DeckRelatedResult,
} from '../../models/card-knowledge.model';
import { Decklist } from '../../models/decklist.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { relationGroupOrder, tagLabelKey } from '../../utils/knowledge-display.utils';
import { isPlayableInFormat, maxCopiesInFormat } from '../../utils/format-legality.utils';
import { buildMechanicSynergyRelated } from '../../utils/mechanic-synergy.utils';
import { CardLegalityFacade } from '../card-legality.facade';
import { CardKnowledgeIndexService } from '../card-knowledge-index.service';
import { CompletionRagService } from '../completion-rag.service';
import { I18nService } from '../i18n.service';
import { isExtraDeckType } from '../ydke.service';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import {
  RELATION_GROUP_KEYS,
  SIDE_STAPLE_TAGS,
} from '../../utils/knowledge-constants';
import { ComboIndex, ComboPartnerRecord } from '../../models/card-combo.model';
import {
  applyFormatToSuggestions,
  applyStrategyToSuggestions,
  filterSuggestions$,
  groupSuggestions,
  mergeSuggestionPools,
  toSuggestion,
} from './card-knowledge-shared';

const EMPTY_DECK_RESULT: DeckRelatedResult = {
  suggestions: [],
  groups: [],
  sourceCount: 0,
  available: false,
  formatId: null,
};

const MAX_DECK_SUGGESTIONS = 24;
const MAX_DECK_PER_RELATION = 6;
const COMPLETION_SUGGESTION_LIMIT = 96;
const MAX_ROSTER_PER_KEY = 20;
const MULTI_SOURCE_BOOST = 6;
const COMBO_TARGET_SCORE = 1.25;
const COMBO_READY_BOOST = 1.6;
const ARCHETYPE_ROSTER_SCORE = 0.42;
const SERIES_ROSTER_SCORE = 0.38;
const SIDE_STAPLE_POOL = 160;

export interface DeckSuggestionOptions {
  forCompletion?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DeckSuggestionService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly i18n = inject(I18nService);
  private readonly strategy = inject(DeckStrategyStore);
  private readonly completionRag = inject(CompletionRagService);

  private readonly index$ = this.indexService.related$;
  private readonly formatLegality$ = this.indexService.formatLegality$;
  private readonly comboIndex$ = this.indexService.combos$;

  findRelatedForDeck$(deck: Decklist, format: YgoFormat): Observable<DeckRelatedResult> {
    return combineLatest([this.index$, this.rankDeckSuggestions$(deck, format, MAX_DECK_SUGGESTIONS)]).pipe(
      map(([index, suggestions]) => {
        if (!index) {
          return { ...EMPTY_DECK_RESULT, formatId: format.id };
        }
        const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
        if (uniqueCards.length === 0) {
          return { ...EMPTY_DECK_RESULT, available: true, formatId: format.id };
        }
        if (suggestions.length === 0) {
          return {
            ...EMPTY_DECK_RESULT,
            available: true,
            sourceCount: uniqueCards.length,
            formatId: format.id,
          };
        }

        const diversified = this.diversifySuggestions(suggestions);
        return {
          suggestions: diversified,
          groups: groupSuggestions(diversified),
          sourceCount: uniqueCards.length,
          available: true,
          formatId: format.id,
        };
      }),
    );
  }

  rankDeckSuggestions$(
    deck: Decklist,
    format: YgoFormat,
    limit = 80,
    options?: DeckSuggestionOptions,
  ): Observable<CardRelatedSuggestion[]> {
    const forCompletion = options?.forCompletion ?? false;
    const effectiveLimit = forCompletion ? Math.max(limit, COMPLETION_SUGGESTION_LIMIT) : limit;

    return combineLatest([this.index$, this.formatLegality$, this.comboIndex$, this.strategy.ragResult$]).pipe(
      switchMap(([index, formatIndex, comboIndex, rag]) => {
        if (!index) {
          return of([]);
        }

        const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
        if (uniqueCards.length === 0) {
          return of([]);
        }

        const deckCardIds = new Set(deck.cards.map((card) => card.id));
        const ranked = this.aggregateDeckRanked(deck, index, comboIndex, forCompletion);
        if (ranked.length === 0) {
          return of([]);
        }

        const pool = ranked.slice(0, effectiveLimit);
        return filterSuggestions$(
          pool,
          format,
          formatIndex,
          (related) => this.toDeckSuggestion(related),
          this.cardLegality,
        ).pipe(
          map((suggestions) => {
            const matchup = applyFormatToSuggestions(
              this.completionRag.toMatchupSuggestions(index, rag.profile, deckCardIds),
              format,
              formatIndex,
            );
            const merged = mergeSuggestionPools(suggestions, matchup);
            const withQty = this.applySuggestedQuantities(
              applyStrategyToSuggestions(merged, index.entries, rag.profile, 'main'),
              deck,
            );
            return withQty
              .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
              .slice(0, effectiveLimit);
          }),
        );
      }),
    );
  }

  rankSideStapleSuggestions$(
    deck: Decklist,
    format: YgoFormat,
    limit = SIDE_STAPLE_POOL,
  ): Observable<CardRelatedSuggestion[]> {
    return combineLatest([this.index$, this.formatLegality$]).pipe(
      map(([index, formatIndex]) => {
        if (!index) {
          return [];
        }

        const deckIds = new Set(deck.cards.map((card) => card.id));
        const merged = new Map<number, CardRelatedSuggestion>();

        for (const tag of SIDE_STAPLE_TAGS) {
          const roster = index.mechanicIndex?.[tag] ?? [];
          for (const member of roster) {
            if (deckIds.has(member.id) || merged.has(member.id)) {
              continue;
            }
            if (formatIndex && !isPlayableInFormat(formatIndex, member.id, format.id)) {
              continue;
            }
            if (isExtraDeckType(member.type)) {
              continue;
            }

            merged.set(member.id, {
              cardId: member.id,
              name: member.name,
              relation: 'engine',
              score: 0.88,
              archetype: member.archetype,
              imageSmall: member.imageSmall,
              reasonKey: 'decklist.completion.reason.sideStaple',
              reasonParams: { tag: this.i18n.t(tagLabelKey(tag)) },
              maxCopies: formatIndex
                ? (maxCopiesInFormat(formatIndex, member.id, format.id) ?? undefined)
                : undefined,
            });
          }
        }

        return [...merged.values()]
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, limit);
      }),
    );
  }

  private aggregateDeckRanked(
    deck: Decklist,
    index: CardKnowledgeIndex,
    comboIndex: ComboIndex | null,
    forCompletion = false,
  ): Array<CardKnowledgeRelated & { sourceName: string; sources: number }> {
    const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
    const deckCardIds = new Set(uniqueCards.map((card) => card.id));
    const aggregated = new Map<
      number,
      {
        related: CardKnowledgeRelated;
        score: number;
        sources: number;
        sourceName: string;
        comboReady: boolean;
      }
    >();

    const upsert = (
      related: CardKnowledgeRelated,
      sourceName: string,
      score: number,
      comboReady = false,
    ): void => {
      const existing = aggregated.get(related.id);
      if (existing) {
        existing.score += score;
        existing.sources += 1;
        existing.comboReady = existing.comboReady || comboReady;
        return;
      }
      aggregated.set(related.id, {
        related,
        score,
        sources: 1,
        sourceName,
        comboReady,
      });
    };

    for (const card of uniqueCards) {
      const entry = index.entries[String(card.id)];
      if (!entry) {
        continue;
      }

      for (const related of entry.related) {
        if (deckCardIds.has(related.id)) {
          continue;
        }
        upsert(related, card.name, related.score * card.quantity);
      }

      const mechanicPool = buildMechanicSynergyRelated(
        entry.tags,
        entry.series,
        deckCardIds,
        index,
      );
      for (const related of mechanicPool) {
        upsert(related, card.name, related.score * card.quantity);
      }
    }

    for (const card of uniqueCards) {
      const comboEntry = comboIndex?.entries[String(card.id)];
      if (!comboEntry) {
        continue;
      }

      const enablerIds = new Set(comboEntry.enablers.map((partner) => partner.id));
      const comboReady = [...enablerIds].some((id) => deckCardIds.has(id));

      for (const target of comboEntry.targets) {
        if (deckCardIds.has(target.id)) {
          continue;
        }
        upsert(
          this.comboPartnerToRelated(target),
          card.name,
          target.score * COMBO_TARGET_SCORE,
          comboReady,
        );
      }
    }

    if (forCompletion) {
      this.expandSynergyRoster(deck, index, uniqueCards, upsert);
    }

    return [...aggregated.values()]
      .map((item) => ({
        ...item.related,
        score:
          (item.score + (item.sources - 1) * MULTI_SOURCE_BOOST) *
          (item.comboReady ? COMBO_READY_BOOST : 1),
        sourceName: item.sourceName,
        sources: item.sources,
      }))
      .sort(
        (a, b) =>
          relationGroupOrder(a.relation) - relationGroupOrder(b.relation) ||
          b.score - a.score ||
          a.name.localeCompare(b.name),
      );
  }

  private expandSynergyRoster(
    deck: Decklist,
    index: CardKnowledgeIndex,
    uniqueCards: Decklist['cards'],
    upsert: (
      related: CardKnowledgeRelated,
      sourceName: string,
      score: number,
      comboReady?: boolean,
    ) => void,
  ): void {
    const deckCardIds = new Set(uniqueCards.map((card) => card.id));
    const primarySource = uniqueCards[0]?.name ?? 'deck';
    const archetypeKeys = new Set<string>();
    const seriesKeys = new Set<string>();

    for (const card of uniqueCards) {
      const entry = index.entries[String(card.id)];
      if (!entry) {
        continue;
      }
      for (const token of entry.series) {
        archetypeKeys.add(token);
        seriesKeys.add(token);
      }
      for (const related of entry.related) {
        if (related.archetype) {
          archetypeKeys.add(related.archetype);
        }
      }
    }

    for (const key of archetypeKeys) {
      const roster = (index.archetypes?.[key] ?? []).slice(0, MAX_ROSTER_PER_KEY);
      for (const member of roster) {
        if (deckCardIds.has(member.id)) {
          continue;
        }
        upsert(this.rosterMemberToRelated(member, 'archetype'), primarySource, ARCHETYPE_ROSTER_SCORE);
      }
    }

    for (const key of seriesKeys) {
      const roster = (index.seriesIndex?.[key] ?? []).slice(0, MAX_ROSTER_PER_KEY);
      for (const member of roster) {
        if (deckCardIds.has(member.id)) {
          continue;
        }
        upsert(this.rosterMemberToRelated(member, 'series'), primarySource, SERIES_ROSTER_SCORE);
      }
    }
  }

  private rosterMemberToRelated(
    member: CardKnowledgeRosterMember,
    relation: string,
  ): CardKnowledgeRelated {
    return {
      id: member.id,
      name: member.name,
      relation,
      score: relation === 'archetype' ? ARCHETYPE_ROSTER_SCORE : SERIES_ROSTER_SCORE,
      archetype: member.archetype,
      tcgDate: member.tcgDate,
      banTcg: member.banTcg,
      imageSmall: member.imageSmall,
    };
  }

  private comboPartnerToRelated(partner: ComboPartnerRecord): CardKnowledgeRelated {
    return {
      id: partner.id,
      name: partner.name,
      relation: partner.role === 'summon_target' ? 'engine' : 'mentions_card',
      score: partner.score,
      archetype: null,
      tcgDate: partner.tcgDate ?? null,
      banTcg: partner.banTcg ?? null,
      imageSmall: partner.imageSmall,
    };
  }

  private applySuggestedQuantities(
    suggestions: CardRelatedSuggestion[],
    deck: Decklist,
  ): CardRelatedSuggestion[] {
    return suggestions
      .map((suggestion) => {
        const inDeck = deck.cards.find((card) => card.id === suggestion.cardId)?.quantity ?? 0;
        const max = suggestion.maxCopies ?? 3;
        const suggestedQty = Math.max(0, max - inDeck);
        return { ...suggestion, suggestedQty };
      })
      .filter((suggestion) => (suggestion.suggestedQty ?? 0) > 0);
  }

  private diversifySuggestions(suggestions: CardRelatedSuggestion[]): CardRelatedSuggestion[] {
    const byRelation = new Map<string, CardRelatedSuggestion[]>();
    for (const item of suggestions) {
      const bucket = byRelation.get(item.relation) ?? [];
      bucket.push(item);
      byRelation.set(item.relation, bucket);
    }

    const picked: CardRelatedSuggestion[] = [];
    const order = [...Object.keys(RELATION_GROUP_KEYS), 'series', 'archetype'];

    for (const relation of order) {
      const bucket = byRelation.get(relation) ?? [];
      for (const item of bucket.slice(0, MAX_DECK_PER_RELATION)) {
        if (picked.length >= MAX_DECK_SUGGESTIONS) {
          return picked;
        }
        if (!picked.some((entry) => entry.cardId === item.cardId)) {
          picked.push(item);
        }
      }
    }

    for (const item of suggestions) {
      if (picked.length >= MAX_DECK_SUGGESTIONS) {
        break;
      }
      if (!picked.some((entry) => entry.cardId === item.cardId)) {
        picked.push(item);
      }
    }

    return picked;
  }

  private toDeckSuggestion(
    related: CardKnowledgeRelated & { sourceName?: string; sources?: number },
  ): CardRelatedSuggestion {
    const suggestion = toSuggestion(related, related.sourceName ?? related.name, (key) => this.i18n.t(key));
    if ((related.sources ?? 0) > 1) {
      return {
        ...suggestion,
        reasonKey: 'knowledge.reason.deckMultiSource',
        reasonParams: { count: `${related.sources}` },
        score: related.score,
      };
    }
    return { ...suggestion, score: related.score };
  }
}
