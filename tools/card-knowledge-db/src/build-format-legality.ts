import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateCardForFormat,
  formatTagsFromResult,
  type BanlistSnapshot,
  type CardLegalityInput,
  type FormatDefinition,
} from './format-legality';
import { openDatabase, REPO_ROOT, runInTransaction } from './database';

interface DbCardRow {
  id: number;
  name: string;
  tcg_date: string | null;
  ban_tcg: string | null;
  ban_goat: string | null;
  formats_json: string | null;
}

function loadFormats(): FormatDefinition[] {
  const path = join(REPO_ROOT, 'src', 'assets', 'data', 'formats.json');
  return JSON.parse(readFileSync(path, 'utf8')) as FormatDefinition[];
}

function loadLocalBanlists(formats: FormatDefinition[]): Map<string, BanlistSnapshot> {
  const map = new Map<string, BanlistSnapshot>();
  for (const format of formats) {
    if (format.banlistSource !== 'local' || !format.banlistId) {
      continue;
    }
    const path = join(REPO_ROOT, 'src', 'assets', 'data', 'banlists', `${format.banlistId}.json`);
    map.set(format.banlistId, JSON.parse(readFileSync(path, 'utf8')) as BanlistSnapshot);
  }
  return map;
}

function toCardInput(row: DbCardRow): CardLegalityInput {
  let formats: string[] = [];
  if (row.formats_json) {
    try {
      const parsed = JSON.parse(row.formats_json) as unknown;
      formats = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      formats = [];
    }
  }
  return {
    id: row.id,
    name: row.name,
    tcgDate: row.tcg_date,
    banTcg: row.ban_tcg,
    banGoat: row.ban_goat,
    formats,
  };
}

async function main(): Promise<void> {
  const db = openDatabase();
  const formats = loadFormats();
  const localBanlists = loadLocalBanlists(formats);
  const cards = db
    .prepare(
      'SELECT id, name, tcg_date, ban_tcg, ban_goat, formats_json FROM cards ORDER BY id',
    )
    .all() as DbCardRow[];

  const insertLegality = db.prepare(
    `INSERT INTO card_format_legality (
      card_id, format_id, in_pool, ban_status, max_copies, verdict, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(card_id, format_id) DO UPDATE SET
      in_pool = excluded.in_pool,
      ban_status = excluded.ban_status,
      max_copies = excluded.max_copies,
      verdict = excluded.verdict,
      computed_at = excluded.computed_at`,
  );

  const deleteFormatTags = db.prepare(`DELETE FROM card_tags WHERE source = 'format'`);
  const insertTag = db.prepare(
    `INSERT INTO card_tags (card_id, tag, confidence, source, created_at)
     VALUES (?, ?, 1.0, 'format', ?)
     ON CONFLICT(card_id, tag, source) DO NOTHING`,
  );

  const now = new Date().toISOString();
  let playableRows = 0;
  let tagCount = 0;

  runInTransaction(db, () => {
    deleteFormatTags.run();
    db.prepare('DELETE FROM card_format_legality').run();

    for (const row of cards) {
      const card = toCardInput(row);
      const tags = new Set<string>();

      for (const format of formats) {
        const localBanlist =
          format.banlistSource === 'local' && format.banlistId
            ? localBanlists.get(format.banlistId) ?? null
            : null;
        const result = evaluateCardForFormat(card, format, localBanlist);

        insertLegality.run(
          card.id,
          result.formatId,
          result.inPool ? 1 : 0,
          result.banStatus,
          result.maxCopies,
          result.verdict,
          now,
        );

        if (result.verdict === 'legal' || result.verdict === 'restricted') {
          playableRows++;
        }

        for (const tag of formatTagsFromResult(result)) {
          tags.add(tag);
        }
      }

      for (const tag of tags) {
        insertTag.run(card.id, tag, now);
        tagCount++;
      }
    }
  });

  db.close();

  console.log(
    `Format legality: ${cards.length} cards × ${formats.length} formats, ${playableRows} playable rows, ${tagCount} format tags`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
