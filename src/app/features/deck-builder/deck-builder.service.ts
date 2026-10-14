import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, defer, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Decklist, maxCopiesForStatus } from '../../models/decklist.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { YgoApiService } from '../../services/ygo-api.service';
import { CardLegalityFacade } from '../../services/card-legality.facade';
import { I18nService } from '../../services/i18n.service';
import { splitDeckSections, sectionCardCount } from '../../utils/deck-card.utils';
import { canPlaceCardInSection } from '../../utils/deck-section.utils';
import { TARGET_EXTRA } from '../../utils/deck-role-tier.utils';
import { resolveDeckSection } from '../../services/ydke.service';
import { buildDeckIdentity, isAdmissible, DeckIdentityFacts, GateCardFacts } from './deck-builder-gate.util';
import { DeckBuilderCatalogService } from './deck-builder-catalog.service';
import { DeckCooccurrenceService } from './deck-cooccurrence.service';
import { DeckBuilderAiService } from './deck-builder-ai.service';
import { DeckAnalysisAiService } from './deck-analysis-ai.service';
import { DeckBuilderAdd, DeckBuilderCompetitiveStats, DeckBuilderHandStats, DeckBuilderOptions, DeckBuilderPlan } from './deck-builder.model';
import { DeckAnalysis } from './deck-analysis.model';
import { DeckRouletteService } from '../../services/deck-roulette.service';
import { planPoolAdds, rankPoolDecks } from '../../utils/pool-completion.utils';
import { CardMeta, hasRole } from '../../utils/card-meta.utils';
import { CompetitiveContext, scoreDeck } from '../../utils/competitive-score.utils';
import { FormatCardStats, FormatStaples, buildFormatCardStats, buildFormatStaples, typicalCopies } from '../../utils/format-staples.utils';
import { selectStructuredSection } from '../../utils/structured-sections.utils';
import { buildMonsterPool, isExtraReachable } from '../../utils/extra-reachability.utils';
import type { RouletteDeck } from '../../services/deck-roulette.service';
import { hypergeometricAtLeastOne } from '../../utils/hypergeo.utils';

/** How many of the strongest co-occurrence candidates get hydrated + sent to the LLM.
 *  Bounds API calls (both YGOPRODeck batch fetch and the single Gemini call). */
const CANDIDATE_POOL_SIZE = 60;

/** Smallest pool whose format statistics (staples, typical copies) are trusted by the fallback engine. */
const MIN_POOL_FOR_FORMAT_STATS = 100;
/** Copies for a main card no tournament deck of the format plays: off-meta, so no automatic playset. */
const UNKNOWN_MAIN_COPIES = 2;

interface FormatKnowledge {
  pool: readonly RouletteDeck[];
  staples: FormatStaples;
  stats: FormatCardStats;
  meta: ReadonlyMap<number, CardMeta>;
}

interface CandidatePool {
  identity: DeckIdentityFacts;
  legalFacts: GateCardFacts[];
  legality: ReadonlyMap<number, { banlistStatus?: string | null; verdict?: string }>;
}

