import { isFormatMetaTag } from './format-legality.utils';

const INTERNAL_TAG_PREFIX = 'mention:';

const TAG_LABEL_KEYS: Record<string, string> = {
  ss_from_hand: 'knowledge.tag.ssFromHand',
  ss_from_gy: 'knowledge.tag.ssFromGy',
  ss_from_deck: 'knowledge.tag.ssFromDeck',
  ss_from_extra: 'knowledge.tag.ssFromExtra',
  searches_monster: 'knowledge.tag.searchesMonster',
  searches_spell: 'knowledge.tag.searchesSpell',
  searches_trap: 'knowledge.tag.searchesTrap',
  searches_deck: 'knowledge.tag.searchesDeck',
  special_summons: 'knowledge.tag.specialSummons',
  gy_interaction: 'knowledge.tag.gyInteraction',
  revives_from_gy: 'knowledge.tag.revivesFromGy',
  quick_effect: 'knowledge.tag.quickEffect',
  hand_trap: 'knowledge.tag.handTrap',
  once_per_turn: 'knowledge.tag.oncePerTurn',
  mentions_photon: 'knowledge.tag.photon',
  mentions_galaxy: 'knowledge.tag.galaxy',
};

const TAG_PRIORITY = [
  'ss_from_deck',
  'ss_from_hand',
  'ss_from_gy',
  'ss_from_extra',
  'searches_monster',
  'searches_spell',
  'revives_from_gy',
  'gy_interaction',
  'quick_effect',
  'hand_trap',
  'special_summons',
  'searches_deck',
  'once_per_turn',
  'mentions_photon',
  'mentions_galaxy',
];

export interface DisplayTag {
  id: string;
  labelKey: string;
}

export function toDisplayTags(tags: readonly string[]): DisplayTag[] {
  const unique = [
    ...new Set(
      tags.filter((tag) => !tag.startsWith(INTERNAL_TAG_PREFIX) && !isFormatMetaTag(tag)),
    ),
  ];
  unique.sort((a, b) => {
    const ai = TAG_PRIORITY.indexOf(a);
    const bi = TAG_PRIORITY.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return unique.slice(0, 8).map((id) => ({
    id,
    labelKey: TAG_LABEL_KEYS[id] ?? 'knowledge.tag.generic',
  }));
}

export const RELATION_GROUP_ORDER = [
  'engine',
  'gy_synergy',
  'search_target',
  'mentions_card',
  'shared_mention',
  'series',
  'archetype',
] as const;

export function relationGroupOrder(relation: string): number {
  const index = RELATION_GROUP_ORDER.indexOf(relation as (typeof RELATION_GROUP_ORDER)[number]);
  return index === -1 ? 99 : index;
}
