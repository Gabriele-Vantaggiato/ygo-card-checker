import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  CardKnowledgeIndex,
  CardKnowledgeRelated,
  CardKnowledgeRosterMember,
  CardRelatedSuggestion,
  DeckRelatedResult,
  FormatLegalityIndex,
} from '../../models/card-knowledge.model';
import { EffectScriptIndex } from '../../models/effect-script.model';
import { Decklist } from '../../models/decklist.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { relationGroupOrder, tagLabelKey } from '../../utils/knowledge-display.utils';
import { isPlayableInFormat, maxCopiesInFormat } from '../../utils/format-legality.utils';
import { buildMechanicSynergyRelated } from '../../utils/mechanic-synergy.utils';
import { splitDeckSections, sectionCardCount } from '../../utils/deck-card.utils';
import {
  DEFAULT_TARGET_MAIN,
  TARGET_EXTRA,
  resolveRoleTier,
  scaledMaxCopies,
} from '../../utils/deck-role-tier.utils';
import { collectScriptDeckSynergies, isCompatibleMonsterPartner } from '../../utils/script-deck-synergy.utils';
import { retrieveDatasetSynergies } from '../../utils/synergy-retrieval.utils';
import { CardLegalityFacade } from '../card-legality.facade';
import { CardKnowledgeIndexService } from '../card-knowledge-index.service';
import { CompletionRagService } from '../completion-rag.service';
import { EffectScriptService } from '../effect-script.service';
import { I18nService } from '../i18n.service';
import { isExtraDeckType } from '../ydke.service';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import {
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
import {
  buildDeckFingerprint,
  enrichSuggestionReasonForFingerprint,
  fingerprintToProfile,
  suggestionAffinityMultiplier,
} from '../../utils/deck-fingerprint.utils';
import { mergeCompletionProfiles } from '../../utils/completion-prompt.utils';

const EMPTY_DECK_RESULT: DeckRelatedResult = {
  suggestions: [],
  groups: [],
  sourceCount: 0,
  available: false,
  formatId: null,
};

const MAX_DECK_SUGGESTIONS = 36;
const MAX_DECK_PER_RELATION = 6;
const MAX_GY_SYNERGY_SLOTS = 14;
const DISPLAY_ROSTER_PER_KEY = 10;
const MIN_SUGGESTION_SCORE = 0.18;
const COMPLETION_SUGGESTION_LIMIT = 96;
const MAX_ROSTER_PER_KEY = 20;
const MULTI_SOURCE_BOOST = 2.2;
const COMBO_TARGET_SCORE = 1.25;
const COMBO_READY_BOOST = 1.6;
const ARCHETYPE_ROSTER_SCORE = 0.42;
const SERIES_ROSTER_SCORE = 0.38;
const SIDE_STAPLE_POOL = 160;
const SCRIPT_SYNERGY_WEIGHT = 1.85;
const DATASET_PER_CARD_LIMIT = 14;
const DATASET_SCAN_CARD_CAP = 18;

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
  private readonly effectScripts = inject(EffectScriptService);

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

        const diversified = this.normalizeSynergyScores(this.diversifySuggestions(suggestions));
        return {
          suggestions: diversified,
          groups: groupSuggestions(diversified),
          sourceCount: uniqueCards.length,
          available: true,
          formatId: format.id,
        };
      }),
      catchError(() => of({ ...EMPTY_DECK_RESULT, available: true, formatId: format.id })),
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

    return combineLatest([
      this.index$,
      this.formatLegality$,
      this.comboIndex$,
      this.strategy.ragResult$,
      this.effectScripts.ensureLoaded$(),
    ]).pipe(
      switchMap(([index, formatIndex, comboIndex, rag, scriptIndex]) => {
        if (!index) {
          return of([]);
        }

        const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
        if (uniqueCards.length === 0) {
          return of([]);
        }

        const deckCardIds = new Set(deck.cards.map((card) => card.id));
        const fingerprint = buildDeckFingerprint(deck, index);
        const ranked = this.aggregateDeckRanked(
          deck,
          index,
          comboIndex,
          forCompletion,
          fingerprint,
          scriptIndex,
          formatIndex,
          format.id,
        );
        if (ranked.length === 0) {
          return of([]);
        }

        // Ranked list is already format-biased; keep a buffer before final cut.
        const pool = ranked.slice(0, Math.max(effectiveLimit * 4, 96));
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
            const profile = mergeCompletionProfiles(rag.profile, fingerprintToProfile(fingerprint));
            const withStrategy = applyStrategyToSuggestions(merged, index.entries, profile, 'main');
            const withAffinity = withStrategy
              .map((suggestion) => {
                const entry = index.entries[String(suggestion.cardId)];
                const score = suggestion.score * suggestionAffinityMultiplier(suggestion, entry, fingerprint);
                return enrichSuggestionReasonForFingerprint({ ...suggestion, score }, entry, fingerprint);
              })
              .filter((suggestion) => suggestion.score >= MIN_SUGGESTION_SCORE);
            const withQty = this.applySuggestedQuantities(withAffinity, deck, index);
            return withQty
              .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
              .slice(0, effectiveLimit);
          }),
          catchError(() => of([])),
        );
      }),
      catchError(() => of([])),
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
    fingerprint?: ReturnType<typeof buildDeckFingerprint>,
    scriptIndex?: EffectScriptIndex,
    formatIndex: FormatLegalityIndex | null = null,
    formatId: string | null = null,
  ): Array<CardKnowledgeRelated & { sourceName: string; sources: number }> {
    const uniqueCards = [...new Map(deck.cards.map((card) => [card.id, card])).values()];
    const deckCardIds = new Set(uniqueCards.map((card) => card.id));
    const playable =
      formatIndex && formatId
        ? (cardId: number) => isPlayableInFormat(formatIndex, cardId, formatId)
        : null;
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
      if (playable && !playable(related.id)) {
        return;
      }
      const existing = aggregated.get(related.id);
      if (existing) {
        existing.score += score;
        existing.sources += 1;
        existing.comboReady = existing.comboReady || comboReady;
        if (related.relation === 'gy_synergy' && existing.related.relation !== 'gy_synergy') {
          existing.related = { ...existing.related, relation: 'gy_synergy' };
        }
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

    const roster = this.indexService.rosterFor(index);
    const deckFp = fingerprint ?? buildDeckFingerprint(deck, index);
    const deckRaces = new Set(deckFp.dominantRaces.map((r) => r.toLowerCase()));
    const deckAttributes = new Set(deckFp.dominantAttributes.map((a) => a.toLowerCase()));
    const deckSeries = new Set(
      [...deckFp.dominantSeries, ...deckFp.dominantArchetypes].map((s) => s.toLowerCase()),
    );

    const acceptsPartner = (related: CardKnowledgeRelated): boolean => {
      if (deckRaces.size === 0) {
        return true;
      }
      // Only hard-gate GY / mechanic flood — engine/search/mentions stay usable.
      if (
        related.relation !== 'gy_synergy' &&
        related.relation !== 'mechanic_synergy' &&
        related.relation !== 'series' &&
        related.relation !== 'archetype'
      ) {
        return true;
      }
      const member = roster.get(related.id);
      const entry = index.entries[String(related.id)];
      const probe: CardKnowledgeRosterMember = member ?? {
        id: related.id,
        name: related.name,
        type: entry?.type ?? (related.race ? 'Effect Monster' : 'Card'),
        race: related.race ?? entry?.race ?? null,
        attribute: related.attribute ?? entry?.attribute ?? null,
        archetype: related.archetype,
        tcgDate: related.tcgDate,
        banTcg: related.banTcg,
        imageSmall: related.imageSmall,
      };
      // Missing race on a monster-like probe: keep if name/series match, else drop only when race is known-mismatched.
      if (!probe.race && probe.type.toLowerCase().includes('monster')) {
        return isCompatibleMonsterPartner(probe, deckRaces, deckAttributes, deckSeries);
      }
      return isCompatibleMonsterPartner(probe, deckRaces, deckAttributes, deckSeries);
    };

    const identityMultiplier = (related: CardKnowledgeRelated): number => {
      const race = (related.race ?? roster.get(related.id)?.race ?? '').toLowerCase();
      if (race && deckRaces.has(race)) {
        return 1.35;
      }
      const attribute = (
        related.attribute ??
        roster.get(related.id)?.attribute ??
        ''
      ).toLowerCase();
      if (attribute && deckAttributes.has(attribute) && (!race || deckRaces.has(race))) {
        return 1.1;
      }
      return 1;
    };

    for (const card of uniqueCards) {
      const entry = index.entries[String(card.id)];
      if (!entry) {
        continue;
      }

      for (const related of entry.related) {
        if (deckCardIds.has(related.id) || !acceptsPartner(related)) {
          continue;
        }
        const weight = related.relation === 'gy_synergy' ? 2.2 : 1;
        upsert(
          related,
          card.name,
          related.score * card.quantity * weight * identityMultiplier(related),
        );
      }

      const mechanicPool = buildMechanicSynergyRelated(
        entry.tags,
        entry.series,
        deckCardIds,
        index,
      );
      for (const related of mechanicPool) {
        if (!acceptsPartner(related)) {
          continue;
        }
        upsert(related, card.name, related.score * card.quantity * identityMultiplier(related));
      }
    }

    // Full-dataset scan is expensive — only for completion planner, not Assist UI.
    if (forCompletion) {
      const profile = mergeCompletionProfiles(
        {
          tagBoosts: {},
          relationBoosts: { gy_synergy: 1.45, engine: 1.12, mechanic_synergy: 1.08 },
          nameKeywords: [],
          archetypeKeywords: [],
          cardIdBoosts: {},
          matchupKeys: [],
          directionMultiplier: 1,
          preferGenericStaples: false,
          preferCombo: true,
          preferArchetype: Boolean(fingerprint?.hasClearIdentity),
        },
        fingerprintToProfile(deckFp),
      );
      const tagDf = this.indexService.tagDfFor(index);
      const tagIndex = this.indexService.tagIndexFor(index);
      const scanCards = uniqueCards
        .slice()
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, DATASET_SCAN_CARD_CAP);
      for (const card of scanCards) {
        const entry = index.entries[String(card.id)];
        if (!entry) {
          continue;
        }
        const dataset = retrieveDatasetSynergies(
          card.id,
          entry,
          index,
          profile,
          deckCardIds,
          roster,
          {
            limit: DATASET_PER_CARD_LIMIT,
            minScore: 0.5,
            tagDf,
            tagIndex,
          },
        );
        for (const related of dataset) {
          if (!acceptsPartner(related)) {
            continue;
          }
          upsert(related, card.name, related.score * card.quantity * identityMultiplier(related));
        }
      }
    }

    const scriptHits = collectScriptDeckSynergies(
      uniqueCards,
      index,
      scriptIndex?.scripts ?? this.effectScripts.scripts(),
      deckCardIds,
      96,
      {
        deckRaces,
        deckAttributes,
        deckSeries,
        isPlayable: playable ?? undefined,
      },
    );
    for (const hit of scriptHits) {
      upsert(hit, hit.sourceName, hit.score * SCRIPT_SYNERGY_WEIGHT * identityMultiplier(hit));
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

    // Always expand archetype/series roster for assist so format-wide partners surface.
    this.expandSynergyRoster(deck, index, uniqueCards, upsert, {
      archetypeKeys: fingerprint?.dominantArchetypes.slice(0, 3),
      seriesKeys: fingerprint?.dominantSeries.slice(0, 3),
      perKey: forCompletion ? MAX_ROSTER_PER_KEY : DISPLAY_ROSTER_PER_KEY,
      archetypeScore: ARCHETYPE_ROSTER_SCORE * (fingerprint?.hasClearIdentity ? 1.15 : 1),
      seriesScore: SERIES_ROSTER_SCORE * (fingerprint?.hasClearIdentity ? 1.1 : 1),
    });

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
    scope?: {
      archetypeKeys?: string[];
      seriesKeys?: string[];
      perKey?: number;
      archetypeScore?: number;
      seriesScore?: number;
    },
  ): void {
    const deckCardIds = new Set(uniqueCards.map((card) => card.id));
    const primarySource = uniqueCards[0]?.name ?? 'deck';
    const archetypeKeys = new Set<string>();
    const seriesKeys = new Set<string>();
    const perKey = scope?.perKey ?? MAX_ROSTER_PER_KEY;
    const archetypeScore = scope?.archetypeScore ?? ARCHETYPE_ROSTER_SCORE;
    const seriesScore = scope?.seriesScore ?? SERIES_ROSTER_SCORE;

    if ((scope?.archetypeKeys?.length ?? 0) > 0 || (scope?.seriesKeys?.length ?? 0) > 0) {
      for (const key of scope?.archetypeKeys ?? []) {
        archetypeKeys.add(key);
      }
      for (const key of scope?.seriesKeys ?? []) {
        seriesKeys.add(key);
      }
    } else {
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
    }

    for (const key of archetypeKeys) {
      const roster = (index.archetypes?.[key] ?? []).slice(0, perKey);
      for (const member of roster) {
        if (deckCardIds.has(member.id)) {
          continue;
        }
        upsert(this.rosterMemberToRelated(member, 'archetype'), primarySource, archetypeScore);
      }
    }

    for (const key of seriesKeys) {
      const roster = (index.seriesIndex?.[key] ?? []).slice(0, perKey);
      for (const member of roster) {
        if (deckCardIds.has(member.id)) {
          continue;
        }
        upsert(this.rosterMemberToRelated(member, 'series'), primarySource, seriesScore);
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
    index: CardKnowledgeIndex,
  ): CardRelatedSuggestion[] {
    const sections = splitDeckSections(deck.cards);
    const mainFullness = Math.min(1, sectionCardCount(sections.main) / DEFAULT_TARGET_MAIN);
    const extraFullness = Math.min(1, sectionCardCount(sections.extra) / TARGET_EXTRA);

    return suggestions
      .map((suggestion) => {
        const inDeck = deck.cards.find((card) => card.id === suggestion.cardId)?.quantity ?? 0;
        const formatMax = suggestion.maxCopies ?? 3;
        const entryType = index.entries[String(suggestion.cardId)]?.type;
        const isExtra = entryType ? isExtraDeckType(entryType) : false;
        const scriptRoles = this.effectScripts.getRoles(suggestion.cardId);
        const tier = resolveRoleTier(suggestion.relation, scriptRoles);
        const max = scaledMaxCopies(formatMax, tier, isExtra ? extraFullness : mainFullness);
        const suggestedQty = Math.max(0, max - inDeck);
        return { ...suggestion, suggestedQty };
      })
      .filter((suggestion) => (suggestion.suggestedQty ?? 0) > 0);
  }

  private diversifySuggestions(suggestions: CardRelatedSuggestion[]): CardRelatedSuggestion[] {
    const sorted = [...suggestions].sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    );
    const picked: CardRelatedSuggestion[] = [];
    const perRelation = new Map<string, number>();

    for (const item of sorted) {
      if (picked.length >= MAX_DECK_SUGGESTIONS) {
        break;
      }
      const used = perRelation.get(item.relation) ?? 0;
      const cap =
        item.relation === 'gy_synergy' ? MAX_GY_SYNERGY_SLOTS : MAX_DECK_PER_RELATION;
      if (used >= cap) {
        continue;
      }
      perRelation.set(item.relation, used + 1);
      picked.push(item);
    }

    return picked;
  }

  /** Normalize raw scores to 0–100 synergy % for Assist UI. */
  private normalizeSynergyScores(suggestions: CardRelatedSuggestion[]): CardRelatedSuggestion[] {
    if (suggestions.length === 0) {
      return suggestions;
    }
    const max = Math.max(...suggestions.map((item) => item.score), 1);
    return suggestions.map((item) => ({
      ...item,
      score: Math.max(1, Math.round((item.score / max) * 100)),
    }));
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
    if (related.relation === 'gy_synergy' && related.sourceName) {
      return {
        ...suggestion,
        reasonKey: 'decklist.suggestions.reason.withCard',
        reasonParams: { name: related.sourceName },
        score: related.score,
      };
    }
    return { ...suggestion, score: related.score };
  }
}
