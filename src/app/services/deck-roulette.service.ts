import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { CardMeta, CardMetaTuple, metaMapFromRecord } from '../utils/card-meta.utils';
import { CompetitiveContext, CompetitiveScore, SynergyLink, scoreDeck } from '../utils/competitive-score.utils';
import { FORMAT_BANNED_MECHANICS, Mechanic } from '../utils/format-mechanics.utils';
import { ydkeSectionsToUrl } from './ydke.service';

export type RouletteDeckSource = 'tournament' | 'community' | 'tf5' | 'archetype';
export type RouletteMechanic = Mechanic;

export interface RouletteDeck {
  id: string;
  name: string;
  source: RouletteDeckSource;
  coverCardId: number | null;
  url?: string;
  mechanics?: RouletteMechanic[];
  archetype?: string | null;
  keyCards?: string[];
  /** Tournament decks: final placement, event date (YYYY-MM-DD) and number of players. */
  placement?: number | null;
  eventDate?: string | null;
  eventSize?: number | null;
  main: number[];
  extra: number[];
  side: number[];
}

export interface RouletteFilters {
  query: string;
  archetype: string | null;
  source: RouletteDeckSource | null;
}

export const EMPTY_ROULETTE_FILTERS: RouletteFilters = { query: '', archetype: null, source: null };

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Every whitespace-separated term must match the name, archetype, key cards or source of the deck. */
export function filterRouletteDecks(pool: readonly RouletteDeck[], filters: RouletteFilters): RouletteDeck[] {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);
  return pool.filter((deck) => {
    if (filters.archetype && deck.archetype !== filters.archetype) return false;
    if (filters.source && deck.source !== filters.source) return false;
    if (terms.length === 0) return true;
    const haystack = normalize([deck.name, deck.archetype ?? '', ...(deck.keyCards ?? [])].join(' | '));
    return terms.every((term) => haystack.includes(term));
  });
}

/** Archetypes present in the pool with their deck count, most represented first. */
export function listRouletteArchetypes(pool: readonly RouletteDeck[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const deck of pool) {
    if (deck.archetype) counts.set(deck.archetype, (counts.get(deck.archetype) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

interface RoulettePoolFile {
  version: number;
  formatId: string;
  decks: RouletteDeck[];
}

const DRAWN_KEY_PREFIX = 'ygo-checker-roulette-drawn-';

/** Formats the competitive deck model is tuned and validated for (tournament pools with enough decks). */
export const COMPETITIVE_FORMATS: readonly string[] = ['hat', 'edison'];

/**
 * Draws a random deck from a curated, per-format pool of real decks. Coherence comes from the data
 * (hand-built decks re-validated against our legality data by scripts/build-deck-roulette-pool.mjs),
 * not from card-by-card generation. Already-drawn decks are skipped until the pool is exhausted.
 */
@Injectable({ providedIn: 'root' })
export class DeckRouletteService {
  private readonly http = inject(HttpClient);
  private readonly pools = new Map<string, Observable<RouletteDeck[]>>();
  private cardMeta$: Observable<Map<number, CardMeta>> | null = null;
  private synergy$: Observable<Map<number, readonly SynergyLink[]>> | null = null;
  private usage$: Observable<Record<string, Record<string, number>>> | null = null;

  loadPool$(formatId: string): Observable<RouletteDeck[]> {
    let pool$ = this.pools.get(formatId);
    if (!pool$) {
      pool$ = this.http.get<RoulettePoolFile>(`/assets/data/deck-roulette/${formatId}.json`).pipe(
        map((file) => (file.decks ?? []).filter((deck) => this.isAllowedInFormat(deck, formatId))),
        catchError(() => of([] as RouletteDeck[])),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.pools.set(formatId, pool$);
    }
    return pool$;
  }

  /** Roles and Extra Deck facts for every card that appears in the pool. Empty map if unavailable. */
  loadCardMeta$(): Observable<Map<number, CardMeta>> {
    this.cardMeta$ ??= this.http
      .get<{ cards: Record<string, CardMetaTuple> }>('/assets/data/deck-roulette/cards.json')
      .pipe(
        map((file) => metaMapFromRecord(file.cards ?? {})),
        catchError(() => of(new Map<number, CardMeta>())),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.cardMeta$;
  }

  /**
   * Card flags, typed card links and tournament usage for one format, or null when the competitive model
   * is not available for it (formats outside COMPETITIVE_FORMATS, or data missing).
   */
  loadCompetitiveContext$(formatId: string): Observable<CompetitiveContext | null> {
    if (!COMPETITIVE_FORMATS.includes(formatId)) return of(null);
    this.synergy$ ??= this.http
      .get<{ links: Record<string, SynergyLink[]> }>('/assets/data/deck-roulette/synergy.json')
      .pipe(
        map((file) => new Map(Object.entries(file.links ?? {}).map(([id, row]) => [Number(id), row as readonly SynergyLink[]]))),
        catchError(() => of(new Map<number, readonly SynergyLink[]>())),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.usage$ ??= this.http.get<{ usage: Record<string, Record<string, number>> }>('/assets/data/deck-roulette/usage.json').pipe(
      map((file) => file.usage ?? {}),
      catchError(() => of({} as Record<string, Record<string, number>>)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return combineLatest([this.loadCardMeta$(), this.synergy$, this.usage$]).pipe(
      map(([meta, links, usageAll]) => {
        const row = usageAll[formatId];
        if (meta.size === 0 || !row || Object.keys(row).length === 0) return null;
        return { meta, links, usage: new Map(Object.entries(row).map(([id, v]) => [Number(id), v])) };
      }),
    );
  }

  /** Competitive score of every pool deck (main deck only), by deck id. */
  scoreDecks(pool: readonly RouletteDeck[], ctx: CompetitiveContext): Map<string, CompetitiveScore> {
    return new Map(pool.map((deck) => [deck.id, scoreDeck(deck.main, ctx, { samples: 250 })]));
  }

  /** Picks a random deck not drawn before; once every deck was drawn the history resets. */
  draw(formatId: string, pool: readonly RouletteDeck[], random: () => number = Math.random): RouletteDeck | null {
    if (pool.length === 0) return null;
    let drawn = this.readDrawn(formatId).filter((id) => pool.some((d) => d.id === id));
    if (drawn.length >= pool.length) drawn = [];
    const fresh = pool.filter((d) => !drawn.includes(d.id));
    const pick = fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
    this.writeDrawn(formatId, [...drawn, pick.id]);
    return pick;
  }

  /** A deck is allowed unless it uses a mechanic the format predates (e.g. Pendulum in HAT). */
  isAllowedInFormat(deck: Pick<RouletteDeck, 'mechanics'>, formatId: string): boolean {
    const banned = FORMAT_BANNED_MECHANICS[formatId] ?? [];
    return !(deck.mechanics ?? []).some((mechanic) => banned.includes(mechanic));
  }

  resetHistory(formatId: string): void {
    this.writeDrawn(formatId, []);
  }

  toYdkeUrl(deck: Pick<RouletteDeck, 'main' | 'extra' | 'side'>): string {
    return ydkeSectionsToUrl({ main: deck.main, extra: deck.extra, side: deck.side });
  }

  private readDrawn(formatId: string): string[] {
    try {
      const raw = localStorage.getItem(DRAWN_KEY_PREFIX + formatId);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  private writeDrawn(formatId: string, ids: string[]): void {
    try {
      localStorage.setItem(DRAWN_KEY_PREFIX + formatId, JSON.stringify(ids));
    } catch {
      // private mode: history just isn't persisted
    }
  }
}