@Injectable({ providedIn: 'root' })
export class DeckBuilderService {
  private readonly catalogService = inject(DeckBuilderCatalogService);
  private readonly cooccurrence = inject(DeckCooccurrenceService);
  private readonly ai = inject(DeckBuilderAiService);
  private readonly analysisAi = inject(DeckAnalysisAiService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly i18n = inject(I18nService);
  private readonly roulette = inject(DeckRouletteService);

  buildPlan$(deck: Decklist, format: YgoFormat, options: DeckBuilderOptions): Observable<DeckBuilderPlan> {
    const sections = splitDeckSections(deck.cards);
    const currentMain = sectionCardCount(sections.main);
    const currentExtra = sectionCardCount(sections.extra);
    const currentSide = sectionCardCount(sections.side);
    const mainGap = options.targetMain - currentMain;
    const extraGap = TARGET_EXTRA - currentExtra;
    const sideGap = options.includeSide ? options.targetSide - currentSide : 0;

    const uniqueCards = [...new Map(deck.cards.map((c) => [c.id, c])).values()];

    if (uniqueCards.length === 0) {
      return of(this.emptyPlan('empty_deck', options, currentMain, currentExtra, currentSide));
    }
    if (mainGap <= 0 && extraGap <= 0 && sideGap <= 0) {
      return of(this.emptyPlan('already_complete', options, currentMain, currentExtra, currentSide));
    }

    const engine$ = defer(() =>
      combineLatest([this.formatKnowledge$(format), this.buildCandidatePool$(deck, format)]).pipe(
        switchMap(([knowledge, pool]) => {
          if (!pool) {
            return of(this.emptyPlan('no_candidates', options, currentMain, currentExtra, currentSide));
          }
          const { identity, legalFacts, legality } = pool;
          const deckSummary = this.summarizeDeck(deck);

          return this.ai.rank$(legalFacts, deckSummary, this.i18n.lang() === 'it' ? 'it' : 'en').pipe(
            switchMap((suggestions) => {
              const aiUsed = suggestions.length > 0;
              const orderedFacts = aiUsed
                ? [
                    ...suggestions
                      .map((s) => legalFacts.find((f) => f.id === s.cardId))
                      .filter((f): f is GateCardFacts => !!f),
                    ...legalFacts.filter((f) => !suggestions.some((s) => s.cardId === f.id)),
                  ]
                : legalFacts;
              const reasonById = new Map(suggestions.map((s) => [s.cardId, s.reason]));

              // with format statistics the Extra and Side Deck come from the format's recurring cards
              // (see stapleSectionAdds$) and the main deck uses the copies players usually run
              const structured = !!knowledge && (extraGap > 0 || sideGap > 0);
              const adds = this.fillGaps(
                orderedFacts,
                deck,
                legality,
                reasonById,
                { main: mainGap, extra: knowledge ? 0 : extraGap, side: knowledge ? 0 : sideGap },
                knowledge ? knowledge.stats : null,
              );
              const plan = (all: DeckBuilderAdd[]): DeckBuilderPlan => ({
                status: all.length > 0 ? 'ready' : 'no_candidates',
                identity: { hasIdentity: identity.archetypes.size > 0, archetypes: [...identity.archetypes] },
                targetMain: options.targetMain,
                currentMain,
                currentExtra,
                currentSide,
                adds: all,
                aiUsed,
              });
              if (!structured || !knowledge) return of(plan(adds));
              return this.stapleSectionAdds$(deck, format, knowledge, adds, { extra: extraGap, side: sideGap }).pipe(
                map((stapleAdds) => plan([...adds, ...stapleAdds])),
              );
            }),
          );
        }),
      ),
    );

    return this.buildPoolPlan$(deck, format, options, { currentMain, currentExtra, currentSide, mainGap, extraGap, sideGap }).pipe(
      switchMap((plan) => (plan ? of(plan) : engine$)),
    );
  }

  /**
   * Completion from real decks: finds the curated pool decks closest to the user's partial deck and
   * proposes the cards they play that the user is missing. Returns null when no pool deck is similar
   * enough, so the caller falls back to the co-occurrence/AI engine.
   */
  private buildPoolPlan$(
    deck: Decklist,
    format: YgoFormat,
    options: DeckBuilderOptions,
    counts: { currentMain: number; currentExtra: number; currentSide: number; mainGap: number; extraGap: number; sideGap: number },
  ): Observable<DeckBuilderPlan | null> {
    const userMainExtra = new Map<number, number>();
    const userBySection = new Map<string, number>();
    for (const card of deck.cards) {
      const section = resolveDeckSection(card);
      userBySection.set(`${section}:${card.id}`, (userBySection.get(`${section}:${card.id}`) ?? 0) + card.quantity);
      if (section !== 'side') userMainExtra.set(card.id, (userMainExtra.get(card.id) ?? 0) + card.quantity);
    }

    return combineLatest([this.roulette.loadPool$(format.id), this.roulette.loadCardMeta$(), this.roulette.loadCompetitiveContext$(format.id)]).pipe(
      switchMap(([pool, meta, competitive]) => {
        const matches = rankPoolDecks(userMainExtra, pool);
        if (matches.length === 0) return of(null);
        const planned = planPoolAdds(userBySection, matches, {
          main: Math.max(counts.mainGap, 0),
          extra: Math.max(counts.extraGap, 0),
          side: Math.max(counts.sideGap, 0),
        }, { meta, ...(competitive ? { competitive, staples: this.staplesFor(pool) } : {}) });
        if (planned.length === 0) return of(null);

        return this.ygoApi.getCardsByIds$(planned.map((a) => a.cardId), this.i18n.lang()).pipe(
          map((cards) => {
            const byId = new Map(cards.map((c) => [c.id, c]));
            const adds: DeckBuilderAdd[] = planned.flatMap((add) => {
              const card = byId.get(add.cardId);
              if (!card) return [];
              return [
                {
                  cardId: add.cardId,
                  name: card.name,
                  quantity: add.quantity,
                  type: card.type,
                  imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
                  section: add.section,
                  reason:
                    add.stapleShare !== undefined
                      ? this.i18n.t(add.section === 'side' ? 'decklist.completion.stapleSideReason' : 'decklist.completion.stapleExtraReason', {
                          pct: '' + Math.round(add.stapleShare * 100),
                          format: format.name[this.i18n.lang()],
                        })
                      : this.i18n.t('decklist.completion.poolReason', { count: '' + add.supportCount, deck: add.fromDeck }),
                },
              ];
            });
            if (adds.length === 0) return null;
            const best = matches[0];
            return {
              status: 'ready',
              identity: {
                hasIdentity: !!best.deck.archetype,
                archetypes: best.deck.archetype ? [best.deck.archetype] : [],
              },
              targetMain: options.targetMain,
              currentMain: counts.currentMain,
              currentExtra: counts.currentExtra,
              currentSide: counts.currentSide,
              adds,
              aiUsed: false,
              handStats: this.handStats(deck, adds, meta),
              ...(competitive ? { competitive: this.competitiveStats(deck, adds, competitive, pool) } : {}),
              poolSource: {
                deckName: best.deck.name,
                deckUrl: best.deck.url ?? null,
                coverage: best.coverage,
                matchedDecks: matches.length,
              },
            } satisfies DeckBuilderPlan;
          }),
        );
      }),
      catchError(() => of(null)),
    );
  }

  /** Competitive quality of the completed main deck vs the average tournament deck of the format. */
  private competitiveStats(
    deck: Decklist,
    adds: readonly DeckBuilderAdd[],
    ctx: CompetitiveContext,
    pool: readonly { source: string; main: readonly number[] }[],
  ): DeckBuilderCompetitiveStats | undefined {
    const main: number[] = [];
    for (const card of deck.cards) if (resolveDeckSection(card) === 'main') for (let i = 0; i < card.quantity; i++) main.push(card.id);
    for (const add of adds) if (add.section === 'main') for (let i = 0; i < add.quantity; i++) main.push(add.cardId);
    if (main.length < 40) return undefined;
    const pick = (s: ReturnType<typeof scoreDeck>) => ({ brickRate: s.brickRate, engineSynergy: s.synergy.inTurn, consistency: s.consistency, usage: s.usage });
    const own = pick(scoreDeck(main, ctx));
    return { ...own, reference: this.tournamentReference(pool, ctx) };
  }

  private readonly staplesCache = new WeakMap<object, FormatStaples>();

  /** Recurring Extra and Side Deck cards of the format, computed once per loaded pool. */
  private staplesFor(pool: readonly import('../../services/deck-roulette.service').RouletteDeck[]): FormatStaples {
    let staples = this.staplesCache.get(pool as object);
    if (!staples) {
      staples = buildFormatStaples(pool);
      this.staplesCache.set(pool as object, staples);
    }
    return staples;
  }

  private referenceCache = new WeakMap<object, DeckBuilderCompetitiveStats['reference']>();

  /** Average competitive measures of the format's tournament decks (cached per pool). */
  private tournamentReference(
    pool: readonly { source: string; main: readonly number[] }[],
    ctx: CompetitiveContext,
  ): DeckBuilderCompetitiveStats['reference'] {
    const cached = this.referenceCache.get(pool as object);
    if (cached !== undefined) return cached;
    const decks = pool.filter((d) => d.source === 'tournament' && d.main.length >= 40).slice(0, 120);
    let reference: DeckBuilderCompetitiveStats['reference'] = null;
    if (decks.length >= 10) {
      const total = { brickRate: 0, engineSynergy: 0, consistency: 0, usage: 0 };
      for (const d of decks) {
        const s = scoreDeck(d.main, ctx, { samples: 200 });
        total.brickRate += s.brickRate;
        total.engineSynergy += s.synergy.inTurn;
        total.consistency += s.consistency;
        total.usage += s.usage;
      }
      reference = {
        brickRate: total.brickRate / decks.length,
        engineSynergy: total.engineSynergy / decks.length,
        consistency: total.consistency / decks.length,
        usage: total.usage / decks.length,
      };
    }
    this.referenceCache.set(pool as object, reference);
    return reference;
  }

  private readonly knowledgeCache = new WeakMap<object, { staples: FormatStaples; stats: FormatCardStats }>();

  /** Pool, recurring cards and per-card copy statistics of the format, or null when the pool is too small to trust. */
  private formatKnowledge$(format: YgoFormat): Observable<FormatKnowledge | null> {
    return combineLatest([this.roulette.loadPool$(format.id), this.roulette.loadCardMeta$()]).pipe(
      map(([pool, meta]) => {
        if (pool.length < MIN_POOL_FOR_FORMAT_STATS) return null;
        let derived = this.knowledgeCache.get(pool as object);
        if (!derived) {
          derived = { staples: this.staplesFor(pool), stats: buildFormatCardStats(pool) };
          this.knowledgeCache.set(pool as object, derived);
        }
        return { pool, meta, ...derived };
      }),
    );
  }

  /**
   * Extra and Side Deck for a deck no pool deck resembles: the format's recurring cards, one copy in the
   * Extra Deck (the typical count) and the usual playset in the Side Deck. Extra Deck cards the main deck
   * cannot summon are demoted. Cards are hydrated from the API like any other plan.
   */
  private stapleSectionAdds$(
    deck: Decklist,
    format: YgoFormat,
    knowledge: FormatKnowledge,
    mainAdds: readonly DeckBuilderAdd[],
    gaps: { extra: number; side: number },
  ): Observable<DeckBuilderAdd[]> {
    const have = (section: 'extra' | 'side', cardId: number): number =>
      deck.cards.filter((c) => c.id === cardId && resolveDeckSection(c) === section).reduce((sum, c) => sum + c.quantity, 0);

    const mainCopies = new Map<number, number>();
    for (const card of deck.cards) if (resolveDeckSection(card) === 'main') mainCopies.set(card.id, (mainCopies.get(card.id) ?? 0) + card.quantity);
    for (const add of mainAdds) if (add.section === 'main') mainCopies.set(add.cardId, (mainCopies.get(add.cardId) ?? 0) + add.quantity);
    const monsters = buildMonsterPool(mainCopies, knowledge.meta);

    const planned: Array<{ cardId: number; section: 'extra' | 'side'; quantity: number; share: number }> = [];
    for (const section of ['extra', 'side'] as const) {
      const picks = selectStructuredSection({
        section,
        slots: [],
        gap: Math.max(gaps[section], 0),
        matchedSections: [],
        weights: [],
        staples: knowledge.staples[section],
        have: (cardId) => have(section, cardId),
        adjust: section === 'extra' ? (slot) => (isExtraReachable(knowledge.meta.get(slot.cardId), monsters) ? 1 : 0.35) : undefined,
        makeSlot: (cardId, copy, probability) => ({ cardId, copy, probability }),
      });
      for (const pick of picks) {
        const existing = planned.find((p) => p.cardId === pick.slot.cardId && p.section === section);
        if (existing) existing.quantity += 1;
        else planned.push({ cardId: pick.slot.cardId, section, quantity: 1, share: pick.staple?.share ?? 0 });
      }
    }
    if (planned.length === 0) return of([]);

    return this.ygoApi.getCardsByIds$(planned.map((p) => p.cardId), this.i18n.lang()).pipe(
      map((cards) => {
        const byId = new Map(cards.map((c) => [c.id, c]));
        return planned.flatMap((p): DeckBuilderAdd[] => {
          const card = byId.get(p.cardId);
          if (!card) return [];
          return [
            {
              cardId: p.cardId,
              name: card.name,
              quantity: p.quantity,
              type: card.type,
              imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
              section: p.section,
              reason: this.i18n.t(p.section === 'side' ? 'decklist.completion.stapleSideReason' : 'decklist.completion.stapleExtraReason', {
                pct: '' + Math.round(p.share * 100),
                format: format.name[this.i18n.lang()],
              }),
            },
          ];
        });
      }),
    );
  }

  /** Opening-hand odds of the main deck once the plan is applied (5-card hand, known-role cards only). */
  private handStats(deck: Decklist, adds: readonly DeckBuilderAdd[], meta: ReadonlyMap<number, CardMeta>): DeckBuilderHandStats | undefined {
    const main: Array<[number, number]> = [];
    for (const card of deck.cards) if (resolveDeckSection(card) === 'main') main.push([card.id, card.quantity]);
    for (const add of adds) if (add.section === 'main') main.push([add.cardId, add.quantity]);
    const mainSize = main.reduce((sum, [, qty]) => sum + qty, 0);
    if (mainSize < 40) return undefined;
    let starters = 0;
    let handTraps = 0;
    let known = 0;
    for (const [id, qty] of main) {
      const card = meta.get(id);
      if (!card) continue;
      known += qty;
      if (hasRole(card, 'starter')) starters += qty;
      if (hasRole(card, 'handtrap')) handTraps += qty;
    }
    if (known < mainSize * 0.5) return undefined;
    return {
      mainSize,
      starters,
      handTraps,
      starterOdds: hypergeometricAtLeastOne(mainSize, starters, 5),
      handTrapOdds: hypergeometricAtLeastOne(mainSize, handTraps, 5),
      knownCards: known,
    };
  }

  /** Analyzes the deck's OWN cards by functional role (starters/extenders/hand traps/GY
   *  recursion/removal/searchers) and proposes fills for thin roles from the same gated
   *  candidate pool as buildPlan$. */
  analyzeDeck$(deck: Decklist, format: YgoFormat): Observable<DeckAnalysis> {
    const uniqueCards = [...new Map(deck.cards.map((c) => [c.id, c])).values()];
    if (uniqueCards.length === 0) {
      return of({ status: 'empty_deck', roles: [], aiUsed: false });
    }

    return combineLatest([
      this.buildCandidatePool$(deck, format),
      this.ygoApi.getCardsByIds$(uniqueCards.map((c) => c.id), this.i18n.lang()),
    ]).pipe(
      switchMap(([pool, deckCardsFull]) => {
        const candidatePool = pool?.legalFacts ?? [];
        const deckCardsForAi = deckCardsFull.map((c) => ({ cardId: c.id, name: c.name, desc: c.desc }));
        return this.analysisAi
          .analyze$(deckCardsForAi, candidatePool, this.i18n.lang() === 'it' ? 'it' : 'en')
          .pipe(
            map((roles) => ({
              status: 'ready' as const,
              roles,
              aiUsed: roles.length > 0,
            })),
          );
      }),
    );
  }

  private buildCandidatePool$(deck: Decklist, format: YgoFormat): Observable<CandidatePool | null> {
    return combineLatest([this.catalogService.loadCatalog$(), this.cooccurrence.loadIndex$()]).pipe(
      switchMap(([catalog, cooccurrenceIndex]) => {
        const identity = buildDeckIdentity(deck.cards, catalog);
        const deckCardIds = new Set(deck.cards.map((c) => c.id));

        // Real co-occurrence feeds admissibility too, not just ranking within an
        // already-narrow archetype pool: a card genuinely played alongside deck cards in
        // real decks is admitted even with zero archetype/setcode overlap. This is what
        // lets the gate surface cross-archetype engine pieces/combo partners — safely,
        // because it's backed by real deckbuilding data, not text/name similarity.
        const cooccurrenceScores = new Map<number, number>();
        for (const deckCardId of deckCardIds) {
          for (const partner of cooccurrenceIndex[String(deckCardId)] ?? []) {
            if (deckCardIds.has(partner.id)) {
              continue;
            }
            const prev = cooccurrenceScores.get(partner.id) ?? 0;
            if (partner.weight > prev) {
              cooccurrenceScores.set(partner.id, partner.weight);
            }
          }
        }

        const admissible: GateCardFacts[] = [];
        for (const facts of catalog.values()) {
          if (deckCardIds.has(facts.id)) {
            continue;
          }
          if (facts.banTcg === 'Forbidden') {
            continue;
          }
          if (isAdmissible(facts, identity, cooccurrenceScores.get(facts.id) ?? 0)) {
            admissible.push(facts);
          }
        }

        const scored = admissible
          .map((facts) => ({ facts, score: cooccurrenceScores.get(facts.id) ?? 0 }))
          .sort((a, b) => b.score - a.score)
          .slice(0, CANDIDATE_POOL_SIZE);

        if (scored.length === 0) {
          return of(null);
        }

        const poolIds = scored.map((s) => s.facts.id);
        return this.ygoApi.getCardsByIds$(poolIds, this.i18n.lang()).pipe(
          switchMap((cards) =>
            this.cardLegality.evaluateMany$(cards, format).pipe(
              map((legality) => {
                const legalCards = cards.filter((c) => {
                  const verdict = legality.get(c.id)?.verdict;
                  return verdict === 'legal' || verdict === 'restricted';
                });
                const legalById = new Map(legalCards.map(c => [c.id, c]));
                // Preserve co-occurrence order even when the card API returns a different order.
                const legalFacts = scored.flatMap(({ facts }) => {
                  const card = legalById.get(facts.id);
                  return card ? [{ ...facts, desc: card.desc }] : [];
                });
                if (legalFacts.length === 0) {
                  return null;
                }
                return { identity, legalFacts, legality } satisfies CandidatePool;
              }),
            ),
          ),
        );
      }),
    );
  }

  private fillGaps(
    orderedFacts: readonly GateCardFacts[],
    deck: Decklist,
    legality: ReadonlyMap<number, { banlistStatus?: string | null; verdict?: string }>,
    reasonById: ReadonlyMap<number, string>,
    gaps: { main: number; extra: number; side: number },
    stats: FormatCardStats | null = null,
  ): DeckBuilderAdd[] {
    const adds: DeckBuilderAdd[] = [];
    const remaining = { ...gaps };
    const sectionsOrder: Array<'main' | 'extra' | 'side'> = ['main', 'extra', 'side'];

    for (const section of sectionsOrder) {
      if (remaining[section] <= 0) {
        continue;
      }
      for (const facts of orderedFacts) {
        if (remaining[section] <= 0) {
          break;
        }
        if (!canPlaceCardInSection(facts.type, section)) {
          continue;
        }
        const alreadyPlanned = adds
          .filter((a) => a.cardId === facts.id)
          .reduce((sum, a) => sum + a.quantity, 0);
        const inDeck = deck.cards
          .filter((c) => c.id === facts.id && resolveDeckSection(c) === section)
          .reduce((sum, c) => sum + c.quantity, 0);
        const banlistStatus = (legality.get(facts.id)?.banlistStatus ?? null) as
          | 'Forbidden'
          | 'Limited'
          | 'Semi-Limited'
          | null
          | undefined;
        const banlistMax = facts.isExtraDeck ? 1 : maxCopiesForStatus(banlistStatus);
        // main deck: the copies players usually run (a known card) or a cautious default (an off-meta card),
        // instead of the banlist maximum for every candidate
        const usage = section === 'main' && stats ? stats.main.get(facts.id) : undefined;
        const maxCopies = !stats || section !== 'main' ? banlistMax : Math.min(banlistMax, usage ? typicalCopies(usage) : UNKNOWN_MAIN_COPIES);
        const room = Math.max(0, maxCopies - inDeck - alreadyPlanned);
        const quantity = Math.min(room, remaining[section]);
        if (quantity <= 0) {
          continue;
        }
        adds.push({
          cardId: facts.id,
          name: facts.name,
          quantity,
          type: facts.type,
          imageUrlSmall: `https://images.ygoprodeck.com/images/cards_small/${facts.id}.jpg`,
          reason: reasonById.get(facts.id) ?? this.i18n.t('deckBuilder.reason.cooccurrence'),
          section,
        });
        remaining[section] -= quantity;
      }
    }

    return adds;
  }

  private summarizeDeck(deck: Decklist): string {
    return deck.cards.map((c) => `${c.quantity}x ${c.name}`).join('\n');
  }

  private emptyPlan(
    status: DeckBuilderPlan['status'],
    options: DeckBuilderOptions,
    currentMain: number,
    currentExtra: number,
    currentSide: number,
    identity?: { archetypes: ReadonlySet<string> },
  ): DeckBuilderPlan {
    return {
      status,
      identity: {
        hasIdentity: (identity?.archetypes.size ?? 0) > 0,
        archetypes: identity ? [...identity.archetypes] : [],
      },
      targetMain: options.targetMain,
      currentMain,
      currentExtra,
      currentSide,
      adds: [],
      aiUsed: false,
    };
  }
}
