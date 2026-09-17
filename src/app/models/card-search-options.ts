export const SEARCH_TYPES = [
  'Normal Monster',
  'Effect Monster',
  'Fusion Monster',
  'Synchro Monster',
  'XYZ Monster',
  'Link Monster',
  'Pendulum Effect Monster',
  'Ritual Effect Monster',
  'Spell Card',
  'Trap Card',
];

export const SEARCH_RACES = [
  'Aqua',
  'Beast',
  'Beast-Warrior',
  'Cyberse',
  'Dinosaur',
  'Divine-Beast',
  'Dragon',
  'Fairy',
  'Fiend',
  'Fish',
  'Illusion',
  'Insect',
  'Machine',
  'Plant',
  'Psychic',
  'Pyro',
  'Reptile',
  'Rock',
  'Sea Serpent',
  'Spellcaster',
  'Thunder',
  'Warrior',
  'Winged Beast',
  'Wyrm',
  'Zombie',
  'Normal',
  'Continuous',
  'Counter',
  'Equip',
  'Field',
  'Quick-Play',
  'Ritual',
];

export const SEARCH_ATTRIBUTES = ['DARK', 'DIVINE', 'EARTH', 'FIRE', 'LIGHT', 'WATER', 'WIND'];

/**
 * BabelCDB-verified effect category tags (see tools/card-knowledge-db/src/babel-category.ts
 * for how these were derived and verified — only high-confidence bits are exposed here).
 */
export const SEARCH_CATEGORY_TAGS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: 'category_special_summon', labelKey: 'knowledge.tag.categorySpecialSummon' },
  { value: 'category_destroy', labelKey: 'knowledge.tag.categoryDestroy' },
  { value: 'category_send_to_gy', labelKey: 'knowledge.tag.categorySendToGy' },
  { value: 'category_banish', labelKey: 'knowledge.tag.categoryBanish' },
  { value: 'category_return_to_hand', labelKey: 'knowledge.tag.categoryReturnToHand' },
  { value: 'category_return_to_deck', labelKey: 'knowledge.tag.categoryReturnToDeck' },
  { value: 'category_draw', labelKey: 'knowledge.tag.categoryDraw' },
  { value: 'category_control_change', labelKey: 'knowledge.tag.categoryControlChange' },
  { value: 'category_position_change', labelKey: 'knowledge.tag.categoryPositionChange' },
  { value: 'category_negate', labelKey: 'knowledge.tag.categoryNegate' },
  { value: 'category_lp_damage', labelKey: 'knowledge.tag.categoryLpDamage' },
  { value: 'category_lp_recovery', labelKey: 'knowledge.tag.categoryLpRecovery' },
  { value: 'category_random', labelKey: 'knowledge.tag.categoryRandom' },
];
