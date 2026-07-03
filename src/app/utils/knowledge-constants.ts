export const RELATION_LABEL_KEYS: Record<string, string> = {
  gy_synergy: 'knowledge.reason.gySynergy',
  engine: 'knowledge.reason.engine',
  series: 'knowledge.reason.series',
  archetype: 'knowledge.reason.archetype',
  mentions_card: 'knowledge.reason.mentionsCard',
  shared_mention: 'knowledge.reason.sharedMention',
  search_target: 'knowledge.reason.searchTarget',
};

export const RELATION_GROUP_KEYS: Record<string, string> = {
  engine: 'knowledge.group.engine',
  gy_synergy: 'knowledge.group.gySynergy',
  search_target: 'knowledge.group.searchTarget',
  mentions_card: 'knowledge.group.mentionsCard',
  shared_mention: 'knowledge.group.sharedMention',
  archetype: 'knowledge.group.archetype',
  series: 'knowledge.group.series',
};

export const SYNERGY_REASON_KEYS: Record<string, string> = {
  ...RELATION_LABEL_KEYS,
  mechanic_synergy: 'knowledge.reason.mechanicSynergy',
  matchup: 'decklist.completion.reason.matchup',
};

export const SIDE_STAPLE_TAGS = [
  'hand_trap',
  'negates',
  'destroys',
  'banishes',
  'bounce_to_hand',
] as const;

export const SIDE_STAPLE_TAG_SET = new Set<string>(SIDE_STAPLE_TAGS);
