import { SYNERGY_PAIRS } from './mechanic-tags';
import {
  clearRuleRelations,
  insertRelation,
  openDatabase,
  runInTransaction,
} from './database';

interface TagIndex {
  card_id: number;
  tag: string;
}

interface CardMeta {
  id: number;
  name: string;
  archetype: string | null;
  desc_en: string;
}

interface MentionIndex {
  card_id: number;
  mention: string;
}

interface EffectRow {
  card_id: number;
  payload_json: string;
}

const MAX_TAG_RELATIONS_PER_SOURCE = 24;
const MAX_ENGINE_RELATIONS_PER_SOURCE = 64;
const MAX_GY_RELATIONS_PER_SOURCE = 56;
const MAX_ARCHETYPE_LINKS_PER_CARD = 16;
const MAX_ARCHETYPE_GROUP_FULL_MESH = 22;
const MAX_MENTIONS_PER_SOURCE = 12;
const MAX_SHARED_MENTION_LINKS = 6;
const MAX_SERIES_LINKS_PER_CARD = 40;
const MAX_EFFECT_TARGET_LINKS = 12;

const SERIES_TOKENS = [
  'galaxy',
  'photon',
  'cyber',
  'shaddoll',
  'branded',
  'despia',
  'labrynth',
  'runick',
  'tellarknight',
  'constellar',
  'snake-eye',
  'snake eye',
  'evil eye',
] as const;

function mentionsCardName(desc: string, cardName: string): boolean {
  return desc.toLowerCase().includes(cardName.toLowerCase());
}

function sharesArchetypeSignal(source: CardMeta, target: CardMeta): boolean {
  return (
    mentionsCardName(target.desc_en, source.name) ||
    mentionsCardName(source.desc_en, target.name) ||
    (source.archetype !== null && mentionsCardName(target.desc_en, source.archetype)) ||
    (target.archetype !== null && mentionsCardName(source.desc_en, target.archetype))
  );
}

function effectTargetNames(payload: Record<string, unknown>): string[] {
  const kind = String(payload.kind ?? '');
  switch (kind) {
    case 'add_from_deck':
    case 'special_summon_deck':
    case 'special_summon_gy':
      return Array.isArray(payload.names) ? (payload.names as string[]) : [];
    case 'tribute_special_summon':
      return Array.isArray(payload.summonNames) ? (payload.summonNames as string[]) : [];
    case 'synchro_summon':
    case 'xyz_summon':
    case 'tribute_summon':
      return Array.isArray(payload.names) ? (payload.names as string[]) : [];
    default:
      return [];
  }
}

