import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { defaultIfEmpty, map, switchMap } from 'rxjs/operators';
import { LegalityResult, YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';
import { Lang } from './i18n.service';
import { CardLegalityFacade } from './card-legality.facade';
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

  searchAutocomplete$(query: string, lang: Lang): Observable<YgoCard[]> {
    return this.ygoApi.searchCards$(query, lang).pipe(defaultIfEmpty([] as YgoCard[]));
  }

  searchPage$(
    query: string,
    lang: Lang,
    limit: number,
    offset: number,
  ): Observable<CardSearchPage> {
    return this.ygoApi.searchCardsPage$(query, lang, limit, offset);
  }

  evaluateLegality$(
    cards: readonly YgoCard[],
    format: YgoFormat,
  ): Observable<Map<number, LegalityResult>> {
    if (cards.length === 0) {
      return of(new Map());
    }
    return this.cardLegality.evaluateMany$(cards, format);
  }

  searchWithLegality$(
    query: string,
    lang: Lang,
    format: YgoFormat,
  ): Observable<{ cards: YgoCard[]; legality: Map<number, LegalityResult> }> {
    return this.searchAutocomplete$(query, lang).pipe(
      switchMap((cards) =>
        this.evaluateLegality$(cards, format).pipe(
          map((legality) => ({ cards, legality })),
        ),
      ),
    );
  }
}
