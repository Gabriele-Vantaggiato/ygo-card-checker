import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'flows.json');

interface FlowRow {
  id: number;
  key: string;
  title: string;
  engine_id: number | null;
  engine_key: string | null;
  steps_json: string;
}

interface FlowKeyCardRow {
  flow_id: number;
  card_id: number;
  card_name: string;
}

export interface ExportedFlowKeyCard {
  cardId: number;
  name: string;
}

export interface ExportedFlow {
  key: string;
  title: string;
  engineKey: string | null;
  keyCards: ExportedFlowKeyCard[];
  steps: string[];
}

interface FlowsExport {
  version: number;
  generatedAt: string;
  flows: ExportedFlow[];
}

async function main(): Promise<void> {
  const db = openDatabase();

  const flowRows = db
    .prepare(
      `SELECT f.id AS id, f.key AS key, f.title AS title, f.engine_id AS engine_id, e.key AS engine_key, f.steps_json AS steps_json
       FROM combo_flows f LEFT JOIN combo_engines e ON e.id = f.engine_id`,
    )
    .all() as FlowRow[];

  const keyCardRows = db
    .prepare(
      `SELECT fk.flow_id AS flow_id, fk.card_id AS card_id, c.name AS card_name
       FROM combo_flow_key_cards fk JOIN cards c ON c.id = fk.card_id`,
    )
    .all() as FlowKeyCardRow[];
  db.close();

  const keyCardsByFlow = new Map<number, ExportedFlowKeyCard[]>();
  for (const row of keyCardRows) {
    const bucket = keyCardsByFlow.get(row.flow_id) ?? [];
    bucket.push({ cardId: row.card_id, name: row.card_name });
    keyCardsByFlow.set(row.flow_id, bucket);
  }

  const flows: ExportedFlow[] = flowRows.map((row) => ({
    key: row.key,
    title: row.title,
    engineKey: row.engine_key,
    keyCards: keyCardsByFlow.get(row.id) ?? [],
    steps: JSON.parse(row.steps_json),
  }));

  const payload: FlowsExport = { version: 1, generatedAt: new Date().toISOString(), flows };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');
  console.log(`Exported ${flows.length} combo flows → ${EXPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
