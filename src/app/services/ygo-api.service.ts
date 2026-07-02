import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { CardInfoResponse, YgoCard } from '../models/ygo-card.model';
import { Lang } from './i18n.service';

const API_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const DEFAULT_SEARCH_LIMIT = 50;

export interface CardSearchPage {
  cards: YgoCard[];
  totalRows: number;
  hasMore: boolean;
}

@Injectable({ providedIn: 'root' })
export class YgoApiService {
  private readonly searchCache = new Map<string, Observable<CardSearchPage>>();
  private readonly cardCache = new Map<string, Observable<YgoCard | null>>();

  constructor(private readonly http: HttpClient) {}

  searchCards$(query: string, lang: Lang, limit = DEFAULT_SEARCH_LIMIT): Observable<YgoCard[]> {
    return this.searchCardsPage$(query, lang, limit).pipe(map((page) => page.cards));
  }

  searchCardsPage$(
    query: string,
    lang: Lang,
    limit = DEFAULT_SEARCH_LIMIT,
    offset = 0,
  ): Observable<CardSearchPage> {
    const cacheKey = `${lang}:${query.trim().toLowerCase()}:${limit}:${offset}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let params = new HttpParams()
      .set('fname', query.trim())
      .set('misc', 'yes')
      .set('num', String(limit))
      .set('offset', String(offset));

    if (lang === 'it') {
      params = params.set('language', 'it');
    }

    const request$ = this.http.get<CardInfoResponse>(API_BASE, { params }).pipe(
      map((response) => {
        const cards = response.data ?? [];
        const totalRows = response.meta?.total_rows ?? cards.length;
        return {
          cards,
          totalRows,
          hasMore: offset + cards.length < totalRows,
        };
      }),
      catchError(() =>
        of({ cards: [] as YgoCard[], totalRows: 0, hasMore: false }),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.searchCache.set(cacheKey, request$);
    return request$;
  }

  getCardById$(id: number, lang: Lang): Observable<YgoCard | null> {
    const cacheKey = `id:${lang}:${id}`;
    const cached = this.cardCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let params = new HttpParams().set('id', String(id)).set('misc', 'yes');
    if (lang === 'it') {
      params = params.set('language', 'it');
    }

    const request$ = this.http.get<CardInfoResponse>(API_BASE, { params }).pipe(
      map((response) => response.data?.[0] ?? null),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.cardCache.set(cacheKey, request$);
    return request$;
  }
}
