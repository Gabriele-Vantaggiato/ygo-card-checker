import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Decklist, maxCopiesForStatus } from '../../models/decklist.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { YgoApiService } from '../../services/ygo-api.service';
import { CardLegalityFacade } from '../../services/card-legality.facade';
import { I18nService } from '../../services/i18n.service';
import { splitDeckSections, sectionCardCount } from '../../utils/deck-card.utils';
import { canPlaceCardInSection } from '../../utils/deck-section.utils';
import { TARGET_EXTRA } from '../../utils/deck-role-tier.utils';
import { resolveDeckSection } from '../../services/ydke.service';
import { buildDeckIdentity, isAdmissible, GateCardFacts } from './deck-builder-gate.util';
import { DeckBuilderCatalogService } from './deck-builder-catalog.service';
import { DeckCooccurrenceService } from './deck-cooccurrence.service';
import { DeckBuilderAiService } from './deck-builder-ai.service';
import { DeckBuilderAdd, DeckBuilderOptions, DeckBuilderPlan } from './deck-builder.model';

/** How many of the strongest co-occurrence candidates get hydrated + sent to the LLM.
 *  Bounds API calls (both YGOPRODeck batch fetch and the single Gemini call). */
const CANDIDATE_POOL_SIZE = 60;

@Injectable({ providedIn: 'root' })
export class DeckBuilderService {
  private readonly catalogService = inject(DeckBuilderCatalogService);
  private readonly cooccurrence = inject(DeckCooccurrenceService);
  private readonly ai = inject(DeckBuilderAiService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly i18n = inject(I18nService);

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
          return of(this.emptyPlan('no_candidates', options, currentMain, currentExtra, currentSide, identity));
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
                return { legalCards, legality, factsById: new Map(scored.map((s) => [s.facts.id, s.facts])) };
              }),
            ),
          ),
          switchMap(({ legalCards, legality, factsById }) => {
            if (legalCards.length === 0) {
              return of(this.emptyPlan('no_candidates', options, currentMain, currentExtra, currentSide, identity));
            }
            const legalFacts = legalCards
              .map((c) => factsById.get(c.id))
              .filter((f): f is GateCardFacts => !!f);
            const deckSummary = this.summarizeDeck(deck);

            return this.ai.rank$(legalFacts, deckSummary, this.i18n.lang() === 'it' ? 'it' : 'en').pipe(
              map((suggestions) => {
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

                const adds = this.fillGaps(
                  orderedFacts,
                  deck,
                  legality,
                  reasonById,
                  { main: mainGap, extra: extraGap, side: sideGap },
                );

                return {
                  status: adds.length > 0 ? 'ready' : 'no_candidates',
                  identity: { hasIdentity: identity.archetypes.size > 0, archetypes: [...identity.archetypes] },
                  targetMain: options.targetMain,
                  currentMain,
                  currentExtra,
                  currentSide,
                  adds,
                  aiUsed,
                } satisfies DeckBuilderPlan;
              }),
            );
          }),
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
        const maxCopies = facts.isExtraDeck ? 1 : maxCopiesForStatus(banlistStatus);
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
