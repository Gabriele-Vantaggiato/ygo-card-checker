/**
 * Single source of truth for "can this card ever be suggested for this deck".
 * Deliberately structured-data-only: real archetype string equality or real setcode
 * family membership, plus a small hand-maintained generic-staple allowlist. No text or
 * name matching anywhere — that was the root cause of every false positive the previous
 * synergy engine produced (e.g. "Photon" the archetype vs. the word "Photon" in a name).
 */

export interface GateCardFacts {
  id: number;
  name: string;
  archetype: string | null;
  setcodes: readonly number[];
  type: string;
  isExtraDeck: boolean;
  banTcg: string | null;
}

export interface DeckIdentityFacts {
  archetypes: ReadonlySet<string>;
  setcodeFamilies: ReadonlySet<number>;
}

const SETCODE_FAMILY_MASK = 0xfff;

/**
 * Curated by hand — real, well-known generic staples (hand traps, generic removal) that
 * belong in any deck regardless of archetype. Never derived from effect-text patterns.
 * Extend this list deliberately, one verified card at a time.
 */
export const GENERIC_STAPLE_ALLOWLIST: ReadonlySet<number> = new Set([
  14558127, // Ash Blossom & Joyous Spring
  27204311, // Nibiru, the Primal Being
  24224830, // Called by the Grave
  14532163, // Lightning Storm
  94145021, // Droll & Lock Bird
  59438930, // Ghost Ogre & Snow Rabbit
  97268402, // Effect Veiler
  10045474, // Infinite Impermanence
  24508238, // D.D. Crow
  54693926, // Dark Ruler No More
  8267140, // Cosmic Cyclone
  35261759, // Pot of Desires
  84211599, // Pot of Prosperity
  65681983, // Crossout Designator
  14087893, // Book of Moon
  43898403, // Twin Twisters
  18144507, // Harpie's Feather Duster
]);

export function buildDeckIdentity(
  deckCards: ReadonlyArray<{ id: number }>,
  catalog: ReadonlyMap<number, GateCardFacts>,
): DeckIdentityFacts {
  const archetypes = new Set<string>();
  const setcodeFamilies = new Set<number>();

  for (const card of deckCards) {
    const facts = catalog.get(card.id);
    if (!facts) {
      continue;
    }
    if (facts.archetype) {
      archetypes.add(facts.archetype);
    }
    for (const code of facts.setcodes) {
      setcodeFamilies.add(code & SETCODE_FAMILY_MASK);
    }
  }

  return { archetypes, setcodeFamilies };
}

/** Cards seen together in at least this many real decks are admitted even with zero
 *  archetype/setcode overlap. Backed by real deckbuilding data (see
 *  sync-tournament-decks.ts), not text/name similarity, so it doesn't reintroduce the
 *  false-positive class this gate exists to prevent. */
export const MIN_COOCCURRENCE_FOR_ADMISSION = 3;

export function isAdmissible(
  candidate: GateCardFacts,
  deckIdentity: DeckIdentityFacts,
  cooccurrenceScore = 0,
): boolean {
  if (GENERIC_STAPLE_ALLOWLIST.has(candidate.id)) {
    return true;
  }
  if (deckIdentity.archetypes.size === 0 && deckIdentity.setcodeFamilies.size === 0) {
    return true;
  }
  if (candidate.archetype && deckIdentity.archetypes.has(candidate.archetype)) {
    return true;
  }
  if (candidate.setcodes.some((code) => deckIdentity.setcodeFamilies.has(code & SETCODE_FAMILY_MASK))) {
    return true;
  }
  return cooccurrenceScore >= MIN_COOCCURRENCE_FOR_ADMISSION;
}
