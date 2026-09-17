/**
 * Exports structured-only facts for the Deck Builder gate + co-occurrence ranking.
 * Deliberately excludes any regex/text-derived tag or synergy data — see
 * docs/superpowers/specs/2026-09-17-deck-builder-rewrite-design.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, REPO_ROOT } from './database';

const EXPORT_DIR = join(REPO_ROOT, 'src', 'assets', 'data', 'deck-builder');
const CATALOG_PATH = join(EXPORT_DIR, 'catalog.json');
const COOCCURRENCE_PATH = join(EXPORT_DIR, 'cooccurrence.json');

/** Pairs seen together in at least this many distinct real decks survive the export —
 *  filters out one-off noise while keeping the file a manageable size. */
const MIN_DECK_COUNT = 2;
/** Bounds the runtime index size: only the strongest partners per card are kept. */
const MAX_PARTNERS_PER_CARD = 40;

export interface ExportedCardFacts {
  id: number;
  name: string;
  type: string;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  setcodes: number[];
  isExtraDeck: boolean;
  level: number | null;
  atk: number | null;
  def: number | null;
  banTcg: string | null;
}

interface CardRow {
  id: number;
  name: string;
  type: string;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  setcode_json: string | null;
  is_extra_deck: number;
  level: number | null;
  atk: number | null;
  def: number | null;
  ban_tcg: string | null;
}

interface CooccurrenceRow {
  card_a: number;
  card_b: number;
  deck_count: number;
}

function main(): void {
  console.log('Export deck-builder gate data (catalog + co-occurrence)');
  const db = openDatabase();

  const cardRows = db
    .prepare(
      `SELECT id, name, type, race, attribute, archetype, setcode_json, is_extra_deck, level, atk, def, ban_tcg FROM cards`,
    )
    .all() as CardRow[];

  const catalog: ExportedCardFacts[] = cardRows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    race: row.race,
    attribute: row.attribute,
    archetype: row.archetype,
    setcodes: row.setcode_json ? (JSON.parse(row.setcode_json) as number[]) : [],
    isExtraDeck: row.is_extra_deck === 1,
    level: row.level,
    atk: row.atk,
    def: row.def,
    banTcg: row.ban_tcg,
  }));

  const knownIds = new Set(catalog.map((c) => c.id));

  const pairRows = db
    .prepare(`SELECT card_a, card_b, deck_count FROM deck_cooccurrence WHERE deck_count >= ?`)
    .all(MIN_DECK_COUNT) as CooccurrenceRow[];

  const byCard = new Map<number, Array<{ id: number; weight: number }>>();
  let skippedUnknown = 0;
  for (const row of pairRows) {
    if (!knownIds.has(row.card_a) || !knownIds.has(row.card_b)) {
      skippedUnknown++;
      continue;
    }
    const forward = byCard.get(row.card_a) ?? [];
    forward.push({ id: row.card_b, weight: row.deck_count });
    byCard.set(row.card_a, forward);

    const backward = byCard.get(row.card_b) ?? [];
    backward.push({ id: row.card_a, weight: row.deck_count });
    byCard.set(row.card_b, backward);
  }

  const cooccurrence: Record<string, Array<{ id: number; weight: number }>> = {};
  for (const [cardId, partners] of byCard) {
    cooccurrence[String(cardId)] = partners
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_PARTNERS_PER_CARD);
  }

  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog));
  writeFileSync(COOCCURRENCE_PATH, JSON.stringify(cooccurrence));

  console.log(`Catalog: ${catalog.length} cards -> ${CATALOG_PATH}`);
  console.log(
    `Co-occurrence: ${Object.keys(cooccurrence).length} cards with partners (${pairRows.length - skippedUnknown} raw pairs kept, ${skippedUnknown} skipped as unknown ids) -> ${COOCCURRENCE_PATH}`,
  );
}

main();
