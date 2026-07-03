import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { CardKnowledgeEffect, CardKnowledgeEntry, CardKnowledgeIndex, CardKnowledgeRelated, CardKnowledgeRosterMember, CardRelatedGroup, CardRelatedResult, CardRelatedSuggestion, DeckRelatedResult, FormatLegalityIndex } from '../models/card-knowledge.model';
import { YgoCard } from '../models/ygo-card.model';
import { BanlistStatus, YgoFormat } from '../models/ygo-format.model';
import { maxCopiesForStatus } from '../models/decklist.model';
import { relationGroupOrder, tagLabelKey, toDisplayTags } from '../utils/knowledge-display.utils';
import { isPlayableInFormat, maxCopiesInFormat } from '../utils/format-legality.utils';
import {
  buildMechanicSynergyRelated,
  mergeRelatedById,
} from '../utils/mechanic-synergy.utils';
import { CompletionScoringProfile, scoreForCompletion } from '../utils/completion-prompt.utils';
import { CardLegalityFacade } from './card-legality.facade';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { CompletionRagService } from './completion-rag.service';
import { SynergyRetrievalService } from './synergy-retrieval.service';
import { Decklist } from '../models/decklist.model';
import { ComboIndex, ComboPartnerRecord } from '../models/card-combo.model';
import { I18nService } from './i18n.service';
import { isExtraDeckType } from './ydke.service';
import { DeckStrategyStore } from '../stores/deck-strategy.store';
import {
  RELATION_GROUP_KEYS,
  RELATION_LABEL_KEYS,
  SIDE_STAPLE_TAGS,
} from '../utils/knowledge-constants';

