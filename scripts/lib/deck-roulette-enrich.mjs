/**
 * Adds search metadata to a roulette deck: `archetype` (deck type) and `keyCards` (names).
 * Shared by build-deck-roulette-pool.mjs and enrich-deck-roulette-pool.mjs (idempotent).
 */

const KEY_CARD_LIMIT = 12;
const MIN_ARCHETYPE_COPIES = 6;

function countBy(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
  return counts;
}

function tidyName(name = '') {
  return name.replace(/\s+/g, ' ').replace(/\s*[-–—]\s*(edison|goat|hat|tengu)( format)?\s*$/i, '').trim();
}

/** Format Library names look like "Warrior — Event name"; keep the deck type part. */
function archetypeFromName(deck) {
  if (deck.id?.startsWith('formatlibrary-') && deck.name.includes(' — ')) {
    return deck.name.split(' — ')[0].trim() || null;
  }
  return null;
}

/** Most represented catalog archetype among the deck's cards, when clearly dominant. */
function archetypeFromCards(deck, catalog) {
  const tally = new Map();
  for (const [id, qty] of countBy([...deck.main, ...deck.extra])) {
    const archetype = catalog.get(id)?.archetype;
    if (archetype) tally.set(archetype, (tally.get(archetype) ?? 0) + qty);
  }
  const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return best && best[1] >= MIN_ARCHETYPE_COPIES ? best[0] : null;
}

function keyCardNames(deck, catalog) {
  const counts = countBy([...deck.main, ...deck.extra]);
  return [...counts.entries()]
    .filter(([id]) => /Monster/.test(catalog.get(id)?.type ?? ''))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => catalog.get(id)?.name)
    .filter(Boolean)
    .slice(0, KEY_CARD_LIMIT);
}

export function enrichDeck(deck, catalog) {
  return {
    ...deck,
    archetype: archetypeFromName(deck) ?? archetypeFromCards(deck, catalog) ?? tidyName(deck.name) ?? null,
    keyCards: keyCardNames(deck, catalog),
  };
}
