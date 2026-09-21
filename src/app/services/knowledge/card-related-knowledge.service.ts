import { isPlayableInFormat } from '../../utils/format-legality.utils';
import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';
import {
  CardKnowledgeRelated,
  CardRelatedResult,
} from '../../models/card-knowledge.model';
import { YgoCard } from '../../models/ygo-card.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { toDisplayTags } from '../../utils/knowledge-display.utils';
import { CardLegalityFacade } from '../card-legality.facade';
import { CardKnowledgeIndexService } from '../card-knowledge-index.service';
import { SynergyRetrievalService } from '../synergy-retrieval.service';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import { I18nService } from '../i18n.service';
import { CardDecisionService } from '../decision/card-decision.service';
import {
  applyStrategyToSuggestions,
  filterSuggestions$,
  groupSuggestions,
  toSuggestion,
} from './card-knowledge-shared';

const MAX_CARD_RELATED_SUGGESTIONS = 120;

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
export class CardRelatedKnowledgeService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly i18n = inject(I18nService);
  private readonly strategy = inject(DeckStrategyStore);
  private readonly synergyRetrieval = inject(SynergyRetrievalService);
  private readonly decision = inject(CardDecisionService);

  private readonly index$ = this.indexService.related$;
  private readonly formatLegality$ = this.indexService.formatLegality$;

  findRelated$(card: YgoCard, format: YgoFormat): Observable<CardRelatedResult> {
    return combineLatest([this.index$, this.formatLegality$, this.strategy.ragResult$, this.decision.preferences$]).pipe(
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

        const allowed = formatIndex?.formats.includes(format.id) ? (id: number) => isPlayableInFormat(formatIndex, id, format.id) : null;
        const excludeIds = new Set([card.id]);
        return this.synergyRetrieval
          .retrieve$(card.id, rag.profile, excludeIds, { limit: MAX_CARD_RELATED_SUGGESTIONS, isPlayable: id => allowed?.(id) ?? true })
          .pipe(
            switchMap((mergedRelated) => {
              if (mergedRelated.length === 0) {
                return of({ ...base, suggestions: [], groups: [] });
              }

              return filterSuggestions$(
                mergedRelated,
                format,
                formatIndex,
                (related) => this.toSuggestion(related, card.name),
                this.cardLegality,
              ).pipe(
                switchMap((suggestions) => {
                  const scored = applyStrategyToSuggestions(
                    suggestions,
                    index.entries,
                    rag.profile,
                    'main',
                  );
                  return this.decision.rank$(
                    this.decision.preferences().prompt || `${card.name}. ${card.desc}`,
                    scored.map(s => ({ cardId: s.cardId, text: [s.name, s.archetype,
                      ...(index.entries[String(s.cardId)]?.tags ?? []).map(t => t.replaceAll('_', ' ')),
                    ].filter(Boolean).join('. ') })),
                  ).pipe(map(ranked => {
                    const order = new Map(ranked.map((item, i) => [item.cardId, i]));
                    const ordered = ranked.length
                      ? [...scored].sort((a, b) => (order.get(a.cardId) ?? 999) - (order.get(b.cardId) ?? 999))
                      : scored;
                    return { ...base, suggestions: ordered, groups: groupSuggestions(ordered) };
                  }), startWith({ ...base, suggestions: scored, groups: groupSuggestions(scored) }));
                }),
              );
            }),
          );
      }),
    );
  }

  private toSuggestion(related: CardKnowledgeRelated, sourceName: string) {
    return toSuggestion(related, sourceName, (key) => this.i18n.t(key));
  }
}
