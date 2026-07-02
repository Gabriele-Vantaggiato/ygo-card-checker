import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { BanlistSnapshot, BanlistStatus } from '../models/ygo-format.model';

@Injectable({ providedIn: 'root' })
export class BanlistService {
  private readonly cache = new Map<string, Observable<BanlistSnapshot>>();

  constructor(private readonly http: HttpClient) {}

  loadBanlist$(banlistId: string): Observable<BanlistSnapshot> {
    const cached = this.cache.get(banlistId);
    if (cached) {
      return cached;
    }

    const request$ = this.http
      .get<BanlistSnapshot>(`/assets/data/banlists/${banlistId}.json`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));

    this.cache.set(banlistId, request$);
    return request$;
  }

  getStatus(snapshot: BanlistSnapshot, cardId: number, cardName: string): BanlistStatus {
    const byId = snapshot.cards?.[String(cardId)];
    if (byId) {
      return byId;
    }

    const normalized = this.normalizeName(cardName);
    return snapshot.nameIndex?.[normalized] ?? 'Unlimited';
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}
