import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'engines.json');

interface EngineRow {
  id: number;
  key: string;
  name: string;
  description: string | null;
  min_cards_threshold: number;
}

interface EngineCardRow {
  engine_id: number;
  card_id: number;
  card_name: string;
  role: 'core' | 'support';
  min_copies: number;
}

export interface ExportedEngineCard {
  cardId: number;
  name: string;
  role: 'core' | 'support';
  minCopies: number;
}

export interface ExportedEngine {
  key: string;
  name: string;
  description: string | null;
  minCardsThreshold: number;
  cards: ExportedEngineCard[];
}

interface EnginesExport {
  version: number;
  generatedAt: string;
  engines: ExportedEngine[];
}

async function main(): Promise<void> {
  const db = openDatabase();

  const engineRows = db.prepare('SELECT id, key, name, description, min_cards_threshold FROM combo_engines').all() as EngineRow[];
  const cardRows = db
    .prepare(
      `SELECT ec.engine_id AS engine_id, ec.card_id AS card_id, c.name AS card_name, ec.role AS role, ec.min_copies AS min_copies
       FROM combo_engine_cards ec JOIN cards c ON c.id = ec.card_id`,
    )
    .all() as EngineCardRow[];
  db.close();

  const cardsByEngine = new Map<number, ExportedEngineCard[]>();
  for (const row of cardRows) {
    const bucket = cardsByEngine.get(row.engine_id) ?? [];
    bucket.push({ cardId: row.card_id, name: row.card_name, role: row.role, minCopies: row.min_copies });
    cardsByEngine.set(row.engine_id, bucket);
  }

  const engines: ExportedEngine[] = engineRows.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    minCardsThreshold: row.min_cards_threshold,
    cards: cardsByEngine.get(row.id) ?? [],
  }));

  const payload: EnginesExport = { version: 1, generatedAt: new Date().toISOString(), engines };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');
  console.log(`Exported ${engines.length} combo engines → ${EXPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
