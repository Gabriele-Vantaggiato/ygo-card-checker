import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { CardInfoResponse, YgoCard } from '../models/ygo-card.model';
import { Lang } from './i18n.service';

const API_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';

@Injectable({ providedIn: 'root' })
export class YgoApiService {
  private readonly searchCache = new Map<string, Observable<YgoCard[]>>();
  private readonly cardCache = new Map<string, Observable<YgoCard | null>>();

  constructor(private readonly http: HttpClient) {}

  searchCards$(query: string, lang: Lang): Observable<YgoCard[]> {
    const cacheKey = `${lang}:${query.trim().toLowerCase()}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let params = new HttpParams()
      .set('fname', query.trim())
      .set('misc', 'yes')
      .set('num', '10')
      .set('offset', '0');

    if (lang === 'it') {
      params = params.set('language', 'it');
    }

    const request$ = this.http.get<CardInfoResponse>(API_BASE, { params }).pipe(
      map((response) => response.data ?? []),
      catchError(() => of([] as YgoCard[])),
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
