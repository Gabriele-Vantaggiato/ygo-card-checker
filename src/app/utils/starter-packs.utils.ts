import type { RouletteDeck } from '../services/deck-roulette.service';
import { CardMeta, KIND } from './card-meta.utils';

/**
 * Starter packs for players who do not have a deck yet: three cards that open one real competitive archetype
 * of the format. The three cards become the seed of the wave-by-wave completion, which raises them to a
 * playset and builds the rest of the deck around them.
 */

export interface SeedCard {
  cardId: number;
  /** Share (0..1) of the archetype's decks that play the card in the main deck. */
  share: number;
  /** How much more the archetype plays it than the whole format (>1 = archetype-specific). */
  lift: number;
}

/** What is known about one archetype of the pool, before any random draw. */
export interface ArchetypeSeed {
  archetype: string;
  deckCount: number;
  /** Share of the pool's decks that belong to this archetype. */
  metaShare: number;
  /** Candidate opening cards, most characteristic first. */
  cards: SeedCard[];
  bestDeck: { name: string; url: string | null; placement: number | null } | null;
}

export interface StarterPack {
  archetype: string;
  /** Exactly three distinct main deck cards. */
  cardIds: number[];
  deckCount: number;
  metaShare: number;
  bestDeck: ArchetypeSeed['bestDeck'];
}

export interface SeedOptions {
  /** Archetypes with fewer tournament decks than this are not offered. */
  minDecks?: number;
  /** A card must be played by at least this share of the archetype's decks to open it. */
  minShare?: number;
  /** Candidate cards kept per archetype. */
  candidates?: number;
}

const PACK_SIZE = 3;
const DEFAULTS = { minDecks: 5, minShare: 0.5, candidates: 8 } as const;

/** Archetypes of the pool with the cards that characterise them. Archetypes that cannot open a pack are left out. */
export function buildArchetypeSeeds(pool: readonly RouletteDeck[], options: SeedOptions = {}): ArchetypeSeed[] {
  const { minDecks, minShare, candidates } = { ...DEFAULTS, ...options };
  const tournament = pool.filter((d) => d.source === 'tournament' && d.main.length > 0);
  if (tournament.length === 0) return [];

  const formatShare = new Map<number, number>();
  for (const deck of tournament) {
    for (const id of new Set(deck.main)) formatShare.set(id, (formatShare.get(id) ?? 0) + 1);
  }

  const byArchetype = new Map<string, RouletteDeck[]>();
  for (const deck of tournament) {
    const key = deck.archetype ?? deck.name;
    byArchetype.set(key, [...(byArchetype.get(key) ?? []), deck]);
  }

  const seeds: ArchetypeSeed[] = [];
  for (const [archetype, decks] of byArchetype) {
    if (decks.length < minDecks) continue;
    const played = new Map<number, number>();
    for (const deck of decks) for (const id of new Set(deck.main)) played.set(id, (played.get(id) ?? 0) + 1);

    const cards: SeedCard[] = [];
    for (const [cardId, count] of played) {
      const share = count / decks.length;
      if (share < minShare) continue;
      const lift = share / ((formatShare.get(cardId) ?? count) / tournament.length);
      cards.push({ cardId, share, lift });
    }
    // most archetype-specific first; generic staples sink to the end
    cards.sort((a, b) => b.lift * b.share - a.lift * a.share || a.cardId - b.cardId);
    if (cards.length < PACK_SIZE) continue;

    const best = [...decks].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))[0];
    seeds.push({
      archetype,
      deckCount: decks.length,
      metaShare: decks.length / tournament.length,
      cards: cards.slice(0, candidates),
      bestDeck: best ? { name: best.name, url: best.url ?? null, placement: best.placement ?? null } : null,
    });
  }
  return seeds.sort((a, b) => b.deckCount - a.deckCount || a.archetype.localeCompare(b.archetype));
}

/** Weighted draw without replacement; weights must be positive. */
function weightedPick<T>(items: readonly T[], weight: (item: T) => number, random: () => number): number {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let roll = random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weight(items[i]);
    if (roll <= 0) return i;
  }
  return items.length - 1;
}

/** Three distinct cards of one archetype, at least one of them a monster, favouring the most characteristic ones. */
function openPack(seed: ArchetypeSeed, meta: ReadonlyMap<number, CardMeta>, random: () => number): number[] {
  const pool = [...seed.cards];
  const picked: SeedCard[] = [];
  while (picked.length < PACK_SIZE && pool.length > 0) {
    const index = weightedPick(pool, (c) => Math.pow(c.share, 2) * Math.max(c.lift, 0.5), random);
    picked.push(pool.splice(index, 1)[0]);
  }
  const isMonster = (id: number) => meta.get(id)?.kind === KIND.monster;
  if (!picked.some((c) => isMonster(c.cardId))) {
    const monster = pool.find((c) => isMonster(c.cardId));
    if (monster) picked[picked.length - 1] = monster;
  }
  return picked.sort((a, b) => b.lift - a.lift).map((c) => c.cardId);
}

/**
 * Draws `count` packs from different archetypes. Archetypes with more tournament decks come up more often
 * (square-root weighting, so a dominant archetype does not crowd out the rest).
 *
 * @param exclude archetypes to skip, e.g. the ones the player has just seen
 */
export function drawStarterPacks(
  seeds: readonly ArchetypeSeed[],
  meta: ReadonlyMap<number, CardMeta>,
  count = 3,
  random: () => number = Math.random,
  exclude: ReadonlySet<string> = new Set(),
): StarterPack[] {
  let available = seeds.filter((s) => !exclude.has(s.archetype));
  if (available.length < count) available = [...seeds];
  const packs: StarterPack[] = [];
  const pool = [...available];
  while (packs.length < count && pool.length > 0) {
    const seed = pool.splice(weightedPick(pool, (s) => Math.sqrt(s.deckCount), random), 1)[0];
    packs.push({
      archetype: seed.archetype,
      cardIds: openPack(seed, meta, random),
      deckCount: seed.deckCount,
      metaShare: seed.metaShare,
      bestDeck: seed.bestDeck,
    });
  }
  return packs;
}
