import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { LegalityResult, YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';
import { AdvancedCardSearchFilters } from '../models/card-search-filters.model';
import { Lang } from './i18n.service';
import { CardLegalityFacade } from './card-legality.facade';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { CardSearchIndexService, matchesAdvancedFilters } from './card-search-index.service';
import { YgoApiService } from './ygo-api.service';

export interface CardSearchPage {
  cards: YgoCard[];
  totalRows: number;
  hasMore: boolean;
}

@Injectable({ providedIn: 'root' })
export class CardSearchFacade {
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly searchIndex = inject(CardSearchIndexService);
  private readonly knowledgeIndex = inject(CardKnowledgeIndexService);

  evaluateLegality$(
    cards: readonly YgoCard[],
    format: YgoFormat,
  ): Observable<Map<number, LegalityResult>> {
    if (cards.length === 0) {
      return of(new Map());
    }
    return this.cardLegality.evaluateMany$(cards, format);
  }

  browseFormat$(
    formatId: string,
    lang: Lang,
    limit: number,
    offset: number,
  ): Observable<CardSearchPage> {
    return this.searchIndex.loadIndex$().pipe(
      switchMap((entries) =>
        this.knowledgeIndex.formatLegality$.pipe(
          switchMap((legality) => {
            const idSet = new Set<number>();
            if (legality?.playable) {
              for (const [idStr, formats] of Object.entries(legality.playable)) {
                if (formats.includes(formatId)) idSet.add(Number(idStr));
              }
            }
            const ids = this.searchIndex.sortIdsWithin(entries, idSet);
            return this.hydratePage$(ids, lang, limit, offset);
          }),
        ),
      ),
    );
  }

  /**
   * Combined name+effect search: the name side goes through the live YGOPRODeck
   * API (IT/EN-aware — the local index only carries English names), the effect
   * side through the local search index; results are merged and deduped.
   */
  searchCombined$(
    query: string,
    filters: AdvancedCardSearchFilters,
    lang: Lang,
    limit: number,
    offset: number,
  ): Observable<CardSearchPage> {
    const trimmed = query.trim();
    const nameMatches$ = trimmed ? this.ygoApi.searchCards$(trimmed, lang) : of([] as YgoCard[]);

    return combineLatest([nameMatches$, this.searchIndex.loadIndex$()]).pipe(
      switchMap(([nameCards, entries]) => {
        const nameIds = nameCards
          .filter((c) => matchesAdvancedFilters(c, filters))
          .map((c) => c.id);
        const localIds = this.searchIndex.filterIndex(entries, trimmed, filters);
        const mergedIds = new Set<number>([...nameIds, ...localIds]);
        const ids = this.searchIndex.sortIdsWithin(entries, mergedIds);
        return this.hydratePage$(ids, lang, limit, offset);
      }),
    );
  }

  /**
   * Live, name-only search for as-you-type filtering: the live YGOPRODeck API
   * (IT/EN-aware), with active filters applied client-side. No local index —
   * effect-text matching only happens via `searchCombined$` on explicit submit.
   */
  searchByName$(
    query: string,
    filters: AdvancedCardSearchFilters,
    lang: Lang,
    limit: number,
    offset: number,
  ): Observable<CardSearchPage> {
    const trimmed = query.trim();
    if (!trimmed) {
      return of({ cards: [] as YgoCard[], totalRows: 0, hasMore: false });
    }
    return this.ygoApi.searchCards$(trimmed, lang).pipe(
      map((cards) => {
        const matched = cards
          .filter((c) => matchesAdvancedFilters(c, filters))
          .sort((a, b) => a.name.localeCompare(b.name));
        const totalRows = matched.length;
        const page = matched.slice(offset, offset + limit);
        const hasMore = offset + limit < totalRows;
        return { cards: page, totalRows, hasMore };
      }),
    );
  }

  private hydratePage$(
    ids: readonly number[],
    lang: Lang,
    limit: number,
    offset: number,
  ): Observable<CardSearchPage> {
    const pageIds = ids.slice(offset, offset + limit);
    const totalRows = ids.length;
    const hasMore = offset + limit < totalRows;
    if (pageIds.length === 0) {
      return of({ cards: [] as YgoCard[], totalRows, hasMore });
    }
    return this.ygoApi.getCardsByIds$(pageIds, lang).pipe(
      map((cards) => {
        const byId = new Map(cards.map((c) => [c.id, c]));
        const ordered = pageIds.map((id) => byId.get(id)).filter((c): c is YgoCard => !!c);
        return { cards: ordered, totalRows, hasMore };
      }),
    );
  }
}
