import { EffectScript, EffectScriptIndex } from '../models/effect-script.model';
import {
  CardKnowledgeIndex,
  CardKnowledgeRelated,
  CardKnowledgeRosterMember,
} from '../models/card-knowledge.model';
import { GY_COMBO_STAPLES } from './synergy-retrieval.utils';

/** Tags that mean "this card wants GY partners not yet in the deck". */
const DECK_NEED_TAGS = new Set([
  'hand_to_gy',
  'sends_to_gy',
  'discards',
  'mills',
  'ss_from_gy',
  'revives_from_gy',
]);

/**
 * Partner tags we look for on candidates (same race preferred via raceIndex).
 * Broader than mechanicIndex response buckets so Goblin Zombie / Foolish still surface.
 */
const PARTNER_TAGS_BY_NEED: Record<string, string[]> = {
  hand_to_gy: [
    'gy_effect',
    'ss_from_gy',
    'revives_from_gy',
    'self_to_gy',
    'gy_interaction',
    'sends_to_gy',
    'searches_monster',
    'searches_deck',
  ],
  sends_to_gy: [
    'gy_effect',
    'ss_from_gy',
    'revives_from_gy',
    'self_to_gy',
    'gy_interaction',
  ],
  discards: ['gy_effect', 'self_to_gy', 'gy_interaction', 'sends_to_gy', 'searches_monster'],
  mills: ['gy_effect', 'ss_from_gy', 'gy_interaction', 'revives_from_gy'],
  ss_from_gy: ['sends_to_gy', 'hand_to_gy', 'mills', 'discards', 'gy_effect', 'self_to_gy'],
  revives_from_gy: ['sends_to_gy', 'hand_to_gy', 'mills', 'discards', 'gy_interaction'],
};

/** Spell/trap enablers pulled from mechanicIndex even without a race. */
const GENERIC_ENABLER_TAGS = ['sends_to_gy', 'mills', 'hand_to_gy', 'gy_interaction'] as const;

const RACE_TOKEN_RE =
  /\b(zombie|dragon|warrior|spellcaster|machine|fiend|fairy|insect|plant|beast-warrior|beast|dinosaur|wyrm|cyberse|psychic|rock|aqua|thunder|pyro|sea serpent|winged beast|reptile|divine-beast)\b/i;

export interface ScriptDeckSynergyHit extends CardKnowledgeRelated {
  sourceName: string;
  scriptBoost: number;
}

export interface ScriptDeckSynergyOptions {
  deckRaces?: ReadonlySet<string>;
  deckAttributes?: ReadonlySet<string>;
  deckSeries?: ReadonlySet<string>;
  /** Prefer / keep only format-legal partners when provided. */
  isPlayable?: (cardId: number) => boolean;
}

/**
 * Uses effect-script AST + raceIndex to propose format-wide partners not in the deck.
 * Race gate drops Athena-in-Zombie; raceIndex avoids the capped mechanicIndex flood.
 */
