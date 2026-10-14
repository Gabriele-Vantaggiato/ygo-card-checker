import type { RouletteDeck } from '../services/deck-roulette.service';

/**
 * Recurring cards of a format: cards that many different decks of the format play in the same section
 * (Extra Deck or Side Deck), regardless of archetype. Computed from the tournament pool itself, so it
 * follows the pool when it is refreshed and never needs its own data file.
 */
export type StapleSection = 'extra' | 'side';

export interface StapleEntry {
  cardId: number;
  /** Share of the format's decks that play the card in this section, 0..1. */
  share: number;
  /** copyShare[k-1] = share of the format's decks that play at least k copies in this section (k = 1..3). */
  copyShare: readonly [number, number, number];
  /** Distinct archetypes that play it. */
  archetypes: number;
}

export type FormatStaples = Readonly<Record<StapleSection | 'main', ReadonlyMap<number, StapleEntry>>>;

export interface StapleOptions {
  /** Minimum share of decks playing the card in the section. */
  minShare?: number;
  /** Minimum number of distinct archetypes playing it (filters archetype-specific cards). */
  minArchetypes?: number;
  /** Keep at most this many staples per section, most played first. */
  top?: number;
}

const DEFAULTS = { minShare: 0.12, minArchetypes: 5, top: 50 } as const;

function sectionOf(deck: RouletteDeck, section: StapleSection | 'main'): readonly number[] {
  return section === 'extra' ? deck.extra : section === 'main' ? deck.main : deck.side;
}

export function buildFormatStaples(pool: readonly RouletteDeck[], options: StapleOptions = {}): FormatStaples {
  const { minShare, minArchetypes, top } = { ...DEFAULTS, ...options };
  const decks = pool.length;
  const result = {} as Record<StapleSection | 'main', Map<number, StapleEntry>>;
  for (const section of ['main', 'extra', 'side'] as const) {
    const playing = new Map<number, number[]>();
    const archetypes = new Map<number, Set<string>>();
    for (const deck of pool) {
      const counts = new Map<number, number>();
      for (const id of sectionOf(deck, section)) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, qty] of counts) {
        const list = playing.get(id) ?? [];
        list.push(qty);
        playing.set(id, list);
        const set = archetypes.get(id) ?? new Set<string>();
        set.add(deck.archetype ?? deck.name);
        archetypes.set(id, set);
      }
    }
    const entries: StapleEntry[] = [];
    for (const [cardId, qtys] of playing) {
      const share = qtys.length / Math.max(decks, 1);
      const distinct = archetypes.get(cardId)?.size ?? 0;
      if (share < minShare || distinct < minArchetypes) continue;
      const atLeast = (k: number) => qtys.filter((q) => q >= k).length / Math.max(decks, 1);
      entries.push({ cardId, share, copyShare: [atLeast(1), atLeast(2), atLeast(3)], archetypes: distinct });
    }
    entries.sort((a, b) => b.share - a.share || a.cardId - b.cardId);
    result[section] = new Map(entries.slice(0, top).map((entry) => [entry.cardId, entry]));
  }
  return result;
}

/** Share of a deck's section copies that are format staples, 0..1 (0 for an empty section). */
export function stapleShareOf(cards: readonly number[], staples: ReadonlyMap<number, StapleEntry>): number {
  if (cards.length === 0) return 0;
  return cards.filter((id) => staples.has(id)).length / cards.length;
}

/** Usage of every card of the format in one section, not only the recurring ones. */
export interface CardUsage {
  share: number;
  copyShare: readonly [number, number, number];
}
export type FormatCardStats = Readonly<Record<'main' | 'extra' | 'side', ReadonlyMap<number, CardUsage>>>;

/** Per-card usage and copy distribution of every section, from the pool's decks. */
export function buildFormatCardStats(pool: readonly RouletteDeck[]): FormatCardStats {
  const decks = Math.max(pool.length, 1);
  const out = {} as Record<'main' | 'extra' | 'side', Map<number, CardUsage>>;
  for (const section of ['main', 'extra', 'side'] as const) {
    const playing = new Map<number, number[]>();
    for (const deck of pool) {
      const counts = new Map<number, number>();
      for (const id of deck[section]) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, qty] of counts) playing.set(id, [...(playing.get(id) ?? []), qty]);
    }
    const map = new Map<number, CardUsage>();
    for (const [id, qtys] of playing) {
      const atLeast = (k: number) => qtys.filter((q) => q >= k).length / decks;
      map.set(id, { share: qtys.length / decks, copyShare: [atLeast(1), atLeast(2), atLeast(3)] });
    }
    out[section] = map;
  }
  return out;
}

/** The number of copies players usually run: the largest k that at least half of the decks playing the card reach. */
export function typicalCopies(usage: CardUsage): number {
  const [one, two, three] = usage.copyShare;
  if (one <= 0) return 1;
  if (three >= 0.5 * one) return 3;
  if (two >= 0.5 * one) return 2;
  return 1;
}
