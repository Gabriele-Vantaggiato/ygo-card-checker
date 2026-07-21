import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { BanlistStatus } from '../models/ygo-format.model';
import { YgoCard } from '../models/ygo-card.model';
import { Lang } from './i18n.service';

export interface PasscodeCatalogEntry {
  /** passcode */
  i: number;
  /** EN name (YGOPRODeck default) */
  n: string;
  /** type */
  t: string;
  /** ban_tcg if present */
  b?: BanlistStatus;
}

interface PasscodeCatalogFile {
  v: number;
  cards: PasscodeCatalogEntry[];
}

/**
 * Portable O(1) passcode index shipped as JSON (~0.9MB).
 * Used to paint a stub card instantly before the language-aware API returns.
 */
@Injectable({ providedIn: 'root' })
export class PasscodeCatalogService {
  private readonly http = inject(HttpClient);
  private map: Map<number, PasscodeCatalogEntry> | null = null;
  private readonly load$ = this.http.get<PasscodeCatalogFile>('/assets/data/passcode-catalog.json').pipe(
    map((file) => {
      const m = new Map<number, PasscodeCatalogEntry>();
      for (const row of file.cards ?? []) {
        m.set(row.i, row);
      }
      this.map = m;
      return m;
    }),
    catchError(() => {
      this.map = new Map();
      return of(this.map);
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /** Warm the catalog (call when opening /overlay). */
  ensureLoaded$(): Observable<Map<number, PasscodeCatalogEntry>> {
    if (this.map) {
      return of(this.map);
    }
    return this.load$;
  }

  get(id: number): PasscodeCatalogEntry | null {
    return this.map?.get(id) ?? null;
  }

  /**
   * Build a displayable stub. Name is EN from catalog until API fills UI lang.
   * Images use the public YGOPRODeck CDN (passcode-addressable).
   */
  toStubCard(id: number, lang: Lang): YgoCard | null {
    const entry = this.get(id);
    const name = entry?.n ?? (lang === 'it' ? `Carta ${id}` : `Card ${id}`);
    const type = entry?.t ?? '';
    return {
      id,
      name,
      type,
      desc: '',
      race: undefined,
      attribute: undefined,
      level: undefined,
      atk: undefined,
      def: undefined,
      archetype: undefined,
      card_images: [
        {
          id,
          image_url: `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
          image_url_small: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
        },
      ],
      banlist_info: entry?.b ? { ban_tcg: entry.b } : undefined,
    };
  }
}
