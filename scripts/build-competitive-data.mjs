/**
 * Builds the data behind the competitive deck model from the deck-roulette pool files (read-only on them):
 *   deck-roulette/cards.json    per-card roles, flags, kind, level, archetype
 *   deck-roulette/synergy.json  typed synergy links between pool cards
 *   deck-roulette/usage.json    per-format card usage in tournament decks
 *
 * Run after build-deck-roulette-pool.mjs:  node scripts/build-competitive-data.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildCardMeta, buildSynergyLinks, buildUsage } from './lib/deck-roulette-meta.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../src/assets/data');
const POOL_DIR = join(DATA, 'deck-roulette');
const catalog = new Map(
  JSON.parse(readFileSync(join(DATA, 'deck-builder/catalog.json'), 'utf8')).map((c) => [String(c.id), c]),
);
const related = JSON.parse(readFileSync(join(DATA, 'card-knowledge/related.json'), 'utf8')).entries;

const ids = new Set();
const usage = {};
for (const file of readdirSync(POOL_DIR).filter((f) => /^(goat|edison|tengu|hat|tcg)\.json$/.test(f))) {
  const pool = JSON.parse(readFileSync(join(POOL_DIR, file), 'utf8'));
  for (const deck of pool.decks) for (const id of [...deck.main, ...deck.extra, ...deck.side]) ids.add(id);
  usage[pool.formatId] = buildUsage(pool.decks);
}

const { cards, archetypes } = buildCardMeta(ids, related, catalog);
const links = buildSynergyLinks([...ids], related);
writeFileSync(join(POOL_DIR, 'cards.json'), JSON.stringify({ version: 3, archetypes, cards }));
writeFileSync(join(POOL_DIR, 'synergy.json'), JSON.stringify({ version: 1, links }));
writeFileSync(join(POOL_DIR, 'usage.json'), JSON.stringify({ version: 1, usage }));
console.log(
  `cards=${Object.keys(cards).length} linked=${Object.keys(links).length} ` +
    Object.entries(usage).map(([f, u]) => `${f}:${Object.keys(u).length}`).join(' '),
);
