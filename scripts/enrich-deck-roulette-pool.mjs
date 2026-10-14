/**
 * Adds search metadata (archetype, keyCards) to the existing pool files without refetching.
 * Run: node scripts/enrich-deck-roulette-pool.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { enrichDeck } from './lib/deck-roulette-enrich.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../src/assets/data');
const POOL_DIR = join(DATA, 'deck-roulette');
const catalog = new Map(
  JSON.parse(readFileSync(join(DATA, 'deck-builder/catalog.json'), 'utf8')).map((c) => [String(c.id), c]),
);

for (const file of readdirSync(POOL_DIR).filter((f) => /^(goat|edison|tengu|hat|tcg)\.json$/.test(f))) {
  const path = join(POOL_DIR, file);
  const pool = JSON.parse(readFileSync(path, 'utf8'));
  pool.decks = pool.decks.map((deck) => enrichDeck(deck, catalog));
  writeFileSync(path, JSON.stringify(pool));
  const archetypes = new Set(pool.decks.map((d) => d.archetype));
  console.log(`${file}: ${pool.decks.length} decks, ${archetypes.size} archetypes`);
}