async function main(): Promise<void> {
  const db = openDatabase();
  const tagRows = db
    .prepare('SELECT card_id, tag FROM card_tags WHERE source = ?')
    .all('rule') as TagIndex[];

  if (tagRows.length === 0) {
    console.error('No tags found. Run: npm run db:tag');
    process.exit(1);
  }

  const byTag = new Map<string, number[]>();
  for (const row of tagRows) {
    const bucket = byTag.get(row.tag) ?? [];
    bucket.push(row.card_id);
    byTag.set(row.tag, bucket);
  }

  const mentionRows = db
    .prepare('SELECT card_id, mention FROM card_mentions WHERE source = ?')
    .all('rule') as MentionIndex[];

  const byMention = new Map<string, number[]>();
  for (const row of mentionRows) {
    const bucket = byMention.get(row.mention) ?? [];
    bucket.push(row.card_id);
    byMention.set(row.mention, bucket);
  }

  const cards = db.prepare('SELECT id, name, archetype, desc_en FROM cards').all() as CardMeta[];

  const cardsByName = new Map<string, number>();
  for (const card of cards) {
    cardsByName.set(card.name.toLowerCase(), card.id);
  }

  const byArchetype = new Map<string, CardMeta[]>();
  for (const card of cards) {
    if (!card.archetype) {
      continue;
    }
    const bucket = byArchetype.get(card.archetype) ?? [];
    bucket.push(card);
    byArchetype.set(card.archetype, bucket);
  }

  const effectRows = db
    .prepare(`SELECT card_id, payload_json FROM card_effects WHERE source = 'rule'`)
    .all() as EffectRow[];

  console.log('Building rule-based relations...');
  let relations = 0;

  runInTransaction(db, () => {
    clearRuleRelations(db);

    for (const pair of SYNERGY_PAIRS) {
      const triggers = byTag.get(pair.trigger) ?? [];
      const responses = byTag.get(pair.response) ?? [];
      const cap =
        pair.relation === 'engine'
          ? MAX_ENGINE_RELATIONS_PER_SOURCE
          : pair.relation === 'gy_synergy'
            ? MAX_GY_RELATIONS_PER_SOURCE
            : MAX_TAG_RELATIONS_PER_SOURCE;
      for (const sourceId of triggers) {
        let linked = 0;
        for (const targetId of responses) {
          if (sourceId === targetId || linked >= cap) {
            continue;
          }
          insertRelation(db, sourceId, targetId, pair.relation, pair.relation === 'engine' ? 0.92 : 1.0);
          relations += 1;
          linked += 1;
        }
      }
    }

    for (const row of mentionRows) {
      const targetId = cardsByName.get(row.mention.toLowerCase());
      if (!targetId || targetId === row.card_id) {
        continue;
      }
      insertRelation(db, row.card_id, targetId, 'mentions_card', 0.98);
      relations += 1;
    }

    for (const row of effectRows) {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const names = effectTargetNames(payload);
      let linked = 0;
      for (const name of names) {
        const targetId = cardsByName.get(name.toLowerCase());
        if (!targetId || targetId === row.card_id || linked >= MAX_EFFECT_TARGET_LINKS) {
          continue;
        }
        insertRelation(db, row.card_id, targetId, 'search_target', 0.94);
        relations += 1;
        linked += 1;
      }
    }

    for (const [_mention, cardIds] of byMention) {
      if (cardIds.length < 2) {
        continue;
      }
      for (const sourceId of cardIds) {
        let linked = 0;
        for (const targetId of cardIds) {
          if (sourceId === targetId || linked >= MAX_SHARED_MENTION_LINKS) {
            continue;
          }
          insertRelation(db, sourceId, targetId, 'shared_mention', 0.75);
          relations += 1;
          linked += 1;
        }
      }
    }

    for (const group of byArchetype.values()) {
      if (group.length < 2) {
        continue;
      }

      const fullMesh = group.length <= MAX_ARCHETYPE_GROUP_FULL_MESH;

      for (const source of group) {
        let mentionLinks = 0;
        for (const target of group) {
          if (source.id === target.id || mentionLinks >= MAX_MENTIONS_PER_SOURCE) {
            continue;
          }
          if (mentionsCardName(target.desc_en, source.name)) {
            insertRelation(db, source.id, target.id, 'mentions_card', 0.95);
            relations += 1;
            mentionLinks += 1;
          }
        }

        let archetypeLinks = 0;
        for (const target of group) {
          if (source.id === target.id || archetypeLinks >= MAX_ARCHETYPE_LINKS_PER_CARD) {
            continue;
          }
          if (!fullMesh && !sharesArchetypeSignal(source, target)) {
            continue;
          }
          insertRelation(db, source.id, target.id, 'archetype', fullMesh ? 0.55 : 0.48);
          relations += 1;
          archetypeLinks += 1;
        }
      }
    }

    for (const card of cards) {
      const nameLower = card.name.toLowerCase();
      const token = SERIES_TOKENS.find((series) => nameLower.includes(series));
      if (!token) {
        continue;
      }
      let linked = 0;
      for (const target of cards) {
        if (card.id === target.id || linked >= MAX_SERIES_LINKS_PER_CARD) {
          continue;
        }
        if (!target.name.toLowerCase().includes(token)) {
          continue;
        }
        insertRelation(db, card.id, target.id, 'series', token === 'cyber' ? 0.65 : 0.68);
        relations += 1;
        linked += 1;
      }
    }
  });

  db.close();
  console.log(`Done. ${relations} relations stored.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
