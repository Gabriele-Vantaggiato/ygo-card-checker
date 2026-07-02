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

const MAX_TAG_RELATIONS_PER_SOURCE = 24;
const MAX_ARCHETYPE_LINKS_PER_CARD = 8;
const MAX_MENTIONS_PER_SOURCE = 6;

function mentionsCardName(desc: string, cardName: string): boolean {
  return desc.toLowerCase().includes(cardName.toLowerCase());
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

  const cards = db.prepare('SELECT id, name, archetype, desc_en FROM cards').all() as CardMeta[];

  const byArchetype = new Map<string, CardMeta[]>();
  for (const card of cards) {
    if (!card.archetype) {
      continue;
    }
    const bucket = byArchetype.get(card.archetype) ?? [];
    bucket.push(card);
    byArchetype.set(card.archetype, bucket);
  }

  console.log('Building rule-based relations...');
  let relations = 0;

  runInTransaction(db, () => {
    clearRuleRelations(db);

    for (const pair of SYNERGY_PAIRS) {
      const triggers = byTag.get(pair.trigger) ?? [];
      const responses = byTag.get(pair.response) ?? [];
      for (const sourceId of triggers) {
        let linked = 0;
        for (const targetId of responses) {
          if (sourceId === targetId || linked >= MAX_TAG_RELATIONS_PER_SOURCE) {
            continue;
          }
          insertRelation(db, sourceId, targetId, pair.relation, 1.0);
          relations += 1;
          linked += 1;
        }
      }
    }

    for (const group of byArchetype.values()) {
      if (group.length < 2) {
        continue;
      }

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
          insertRelation(db, source.id, target.id, 'archetype', 0.55);
          relations += 1;
          archetypeLinks += 1;
        }
      }
    }

    for (const card of cards) {
      if (!card.name.toLowerCase().includes('galaxy') && !card.name.toLowerCase().includes('photon')) {
        continue;
      }
      const token = card.name.split(/[\s-]+/).find((part) => /^(galaxy|photon)/i.test(part));
      if (!token) {
        continue;
      }
      let linked = 0;
      for (const target of cards) {
        if (card.id === target.id || linked >= MAX_TAG_RELATIONS_PER_SOURCE) {
          continue;
        }
        if (!target.name.toLowerCase().includes(token.toLowerCase())) {
          continue;
        }
        insertRelation(db, card.id, target.id, 'series', 0.7);
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
