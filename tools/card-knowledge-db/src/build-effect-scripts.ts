import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { effectsToScript, mergeScripts } from './effect-script-compiler';
import { openDatabase, readMeta, REPO_ROOT, runInTransaction } from './database';
import { HAT_2014_SCRIPTS, hatScriptsById } from './hat-2014-scripts';
import { mdproToEffectScript, parseMdproLua } from './mdpro-lua-parser';
import { parseSegocProfile, deriveSpellSpeed, type SegocProfile } from './segoc-parser';
import type { EffectScript, EffectScriptIndex } from './effect-script-types';

const SCRIPTS_DIR = join(REPO_ROOT, 'src', 'assets', 'data', 'effect-scripts');
const SCRIPTS_PATH = join(SCRIPTS_DIR, 'scripts.json');
const HAT_PATH = join(SCRIPTS_DIR, 'hat-2014.json');
const SEGOC_PATH = join(SCRIPTS_DIR, 'segoc-profiles.json');
const MDPRO_CACHE = join(REPO_ROOT, 'tools', 'card-knowledge-db', 'mdpro-scripts');

const CARD_SCRIPTS_DDL = `
CREATE TABLE IF NOT EXISTS card_scripts (
  card_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  interrupts_json TEXT NOT NULL,
  timings_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  lua_source TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto', 'hat')),
  confidence REAL NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
`;

interface CardRow {
  id: number;
  name: string;
  type: string;
  is_extra_deck: number;
}

function loadTagsByCard(db: import('node:sqlite').DatabaseSync): Map<number, string[]> {
  const rows = db.prepare('SELECT card_id, tag FROM card_tags').all() as Array<{
    card_id: number;
    tag: string;
  }>;
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const bucket = map.get(row.card_id) ?? [];
    bucket.push(row.tag);
    map.set(row.card_id, bucket);
  }
  return map;
}

function loadEffectsByCard(
  db: import('node:sqlite').DatabaseSync,
): Map<number, Array<{ kind: string; payload: Record<string, unknown> }>> {
  const rows = db
    .prepare('SELECT card_id, effect_kind, payload_json FROM card_effects')
    .all() as Array<{ card_id: number; effect_kind: string; payload_json: string }>;

  const map = new Map<number, Array<{ kind: string; payload: Record<string, unknown> }>>();
  for (const row of rows) {
    const parsed = JSON.parse(row.payload_json) as Record<string, unknown>;
    const bucket = map.get(row.card_id) ?? [];
    bucket.push({ kind: row.effect_kind, payload: parsed });
    map.set(row.card_id, bucket);
  }
  return map;
}

function loadMdproLua(cardId: number): string | null {
  const path = join(MDPRO_CACHE, `c${cardId}.lua`);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function upsertScript(db: import('node:sqlite').DatabaseSync, script: EffectScript): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO card_scripts (
      card_id, name, roles_json, interrupts_json, timings_json, steps_json,
      lua_source, source, confidence, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(card_id) DO UPDATE SET
      name = excluded.name,
      roles_json = excluded.roles_json,
      interrupts_json = excluded.interrupts_json,
      timings_json = excluded.timings_json,
      steps_json = excluded.steps_json,
      lua_source = excluded.lua_source,
      source = excluded.source,
      confidence = excluded.confidence,
      updated_at = excluded.updated_at`,
  ).run(
    script.cardId,
    script.name,
    JSON.stringify(script.roles),
    JSON.stringify(script.interrupts),
    JSON.stringify(script.timings),
    JSON.stringify(script.steps),
    script.luaSource,
    script.source,
    script.confidence,
    now,
  );
}

function writeAssets(scripts: Record<string, EffectScript>, cardCount: number): void {
  mkdirSync(SCRIPTS_DIR, { recursive: true });
  const index: EffectScriptIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    cardCount,
    scripts,
  };
  writeFileSync(SCRIPTS_PATH, JSON.stringify(index), 'utf8');
  writeFileSync(HAT_PATH, JSON.stringify(HAT_2014_SCRIPTS, null, 2), 'utf8');
}

function writeSegocProfiles(profiles: Record<string, SegocProfile>): void {
  mkdirSync(SCRIPTS_DIR, { recursive: true });
  writeFileSync(SEGOC_PATH, JSON.stringify(profiles), 'utf8');
}

async function main(): Promise<void> {
  const db = openDatabase();
  db.exec(CARD_SCRIPTS_DDL);

  const hatById = hatScriptsById();
  const cards = db.prepare('SELECT id, name, type, is_extra_deck FROM cards ORDER BY id').all() as CardRow[];

  if (cards.length === 0) {
    db.close();
    writeAssets({ ...hatById }, 0);
    writeSegocProfiles({});
    console.log('No cards in DB — wrote HAT-2014 assets only.');
    return;
  }

  const tagsByCard = loadTagsByCard(db);
  const effectsByCard = loadEffectsByCard(db);
  const meta = readMeta();
  const scripts: Record<string, EffectScript> = { ...hatById };
  const segocProfiles: Record<string, SegocProfile> = {};
  let compiled = 0;
  let mdproHits = 0;

  runInTransaction(db, () => {
    for (const card of cards) {
      const tags = tagsByCard.get(card.id) ?? [];
      const effects = effectsByCard.get(card.id) ?? [];
      const lua = loadMdproLua(card.id);
      let merged = effectsToScript(card.id, card.name, effects, tags, {
        cardType: card.type,
        isExtraDeck: card.is_extra_deck === 1,
        luaSource: lua ?? undefined,
      });

      if (lua) {
        mdproHits += 1;
        const parsed = parseMdproLua(card.id, card.name, lua);
        const mdproScript = mdproToEffectScript(card.id, card.name, lua, parsed);
        if (parsed.signals.length > 0) {
          const enrichedTags = [...new Set([...tags, ...parsed.signals])];
          const autoEnriched = effectsToScript(card.id, card.name, effects, enrichedTags, {
            cardType: card.type,
            isExtraDeck: card.is_extra_deck === 1,
            luaSource: lua,
          });
          merged = mergeScripts(autoEnriched, mdproScript);
        } else {
          merged = mergeScripts(merged, mdproScript);
        }

        const luaProfile = parseSegocProfile(lua);
        segocProfiles[String(card.id)] = {
          ...luaProfile,
          spellSpeed: deriveSpellSpeed(card.type, luaProfile.effectType),
        };
      }

      merged = mergeScripts(merged, hatById[String(card.id)]);
      upsertScript(db, merged);
      scripts[String(card.id)] = merged;
      compiled += 1;
    }

    for (const [id, hatScript] of Object.entries(hatById)) {
      if (!scripts[id]) {
        upsertScript(db, hatScript);
        scripts[id] = hatScript;
      }
    }
  });

  db.close();
  writeAssets(scripts, meta?.totalCards ?? cards.length);
  writeSegocProfiles(segocProfiles);
  console.log(`Compiled ${compiled} card scripts → ${SCRIPTS_PATH}`);
  console.log(`MDPro lua hits: ${mdproHits}`);
  console.log(`HAT pack → ${HAT_PATH}`);
  console.log(`Total indexed: ${Object.keys(scripts).length}`);
  console.log(`SEGOC profiles → ${SEGOC_PATH} (${Object.keys(segocProfiles).length} cards)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
