/**
 * Slim roster export (id -> name/type/race/attribute/archetype/image) with none of
 * related.json's per-card `related[]`/`effects[]`/`tags[]` arrays. related.json is
 * ~42MB — far too large to fetch/bundle in a serverless function that just needs to
 * look up a candidate card's attribute/race/archetype for restriction filtering.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'roster.json');

interface CardRow {
  id: number;
  name: string;
  type: string;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  tcg_date: string | null;
  ban_tcg: string | null;
}

export interface RosterMember {
  id: number;
  name: string;
  type: string;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  tcgDate: string | null;
  banTcg: string | null;
  imageSmall: string;
}

interface RosterExport {
  version: number;
  generatedAt: string;
  cardCount: number;
  roster: Record<string, RosterMember>;
}

function imageSmallUrl(cardId: number): string {
  return `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`;
}

async function main(): Promise<void> {
  const db = openDatabase();
  const rows = db
    .prepare('SELECT id, name, type, race, attribute, archetype, tcg_date, ban_tcg FROM cards ORDER BY id')
    .all() as CardRow[];
  db.close();

  const roster: Record<string, RosterMember> = {};
  for (const row of rows) {
    roster[String(row.id)] = {
      id: row.id,
      name: row.name,
      type: row.type,
      race: row.race,
      attribute: row.attribute,
      archetype: row.archetype,
      tcgDate: row.tcg_date,
      banTcg: row.ban_tcg,
      imageSmall: imageSmallUrl(row.id),
    };
  }

  const payload: RosterExport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    cardCount: rows.length,
    roster,
  };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');
  const sizeKb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`Exported roster for ${rows.length} cards → ${EXPORT_PATH}`);
  console.log(`Approx size: ${sizeKb} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
