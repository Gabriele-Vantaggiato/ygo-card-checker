import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'format-legality.json');

interface FormatLegalityRow {
  card_id: number;
  format_id: string;
  max_copies: number;
  verdict: string;
}

interface FormatLegalityExport {
  version: number;
  generatedAt: string;
  formats: string[];
  playable: Record<string, string[]>;
  maxCopies: Record<string, Record<string, number>>;
}

async function main(): Promise<void> {
  const db = openDatabase();
  const rows = db
    .prepare(
      `SELECT card_id, format_id, max_copies, verdict
       FROM card_format_legality
       WHERE verdict IN ('legal', 'restricted')
       ORDER BY card_id, format_id`,
    )
    .all() as FormatLegalityRow[];

  const formats = [
    ...new Set(
      (
        db.prepare('SELECT DISTINCT format_id FROM card_format_legality ORDER BY format_id').all() as Array<{
          format_id: string;
        }>
      ).map((row) => row.format_id),
    ),
  ];

  db.close();

  const playable: Record<string, string[]> = {};
  const maxCopies: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const cardKey = String(row.card_id);
    const bucket = playable[cardKey] ?? [];
    bucket.push(row.format_id);
    playable[cardKey] = bucket;

    const copies = maxCopies[cardKey] ?? {};
    copies[row.format_id] = row.max_copies;
    maxCopies[cardKey] = copies;
  }

  const payload: FormatLegalityExport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    formats,
    playable,
    maxCopies,
  };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');

  const sizeKb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`Exported format legality for ${Object.keys(playable).length} cards → ${EXPORT_PATH}`);
  console.log(`Approx size: ${sizeKb} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
