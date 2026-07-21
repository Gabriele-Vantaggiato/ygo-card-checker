import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
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
  private readonly batchCache = new Map<string, Observable<YgoCard[]>>();

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
    const trimmed = query.trim();
    const cacheKey = `${lang}:${trimmed.toLowerCase()}:${limit}:${offset}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = this.fetchSearchPage$(trimmed, lang, limit, offset).pipe(
      switchMap((page) => {
        // IT fname with EN spelling often 400s → []; fall back to EN once.
        // Do not leave a permanent empty cache for a recoverable miss.
        if (page.cards.length > 0 || lang !== 'it' || offset > 0) {
          return of(page);
        }
        return this.fetchSearchPage$(trimmed, 'en', limit, offset);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.searchCache.set(cacheKey, request$);
    return request$;
  }

  private fetchSearchPage$(
    query: string,
    lang: Lang,
    limit: number,
    offset: number,
  ): Observable<CardSearchPage> {
    let params = new HttpParams()
      .set('fname', query)
      .set('misc', 'yes')
      .set('num', String(limit))
      .set('offset', String(offset));

    if (lang === 'it') {
      params = params.set('language', 'it');
    }

    return this.http.get<CardInfoResponse>(API_BASE, { params }).pipe(
      map((response) => {
        const cards = response.data ?? [];
        const totalRows = response.meta?.total_rows ?? cards.length;
        return {
          cards,
          totalRows,
          hasMore: offset + cards.length < totalRows,
        };
      }),
      // Empty page on error — caller may fall back; not cached alone.
      catchError(() => of({ cards: [] as YgoCard[], totalRows: 0, hasMore: false })),
    );
  }

  getCardById$(id: number, lang: Lang): Observable<YgoCard | null> {
    const cacheKey = `id:${lang}:${id}`;
    const cached = this.cardCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = this.fetchCardsByIds$([id], lang).pipe(
      map((cards) => cards[0] ?? null),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.cardCache.set(cacheKey, request$);
    return request$;
  }

  getCardsByIds$(ids: readonly number[], lang: Lang): Observable<YgoCard[]> {
    return this.fetchCardsByIds$(ids, lang);
  }

  resolveCardByName$(name: string, primaryLang: Lang): Observable<YgoCard | null> {
    const trimmed = name.trim();
    if (!trimmed) {
      return of(null);
    }

    const secondaryLang: Lang = primaryLang === 'it' ? 'en' : 'it';
    return this.searchCards$(trimmed, primaryLang, 20).pipe(
      switchMap((cards) => {
        const match = findExactNameMatch(cards, trimmed);
        if (match) {
          return of(match);
        }
        return this.searchCards$(trimmed, secondaryLang, 20).pipe(
          map((fallbackCards) => findExactNameMatch(fallbackCards, trimmed)),
        );
      }),
    );
  }

  private fetchCardsByIds$(ids: readonly number[], lang: Lang): Observable<YgoCard[]> {
    const uniqueIds = [...new Set(ids.filter((id) => id > 0))];
    if (uniqueIds.length === 0) {
      return of([]);
    }

    const chunkSize = 25;
    const chunks: number[][] = [];
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      chunks.push(uniqueIds.slice(i, i + chunkSize));
    }

    const requests = chunks.map((chunk) => {
      const cacheKey = `batch:${lang}:${chunk.join(',')}`;
      const cached = this.batchCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      let params = new HttpParams().set('id', chunk.join(',')).set('misc', 'yes');
      if (lang === 'it') {
        params = params.set('language', 'it');
      }

      const request$ = this.http.get<CardInfoResponse>(API_BASE, { params }).pipe(
        map((response) => response.data ?? []),
        catchError(() => of([] as YgoCard[])),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

      this.batchCache.set(cacheKey, request$);
      return request$;
    });

    return forkJoin(requests).pipe(map((pages) => pages.flat()));
  }
}

function findExactNameMatch(cards: readonly YgoCard[], name: string): YgoCard | null {
  const normalized = name.trim().toLowerCase();
  const matches = cards.filter((card) => card.name.trim().toLowerCase() === normalized);
  return matches[0] ?? null;
}
