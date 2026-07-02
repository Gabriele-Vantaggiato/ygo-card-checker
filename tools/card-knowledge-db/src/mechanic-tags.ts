export const MECHANIC_TAGS = [
  'self_to_gy',
  'sends_to_gy',
  'revives_from_gy',
  'gy_interaction',
  'mills',
  'searches_deck',
  'special_summons',
  'banishes',
  'negates',
  'destroys',
  'discards',
  'hand_trap',
  'bounce_to_hand',
  'draw',
  'mentions_photon',
  'mentions_galaxy',
] as const;

export type MechanicTag = (typeof MECHANIC_TAGS)[number];

interface TagRule {
  tag: MechanicTag;
  patterns: RegExp[];
}

const TAG_RULES: TagRule[] = [
  {
    tag: 'self_to_gy',
    patterns: [/sent to the GY/i, /mandat[oa] al Cimitero/i],
  },
  {
    tag: 'sends_to_gy',
    patterns: [/send .* to the GY/i, /manda .* al Cimitero/i],
  },
  {
    tag: 'revives_from_gy',
    patterns: [/Special Summon .* from (?:your )?GY/i, /Evocazione Speciale .* dal(?:la)? Cimitero/i],
  },
  {
    tag: 'gy_interaction',
    patterns: [/from (?:your )?GY/i, /dal(?:la)? Cimitero/i, /in the GY/i],
  },
  {
    tag: 'mills',
    patterns: [/send .* from the top of .* Deck to the GY/i, /manda .* dal tuo Deck al Cimitero/i],
  },
  {
    tag: 'searches_deck',
    patterns: [/add .* from your Deck/i, /aggiungi .* dal tuo Deck/i],
  },
  {
    tag: 'special_summons',
    patterns: [/Special Summon/i, /Evocazione Speciale/i],
  },
  {
    tag: 'banishes',
    patterns: [/banish/i, /bandisc/i],
  },
  {
    tag: 'negates',
    patterns: [/negate/i, /annulla/i],
  },
  {
    tag: 'destroys',
    patterns: [/destroy/i, /distrugg/i],
  },
  {
    tag: 'discards',
    patterns: [/discard/i, /scarta/i],
  },
  {
    tag: 'hand_trap',
    patterns: [/during either player's turn/i, /durante il turno di qualsiasi giocatore/i],
  },
  {
    tag: 'bounce_to_hand',
    patterns: [/return .* to the hand/i, /fai ritornare .* nella mano/i],
  },
  {
    tag: 'draw',
    patterns: [/draw \d+ card/i, /pesca \d+ cart/i],
  },
  {
    tag: 'mentions_photon',
    patterns: [/"Photon"/i, /'Photon'/i],
  },
  {
    tag: 'mentions_galaxy',
    patterns: [/"Galaxy"/i, /'Galaxy'/i, /"Galaxy-Eyes"/i],
  },
];

/** Tags that benefit when another card has the paired trigger tag. */
export const SYNERGY_PAIRS: Array<{ trigger: MechanicTag; response: MechanicTag; relation: string }> = [
  { trigger: 'self_to_gy', response: 'revives_from_gy', relation: 'gy_synergy' },
  { trigger: 'self_to_gy', response: 'gy_interaction', relation: 'gy_synergy' },
  { trigger: 'sends_to_gy', response: 'revives_from_gy', relation: 'gy_synergy' },
  { trigger: 'mills', response: 'gy_interaction', relation: 'gy_synergy' },
  { trigger: 'searches_deck', response: 'special_summons', relation: 'engine' },
  { trigger: 'mentions_photon', response: 'mentions_photon', relation: 'series' },
  { trigger: 'mentions_galaxy', response: 'mentions_galaxy', relation: 'series' },
];

export function detectMechanicTags(desc: string): MechanicTag[] {
  const text = desc.trim();
  if (!text) {
    return [];
  }
  return TAG_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map(
    (rule) => rule.tag,
  );
}