const EMPTY_DECK_RESULT: DeckRelatedResult = {
  suggestions: [],
  groups: [],
  sourceCount: 0,
  available: false,
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

export interface DeckSuggestionOptions {
  forCompletion?: boolean;
}

const MAX_CARD_RELATED_SUGGESTIONS = 120;
const SIDE_STAPLE_POOL = 160;

const EMPTY_RESULT: CardRelatedResult = {
  tags: [],
  displayTags: [],
  series: [],
  mentions: [],
  effects: [],
  suggestions: [],
  groups: [],
  available: false,
};

@Injectable({ providedIn: 'root' })
export class CardKnowledgeService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly i18n = inject(I18nService);
  private readonly strategy = inject(DeckStrategyStore);
  private readonly completionRag = inject(CompletionRagService);
  private readonly synergyRetrieval = inject(SynergyRetrievalService);

  private readonly index$ = this.indexService.related$;
  private readonly formatLegality$ = this.indexService.formatLegality$;
  private readonly comboIndex$ = this.indexService.combos$;

  findRelated$(card: YgoCard, format: YgoFormat): Observable<CardRelatedResult> {
    return combineLatest([this.index$, this.formatLegality$, this.strategy.ragResult$]).pipe(
      switchMap(([index, formatIndex, rag]) => {
        if (!index) {
          return of(EMPTY_RESULT);
        }
        const entry = index.entries[String(card.id)];
        if (!entry) {
          return of({ ...EMPTY_RESULT, available: true });
        }

        const base = {
          tags: entry.tags,
          displayTags: toDisplayTags(entry.tags),
          series: entry.series,
          mentions: entry.mentions ?? [],
          effects: entry.effects ?? [],
          available: true,
        };

        const excludeIds = new Set([card.id]);

        return this.synergyRetrieval
          .retrieve$(card.id, rag.profile, excludeIds, { limit: MAX_CARD_RELATED_SUGGESTIONS })
          .pipe(
            switchMap((mergedRelated) => {
              if (mergedRelated.length === 0) {
                return of({ ...base, suggestions: [], groups: [] });
              }

              return this.filterSuggestions$(mergedRelated, format, formatIndex, (related) =>
                this.toSuggestion(related, card.name),
              ).pipe(
                map((suggestions) => {
                  const scored = this.applyStrategyToSuggestions(
                    suggestions,
                    index.entries,
                    rag.profile,
                    'main',
                  );
                  return {
                    ...base,
                    suggestions: scored,
                    groups: this.groupSuggestions(scored),
                  };
                }),
              );
            }),
          );
      }),
    );
  }

  findRelatedForDeck$(deck: Decklist, format: YgoFormat): Observable<DeckRelatedResult> {
    return combineLatest([this.index$, this.rankDeckSuggestions$(deck, format, MAX_DECK_SUGGESTIONS)]).pipe(
      map(([index, suggestions]) => {
        if (!index) {
          return EMPTY_DECK_RESULT;
        }
        const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
        if (uniqueCards.length === 0) {
          return { ...EMPTY_DECK_RESULT, available: true };
        }
        if (suggestions.length === 0) {
          return {
            ...EMPTY_DECK_RESULT,
            available: true,
            sourceCount: uniqueCards.length,
          };
        }

        const diversified = this.diversifySuggestions(suggestions);
        return {
          suggestions: diversified,
          groups: this.groupSuggestions(diversified),
          sourceCount: uniqueCards.length,
          available: true,
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

        return this.filterSuggestions$(pool, format, formatIndex, (related) =>
          this.toDeckSuggestion(related),
        ).pipe(
          map((suggestions) => {
            const matchup = this.completionRag.toMatchupSuggestions(index, rag.profile, deckCardIds);
            const merged = this.mergeSuggestionPools(suggestions, matchup);
            const withQty = this.applySuggestedQuantities(
              this.applyStrategyToSuggestions(merged, index.entries, rag.profile, 'main'),
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
              maxCopies: formatIndex ? (maxCopiesInFormat(formatIndex, member.id, format.id) ?? undefined) : undefined,
            });
          }
        }

        return [...merged.values()]
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, limit);
      }),
    );
  }

  knowledgeIndex$(): Observable<CardKnowledgeIndex | null> {
    return this.index$;
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

  private filterSuggestions$(
    related: readonly CardKnowledgeRelated[],
    format: YgoFormat,
    formatIndex: FormatLegalityIndex | null,
    toSuggestion: (item: CardKnowledgeRelated) => CardRelatedSuggestion,
  ): Observable<CardRelatedSuggestion[]> {
    if (formatIndex) {
      return of(
        related
          .filter((item) => isPlayableInFormat(formatIndex, item.id, format.id))
          .map((item) => ({
            ...toSuggestion(item),
            maxCopies: maxCopiesInFormat(formatIndex, item.id, format.id) ?? undefined,
          })),
      );
    }

    const stubs = related.map((item) => this.toYgoCard(item));
    return this.cardLegality.evaluateMany$(stubs, format).pipe(
      map((legality) =>
        related
          .filter((item) => {
            const verdict = legality.get(item.id)?.verdict;
            return verdict === 'legal' || verdict === 'restricted';
          })
          .map((item) => {
            const result = legality.get(item.id);
            return {
              ...toSuggestion(item),
              maxCopies: result ? maxCopiesForStatus(result.banlistStatus) : undefined,
            };
          }),
      ),
    );
  }

  effectLabelKey(effect: CardKnowledgeEffect): string {
    return `knowledge.effect.${effect.kind}`;
  }

  effectLabelParams(effect: CardKnowledgeEffect): Record<string, string> | undefined {
    const payload = effect.payload;
    switch (effect.kind) {
      case 'control':
        return {
          level: String(payload['minLevel'] ?? ''),
          names: Array.isArray(payload['names']) ? (payload['names'] as string[]).join(' / ') : '',
        };
      case 'special_summon_deck':
        return {
          level: String(payload['minLevel'] ?? ''),
          names: Array.isArray(payload['names']) ? (payload['names'] as string[]).join(' / ') : '',
        };
      case 'self_summon_hand_tribute_atk':
        return {
          count: String(payload['tributeCount'] ?? ''),
          atk: String(payload['minAtk'] ?? ''),
        };
      case 'add_from_deck':
        return {
          names: Array.isArray(payload['names']) ? (payload['names'] as string[]).join(' / ') : '',
        };
      case 'tribute_special_summon':
        return {
          tribute:
            Array.isArray(payload['tributeNames']) ? (payload['tributeNames'] as string[]).join(' / ') : '',
          summon:
            Array.isArray(payload['summonNames']) ? (payload['summonNames'] as string[]).join(' / ') : '',
        };
      default:
        return undefined;
    }
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
    const suggestion = this.toSuggestion(related, related.sourceName ?? related.name);
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

  private groupSuggestions(suggestions: CardRelatedSuggestion[]): CardRelatedGroup[] {
    const map = new Map<string, CardRelatedSuggestion[]>();
    for (const suggestion of suggestions) {
      const bucket = map.get(suggestion.relation) ?? [];
      bucket.push(suggestion);
      map.set(suggestion.relation, bucket);
    }

    return [...map.entries()]
      .sort(([a], [b]) => relationGroupOrder(a) - relationGroupOrder(b))
      .map(([relation, items]) => ({
        relation,
        labelKey: RELATION_GROUP_KEYS[relation] ?? 'knowledge.group.other',
        suggestions: items,
      }));
  }

  private toYgoCard(related: CardKnowledgeRelated): YgoCard {
    const banTcg = related.banTcg as BanlistStatus | null;
    return {
      id: related.id,
      name: related.name,
      type: 'Card',
      desc: '',
      archetype: related.archetype ?? undefined,
      card_images: [
        {
          id: related.id,
          image_url: related.imageSmall.replace('cards_small', 'cards'),
          image_url_small: related.imageSmall,
        },
      ],
      banlist_info: banTcg ? { ban_tcg: banTcg } : undefined,
      misc_info: related.tcgDate ? [{ tcg_date: related.tcgDate }] : undefined,
    };
  }

  private toSuggestion(related: CardKnowledgeRelated, sourceName: string): CardRelatedSuggestion {
    let reasonKey = RELATION_LABEL_KEYS[related.relation] ?? 'knowledge.reason.related';
    let reasonParams: Record<string, string> | undefined;

    if (related.mechanicTrigger) {
      reasonKey = 'knowledge.reason.mechanicSynergy';
      reasonParams = { trigger: this.i18n.t(tagLabelKey(related.mechanicTrigger)) };
    } else if (related.relation === 'mentions_card' || related.relation === 'search_target') {
      reasonParams = { name: sourceName };
    } else if (related.relation === 'shared_mention' && related.archetype) {
      reasonParams = { series: related.archetype };
    } else if (related.archetype) {
      reasonParams = { series: related.archetype };
    }

    return {
      cardId: related.id,
      name: related.name,
      relation: related.relation,
      score: related.score,
      archetype: related.archetype,
      imageSmall: related.imageSmall,
      reasonKey,
      reasonParams,
    };
  }

  private applyStrategyToSuggestions(
    suggestions: CardRelatedSuggestion[],
    entries: Record<string, CardKnowledgeEntry>,
    profile: CompletionScoringProfile,
    section: 'main' | 'extra' | 'side',
  ): CardRelatedSuggestion[] {
    return [...suggestions]
      .map((suggestion) => ({
        ...suggestion,
        score: scoreForCompletion(
          suggestion,
          entries[String(suggestion.cardId)],
          profile,
          section,
        ),
      }))
      .sort(
        (a, b) =>
          relationGroupOrder(a.relation) - relationGroupOrder(b.relation) ||
          b.score - a.score ||
          a.name.localeCompare(b.name),
      );
  }

  private mergeSuggestionPools(
    primary: CardRelatedSuggestion[],
    extra: CardRelatedSuggestion[],
  ): CardRelatedSuggestion[] {
    const merged = new Map<number, CardRelatedSuggestion>();
    for (const item of [...primary, ...extra]) {
      const existing = merged.get(item.cardId);
      if (!existing || item.score > existing.score) {
        merged.set(item.cardId, item);
      }
    }
    return [...merged.values()];
  }

  private matchupSuggestionToRelated(suggestion: CardRelatedSuggestion): CardKnowledgeRelated {
    return {
      id: suggestion.cardId,
      name: suggestion.name,
      relation: suggestion.relation,
      score: suggestion.score,
      archetype: suggestion.archetype,
      tcgDate: null,
      banTcg: null,
      imageSmall: suggestion.imageSmall,
    };
  }
}