export function collectScriptDeckSynergies(
  deckCards: ReadonlyArray<{ id: number; name: string; quantity: number }>,
  index: CardKnowledgeIndex,
  scripts: EffectScriptIndex['scripts'] | Map<number, EffectScript> | Record<string, EffectScript>,
  excludeIds: ReadonlySet<number>,
  limit = 48,
  options: ScriptDeckSynergyOptions = {},
): ScriptDeckSynergyHit[] {
  const getScript = (id: number): EffectScript | undefined => {
    if (scripts instanceof Map) {
      return scripts.get(id);
    }
    return (scripts as Record<string, EffectScript>)[String(id)];
  };

  const merged = new Map<number, ScriptDeckSynergyHit>();
  const raceHints = new Set<string>([...(options.deckRaces ?? [])].map((r) => r.toLowerCase()));
  const attributeHints = new Set<string>(
    [...(options.deckAttributes ?? [])].map((a) => a.toLowerCase()),
  );
  const seriesHints = new Set<string>([...(options.deckSeries ?? [])].map((s) => s.toLowerCase()));
  const needTags = new Set<string>();

  for (const card of deckCards) {
    const script = getScript(card.id);
    const entry = index.entries[String(card.id)];

    if (entry?.race) {
      raceHints.add(entry.race.toLowerCase());
    }
    if (entry?.attribute) {
      attributeHints.add(entry.attribute.toLowerCase());
    }
    for (const series of entry?.series ?? []) {
      seriesHints.add(series.toLowerCase());
    }

    if (script) {
      for (const step of script.steps) {
        for (const produced of step.produces ?? []) {
          needTags.add(produced);
        }
        for (const action of step.actions) {
          if (action.op === 'discard' || (action.from === 'hand' && action.to === 'gy')) {
            needTags.add('hand_to_gy');
          }
          if (action.op === 'ss' && action.from === 'gy') {
            needTags.add('ss_from_gy');
          }
          const filter = action.filter?.toLowerCase() ?? '';
          const race = filter.match(RACE_TOKEN_RE);
          if (race?.[1]) {
            raceHints.add(normalizeRaceToken(race[1]));
          }
        }
      }
    }

    for (const tag of entry?.tags ?? []) {
      if (DECK_NEED_TAGS.has(tag)) {
        needTags.add(tag);
      }
    }
  }

  if (needTags.size === 0) {
    return [];
  }

  const partnerTags = new Set<string>();
  for (const need of needTags) {
    for (const tag of PARTNER_TAGS_BY_NEED[need] ?? []) {
      partnerTags.add(tag);
    }
  }

  const sourceName =
    deckCards.find((card) => {
      const entry = index.entries[String(card.id)];
      return entry?.tags.some((tag) => DECK_NEED_TAGS.has(tag));
    })?.name ??
    deckCards[0]?.name ??
    'deck';

  const qtyBoost = Math.max(
    1,
    deckCards.reduce((sum, card) => {
      const entry = index.entries[String(card.id)];
      const relevant = entry?.tags.some((tag) => DECK_NEED_TAGS.has(tag)) ? card.quantity : 0;
      return sum + relevant;
    }, 0),
  );

  const consider = (member: CardKnowledgeRosterMember, matchedTag: string): void => {
    if (excludeIds.has(member.id)) {
      return;
    }
    if (options.isPlayable && !options.isPlayable(member.id)) {
      return;
    }
    if (!isCompatibleMonsterPartner(member, raceHints, attributeHints, seriesHints)) {
      return;
    }
    const boost = scoreScriptPartner(member, raceHints, attributeHints, seriesHints, matchedTag);
    if (boost <= 0) {
      return;
    }
    const existing = merged.get(member.id);
    if (existing) {
      existing.score += boost * qtyBoost;
      existing.scriptBoost += boost;
      return;
    }
    merged.set(member.id, {
      id: member.id,
      name: member.name,
      relation: 'gy_synergy',
      score: boost * qtyBoost,
      archetype: member.archetype,
      race: member.race ?? null,
      attribute: member.attribute ?? null,
      tcgDate: member.tcgDate,
      banTcg: member.banTcg,
      imageSmall: member.imageSmall,
      mechanicTrigger: matchedTag,
      sourceName,
      scriptBoost: boost,
    });
  };

  // 1) Same-race monsters with complementary tags (primary — bypasses mechanicIndex cap).
  for (const race of raceHints) {
    for (const member of raceMembersFor(index, race)) {
      const entry = index.entries[String(member.id)];
      if (!entry) {
        continue;
      }
      const matched = [...partnerTags].find((tag) => entry.tags.includes(tag));
      if (!matched) {
        continue;
      }
      consider(member, matched);
    }
  }

  // 2) Classic spell/trap GY enablers only (avoid Final Destiny-style flood).
  for (const tag of GENERIC_ENABLER_TAGS) {
    if (!needTags.has('ss_from_gy') && !needTags.has('revives_from_gy') && !needTags.has('hand_to_gy') && !needTags.has('mills')) {
      continue;
    }
    for (const member of index.mechanicIndex?.[tag] ?? []) {
      if (member.type.toLowerCase().includes('monster')) {
        continue;
      }
      if (!GY_COMBO_STAPLES.has(member.name.toLowerCase())) {
        continue;
      }
      consider(member, tag);
    }
  }

  // 3) Fallback: mechanicIndex responses (monsters + curated staples only).
  for (const tag of partnerTags) {
    for (const member of index.mechanicIndex?.[tag] ?? []) {
      const isMonster = member.type.toLowerCase().includes('monster');
      if (!isMonster && !GY_COMBO_STAPLES.has(member.name.toLowerCase())) {
        continue;
      }
      consider(member, tag);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function normalizeRaceToken(raw: string): string {
  const token = raw.toLowerCase().trim();
  if (token === 'dino') {
    return 'dinosaur';
  }
  if (token === 'beast warrior') {
    return 'beast-warrior';
  }
  return token;
}

export function raceMembersFor(
  index: CardKnowledgeIndex,
  raceHint: string,
): CardKnowledgeRosterMember[] {
  const raceIndex = index.raceIndex ?? {};
  const hint = raceHint.toLowerCase();
  const direct = raceIndex[raceHint] ?? raceIndex[hint];
  if (direct) {
    return direct;
  }
  for (const [key, members] of Object.entries(raceIndex)) {
    if (key.toLowerCase() === hint) {
      return members;
    }
  }
  return [];
}

/** Spells/traps always ok; monsters must match race gate when the deck has one. */
export function isCompatibleMonsterPartner(
  member: CardKnowledgeRosterMember,
  raceHints: ReadonlySet<string>,
  _attributeHints: ReadonlySet<string> = new Set(),
  seriesHints: ReadonlySet<string> = new Set(),
): boolean {
  if (!member.type.toLowerCase().includes('monster')) {
    return true;
  }
  if (GY_COMBO_STAPLES.has(member.name.toLowerCase())) {
    return true;
  }
  if (raceHints.size === 0) {
    return true;
  }

  const race = (member.race ?? '').toLowerCase();
  if (race && raceHints.has(race)) {
    return true;
  }

  const archetype = (member.archetype ?? '').toLowerCase();
  const name = member.name.toLowerCase();
  for (const hint of raceHints) {
    if (name.includes(hint) || archetype.includes(hint)) {
      return true;
    }
  }
  for (const series of seriesHints) {
    if (archetype === series || name.includes(series)) {
      return true;
    }
  }

  return false;
}

function scoreScriptPartner(
  member: CardKnowledgeRosterMember,
  raceHints: ReadonlySet<string>,
  attributeHints: ReadonlySet<string>,
  seriesHints: ReadonlySet<string>,
  responseTag: string,
): number {
  let score = 0.55;
  if (GY_COMBO_STAPLES.has(member.name.toLowerCase())) {
    score += 0.55;
  }
  if (
    responseTag === 'gy_effect' ||
    responseTag === 'ss_from_gy' ||
    responseTag === 'revives_from_gy' ||
    responseTag === 'sends_to_gy'
  ) {
    score += 0.12;
  }

  const race = (member.race ?? '').toLowerCase();
  if (race && raceHints.has(race)) {
    score += 0.55;
  } else if (raceHints.size > 0 && member.type.toLowerCase().includes('monster')) {
    if (!GY_COMBO_STAPLES.has(member.name.toLowerCase())) {
      return 0;
    }
  }

  const attribute = (member.attribute ?? '').toLowerCase();
  if (attribute && attributeHints.has(attribute)) {
    score += 0.12;
  }

  const archetype = (member.archetype ?? '').toLowerCase();
  for (const series of seriesHints) {
    if (archetype === series || member.name.toLowerCase().includes(series)) {
      score += 0.2;
      break;
    }
  }

  return score;
}
