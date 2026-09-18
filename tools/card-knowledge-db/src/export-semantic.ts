import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, REPO_ROOT } from './database';
import type { CardCostFlags, CardOutcome, CardRestrictions, CardRole, CardTrigger } from './semantic-model';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'semantic.json');

interface SemanticProfileRow {
  card_id: number;
  roles_json: string;
  triggers_json: string;
  outcomes_json: string;
  cost_flags_json: string;
  restrictions_json: string;
}

interface MentionsCardRow {
  source_id: number;
  target_id: number;
}

export interface ExportedSemanticProfile {
  roles: CardRole[];
  triggers: CardTrigger[];
  outcomes: CardOutcome[];
  costFlags: CardCostFlags;
  restrictions: CardRestrictions;
  /** Pillar 1 MentionsCards: resolved card ids from card_relations WHERE relation='mentions_card'. */
  mentionsCardIds: number[];
}

interface SemanticExport {
  version: number;
  generatedAt: string;
  cardCount: number;
  profiles: Record<string, ExportedSemanticProfile>;
}

async function main(): Promise<void> {
  const db = openDatabase();

  const profileRows = db
    .prepare(
      'SELECT card_id, roles_json, triggers_json, outcomes_json, cost_flags_json, restrictions_json FROM card_semantic_profile',
    )
    .all() as SemanticProfileRow[];

  if (profileRows.length === 0) {
    console.error('No semantic profiles in DB. Run: npm run db:semantic');
    process.exit(1);
  }

  const mentionRows = db
    .prepare(`SELECT source_id, target_id FROM card_relations WHERE relation = 'mentions_card'`)
    .all() as MentionsCardRow[];

  const mentionsByCard = new Map<number, number[]>();
  for (const row of mentionRows) {
    const bucket = mentionsByCard.get(row.source_id) ?? [];
    bucket.push(row.target_id);
    mentionsByCard.set(row.source_id, bucket);
  }

  db.close();

  const profiles: Record<string, ExportedSemanticProfile> = {};
  for (const row of profileRows) {
    profiles[String(row.card_id)] = {
      roles: JSON.parse(row.roles_json),
      triggers: JSON.parse(row.triggers_json),
      outcomes: JSON.parse(row.outcomes_json),
      costFlags: JSON.parse(row.cost_flags_json),
      restrictions: JSON.parse(row.restrictions_json),
      mentionsCardIds: mentionsByCard.get(row.card_id) ?? [],
    };
  }

  const payload: SemanticExport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    cardCount: profileRows.length,
    profiles,
  };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');

  const sizeKb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`Exported semantic profiles for ${profileRows.length} cards → ${EXPORT_PATH}`);
  console.log(`Approx size: ${sizeKb} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
