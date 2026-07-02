export const MECHANIC_TAGS = [
  'self_to_gy',
  'sends_to_gy',
  'revives_from_gy',
  'gy_interaction',
  'mills',
  'searches_deck',
  'searches_monster',
  'searches_spell',
  'searches_trap',
  'special_summons',
  'ss_from_hand',
  'ss_from_gy',
  'ss_from_deck',
  'ss_from_extra',
  'banishes',
  'negates',
  'destroys',
  'discards',
  'hand_trap',
  'bounce_to_hand',
  'draw',
  'quick_effect',
  'trigger_effect',
  'once_per_turn',
  'hard_opt',
  'mentions_photon',
  'mentions_galaxy',
] as const;

export type MechanicTag = (typeof MECHANIC_TAGS)[number];

interface TagRule {
  tag: MechanicTag;
  patterns: RegExp[];
}

const TAG_RULES: TagRule[] = [
  { tag: 'self_to_gy', patterns: [/sent to the GY/i, /mandat[oa] al Cimitero/i] },
  { tag: 'sends_to_gy', patterns: [/send .* to the GY/i, /manda .* al Cimitero/i] },
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
  { tag: 'searches_deck', patterns: [/add .* from your Deck/i, /aggiungi .* dal tuo Deck/i] },
  {
    tag: 'searches_monster',
    patterns: [/add .* (?:Monster|monsters) .* from your Deck/i, /aggiungi .* mostr[oi] .* dal tuo Deck/i],
  },
  {
    tag: 'searches_spell',
    patterns: [/add .* (?:Spell|Spells) .* from your Deck/i, /aggiungi .* magi[ae] .* dal tuo Deck/i],
  },
  {
    tag: 'searches_trap',
    patterns: [/add .* (?:Trap|Traps) .* from your Deck/i, /aggiungi .* trappol[ae] .* dal tuo Deck/i],
  },
  { tag: 'special_summons', patterns: [/Special Summon/i, /Evocazione Speciale/i] },
  {
    tag: 'ss_from_hand',
    patterns: [/Special Summon .* from your hand/i, /Evocazione Speciale .* dalla tua mano/i, /\(from your hand\)/i],
  },
  {
    tag: 'ss_from_gy',
    patterns: [/Special Summon .* from (?:your )?GY/i, /Evocazione Speciale .* dal(?:la)? Cimitero/i],
  },
  {
    tag: 'ss_from_deck',
    patterns: [/Special Summon .* from your Deck/i, /Evocazione Speciale .* dal tuo Deck/i],
  },
  {
    tag: 'ss_from_extra',
    patterns: [/Special Summon .* from (?:your )?Extra Deck/i, /Evocazione Speciale .* dall'Extra Deck/i],
  },
  { tag: 'banishes', patterns: [/banish/i, /bandisc/i] },
  { tag: 'negates', patterns: [/negate/i, /annulla/i] },
  { tag: 'destroys', patterns: [/destroy/i, /distrugg/i] },
  { tag: 'discards', patterns: [/discard/i, /scarta/i] },
  {
    tag: 'hand_trap',
    patterns: [/during either player's turn/i, /durante il turno di qualsiasi giocatore/i],
  },
  { tag: 'bounce_to_hand', patterns: [/return .* to the hand/i, /fai ritornare .* nella mano/i] },
  { tag: 'draw', patterns: [/draw \d+ card/i, /pesca \d+ cart/i] },
  { tag: 'quick_effect', patterns: [/\(Quick Effect\)/i, /\(Effetto Rapido\)/i] },
  {
    tag: 'trigger_effect',
    patterns: [/\bWhen\b/i, /\bIf\b.*you can/i, /\bQuando\b/i, /\bSe\b.*puoi/i],
  },
  { tag: 'once_per_turn', patterns: [/once per turn/i, /una volta per turno/i] },
  {
    tag: 'hard_opt',
    patterns: [/You can only (?:activate|use) (?:1|one) /i, /Puoi attivare solo 1 /i, /Puoi usare solo 1 /i],
  },
  { tag: 'mentions_photon', patterns: [/"Photon"/i, /'Photon'/i] },
  { tag: 'mentions_galaxy', patterns: [/"Galaxy"/i, /'Galaxy'/i, /"Galaxy-Eyes"/i] },
];

/** Enabler tags used for runtime cross-deck mechanic enrichment (no coarse/generic triggers). */
export const ENRICHMENT_TRIGGER_TAGS = [
  'mills',
  'sends_to_gy',
  'self_to_gy',
  'discards',
  'gy_interaction',
  'searches_monster',
  'searches_spell',
  'searches_trap',
] as const satisfies readonly MechanicTag[];

/** Tags that benefit when another card has the paired trigger tag. */
export const SYNERGY_PAIRS: Array<{ trigger: MechanicTag; response: MechanicTag; relation: string }> = [
  { trigger: 'self_to_gy', response: 'revives_from_gy', relation: 'gy_synergy' },
  { trigger: 'self_to_gy', response: 'ss_from_gy', relation: 'gy_synergy' },
  { trigger: 'sends_to_gy', response: 'revives_from_gy', relation: 'gy_synergy' },
  { trigger: 'sends_to_gy', response: 'ss_from_gy', relation: 'gy_synergy' },
  { trigger: 'mills', response: 'gy_interaction', relation: 'gy_synergy' },
  { trigger: 'mills', response: 'ss_from_gy', relation: 'gy_synergy' },
  { trigger: 'mills', response: 'draw', relation: 'engine' },
  { trigger: 'self_to_gy', response: 'draw', relation: 'engine' },
  { trigger: 'sends_to_gy', response: 'draw', relation: 'engine' },
  { trigger: 'discards', response: 'draw', relation: 'engine' },
  { trigger: 'mills', response: 'discards', relation: 'gy_synergy' },
  { trigger: 'searches_monster', response: 'ss_from_hand', relation: 'engine' },
  { trigger: 'searches_monster', response: 'ss_from_deck', relation: 'engine' },
  { trigger: 'searches_monster', response: 'ss_from_extra', relation: 'engine' },
  { trigger: 'mentions_photon', response: 'mentions_photon', relation: 'series' },
  { trigger: 'mentions_galaxy', response: 'mentions_galaxy', relation: 'series' },
];

/** Subset exported for per-card runtime enrichment (excludes series and generic pairs). */
export const MECHANIC_ENRICHMENT_PAIRS = SYNERGY_PAIRS.filter(
  (pair) =>
    pair.relation !== 'series' &&
    (ENRICHMENT_TRIGGER_TAGS as readonly string[]).includes(pair.trigger),
);

const LEGACY_DERIVED: Array<{ fine: MechanicTag; coarse: MechanicTag }> = [
  { fine: 'ss_from_hand', coarse: 'special_summons' },
  { fine: 'ss_from_gy', coarse: 'special_summons' },
  { fine: 'ss_from_deck', coarse: 'special_summons' },
  { fine: 'ss_from_extra', coarse: 'special_summons' },
  { fine: 'searches_monster', coarse: 'searches_deck' },
  { fine: 'searches_spell', coarse: 'searches_deck' },
  { fine: 'searches_trap', coarse: 'searches_deck' },
];

export function detectMechanicTags(desc: string): MechanicTag[] {
  const text = desc.trim();
  if (!text) {
    return [];
  }
  const tags = new Set<MechanicTag>(
    TAG_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map((rule) => rule.tag),
  );

  for (const { fine, coarse } of LEGACY_DERIVED) {
    if (tags.has(fine)) {
      tags.add(coarse);
    }
  }

  return [...tags];
}

export function detectCardTags(input: {
  name: string;
  archetype?: string | null;
  descEn: string;
  descIt?: string | null;
  mentions?: string[];
}): MechanicTag[] {
  const tags = new Set<MechanicTag>(detectMechanicTags(input.descEn));
  if (input.descIt) {
    for (const tag of detectMechanicTags(input.descIt)) {
      tags.add(tag);
    }
  }

  const name = input.name;
  if (/\bPhoton\b/i.test(name) || input.archetype === 'Photon') {
    tags.add('mentions_photon');
  }
  if (/\bGalaxy(?:-Eyes)?\b/i.test(name) || input.archetype === 'Galaxy-Eyes' || input.archetype === 'Galaxy') {
    tags.add('mentions_galaxy');
  }

  for (const mention of input.mentions ?? []) {
    if (/^Photon$/i.test(mention)) {
      tags.add('mentions_photon');
    }
    if (/^Galaxy/i.test(mention)) {
      tags.add('mentions_galaxy');
    }
  }

  return [...tags];
}

export function mentionTagName(mention: string): string {
  return `mention:${mention.toLowerCase().replace(/\s+/g, '_')}`;
}
