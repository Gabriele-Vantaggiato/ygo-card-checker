/**
 * Pillar 2: ingestion/parsing service. Turns raw YGOProDeck card text into a
 * SemanticProfile (Pillar 1). Interface + a regex-rule skeleton implementation —
 * rules are first-pass heuristics over PSCT phrasing, meant to be extended
 * (or swapped for an LLM-backed implementation, see tag-llm.ts for that precedent)
 * without touching callers.
 */
import type { CardOutcome, CardRestrictions, CardRole, CardTrigger, SemanticProfile } from './semantic-model';
import { detectCardTags } from './mechanic-tags';
import { parseCardEffects } from './effect-parser';

export interface CardSemanticParserInput {
  name: string;
  archetype: string | null;
  descEn: string;
  descIt?: string | null;
  mentions?: string[];
}

export interface CardSemanticParserService {
  parse(input: CardSemanticParserInput): SemanticProfile;
}

function detectTriggers(desc: string): CardTrigger[] {
  const triggers = new Set<CardTrigger>();
  if (/(?:When|If) this card is Normal Summoned/i.test(desc)) triggers.add('on_normal_summon');
  if (/(?:When|If) this card is Special Summoned/i.test(desc)) triggers.add('on_special_summon');
  if (/sent to the GY/i.test(desc)) triggers.add('sent_to_grave');
  if (/banish this card from (?:your )?GY/i.test(desc) || /this card from your GY/i.test(desc)) {
    triggers.add('banished_from_grave');
  }
  if (/during (?:the |your )?(?:Main Phase)/i.test(desc)) triggers.add('on_main_phase');
  if (/during (?:the |your )?Draw Phase/i.test(desc)) triggers.add('on_draw_phase');
  if (/your opponent activates/i.test(desc) || /during your opponent's turn/i.test(desc)) {
    triggers.add('on_opponent_activation');
  }
  if (/destroyed by battle or card effect/i.test(desc)) triggers.add('on_card_destroyed');
  if (/while this card is in your hand/i.test(desc)) triggers.add('in_hand');
  if (/during either player's turn/i.test(desc)) triggers.add('anytime');
  // Most real hand traps mark themselves with "(Quick Effect)" rather than literally
  // saying "during either player's turn" (e.g. Ash Blossom, Droll & Lock Bird): a Quick
  // Effect that pays a cost from the hand itself (discard/banish/reveal "this card") is
  // usable as an interrupt on the opponent's turn regardless of exact phrasing.
  if (
    /\(Quick Effect\)/i.test(desc) &&
    /(?:discard|banish|reveal) this card/i.test(desc)
  ) {
    triggers.add('anytime');
  }
  return [...triggers];
}

function detectOutcomes(desc: string, effectKinds: ReadonlySet<string>): CardOutcome[] {
  const outcomes = new Set<CardOutcome>();
  if (effectKinds.has('add_from_deck')) outcomes.add('search_deck');
  if (
    effectKinds.has('special_summon_deck') ||
    effectKinds.has('special_summon_gy') ||
    effectKinds.has('tribute_special_summon') ||
    effectKinds.has('synchro_summon') ||
    effectKinds.has('xyz_summon')
  ) {
    outcomes.add('special_summon');
  }
  if (/destroy/i.test(desc)) outcomes.add('destroy_card');
  if (/negate/i.test(desc)) outcomes.add('negate_effect');
  if (/banish/i.test(desc)) outcomes.add('banish');
  if (/draw \d+ cards?/i.test(desc)) outcomes.add('draw_card');
  if (/send .* from the top of .* Deck to the GY/i.test(desc)) outcomes.add('mill');
  if (/return .* to the hand/i.test(desc)) outcomes.add('bounce_to_hand');
  if (/return .* to the (?:top|bottom) of the Deck/i.test(desc)) outcomes.add('bounce_to_deck');
  if (/gain \d+ LP/i.test(desc)) outcomes.add('gain_lp');
  if (/(?:inflict|take) \d+ (?:points? of )?damage/i.test(desc)) outcomes.add('inflict_damage');
  return [...outcomes];
}

function detectCostFlags(desc: string): { discardsForCost: boolean; tributesForCost: boolean; banishesForCost: boolean } {
  return {
    discardsForCost: /[Dd]iscard \d+ cards?(?:,\s*(?:then|and)| as (?:the )?[Cc]ost)/.test(desc),
    tributesForCost: /[Tt]ribute(?:ing)? \d+ monsters?(?:,\s*(?:then|and)| as (?:the )?[Cc]ost)/.test(desc),
    banishesForCost: /[Bb]anish \d+ cards? (?:from your hand|you control)(?:,\s*(?:then|and)| as (?:the )?[Cc]ost)/.test(
      desc,
    ),
  };
}

const ATTRIBUTES = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
const RACE_LOCK_PATTERN = /monsters? you control must all be "?([A-Z][a-zA-Z-]+)"? (?:type|Type)/;

function detectRestrictions(desc: string): CardRestrictions {
  const restrictions: CardRestrictions = {};

  const attributeLock = desc.match(
    /you can only (?:Normal or )?Special Summon "?([A-Z]+)"? Attribute monsters/i,
  );
  if (attributeLock && ATTRIBUTES.includes(attributeLock[1].toUpperCase())) {
    restrictions.restrictsSummonToAttribute = attributeLock[1].toUpperCase();
  } else {
    for (const attribute of ATTRIBUTES) {
      if (new RegExp(`your (?:monsters|Deck) can only be ${attribute} monsters`, 'i').test(desc)) {
        restrictions.restrictsSummonToAttribute = attribute;
        break;
      }
    }
  }

  const raceLock = desc.match(RACE_LOCK_PATTERN);
  if (raceLock) {
    restrictions.restrictsSummonToRace = raceLock[1];
  }

  const archetypeLock = desc.match(/you can only (?:Normal or )?Special Summon "([^"]+)" monsters/i);
  if (archetypeLock) {
    restrictions.restrictsSummonToArchetype = archetypeLock[1];
  }

  return restrictions;
}

/**
 * Role assignment order matters: a card can only carry a small, meaningful role set,
 * so more specific roles (handtrap, floodgate) are checked before generic ones
 * (starter, extender) to avoid mislabeling e.g. a floodgate hand trap as a "starter".
 */
function detectRoles(input: {
  desc: string;
  archetype: string | null;
  triggers: CardTrigger[];
  outcomes: CardOutcome[];
  restrictions: CardRestrictions;
  hasControlRequirement: boolean;
  mentionCount: number;
}): CardRole[] {
  const roles = new Set<CardRole>();
  const { desc, triggers, outcomes, restrictions, hasControlRequirement, mentionCount, archetype } = input;

  if (triggers.includes('anytime') && !outcomes.includes('special_summon')) {
    roles.add('handtrap');
  }

  if (Object.keys(restrictions).length > 0 || /cannot be Special Summoned/i.test(desc)) {
    roles.add('floodgate');
  }

  if (outcomes.includes('search_deck') && !hasControlRequirement) {
    roles.add('starter');
  }

  if (outcomes.includes('special_summon') && hasControlRequirement) {
    roles.add('extender');
  }

  if (
    (outcomes.includes('destroy_card') || outcomes.includes('negate_effect') || outcomes.includes('banish')) &&
    (triggers.includes('anytime') || triggers.includes('on_opponent_activation'))
  ) {
    roles.add('boardbreaker');
  }

  if (archetype && hasControlRequirement && roles.size === 0) {
    roles.add('garnet');
  }

  if (mentionCount > 0 && roles.size === 0) {
    roles.add('engine_piece');
  }

  return [...roles];
}

export class RuleBasedCardSemanticParser implements CardSemanticParserService {
  parse(input: CardSemanticParserInput): SemanticProfile {
    const desc = input.descEn ?? '';
    const tags = detectCardTags({
      name: input.name,
      archetype: input.archetype,
      descEn: desc,
      descIt: input.descIt,
      mentions: input.mentions,
    });
    const parsedEffects = parseCardEffects(desc);
    const effectKinds = new Set(parsedEffects.effects.map((effect) => effect.kind));
    const hasControlRequirement = parsedEffects.requirements.length > 0;

    const triggers = detectTriggers(desc);
    const outcomes = detectOutcomes(desc, effectKinds);
    const costFlags = detectCostFlags(desc);
    const restrictions = detectRestrictions(desc);

    // hand_trap tag from mechanic-tags.ts is a stronger, battle-tested signal than the
    // 'anytime' trigger regex alone — fold it in so e.g. Ash Blossom is never missed.
    if (tags.includes('hand_trap') && !triggers.includes('anytime')) {
      triggers.push('anytime');
    }

    const roles = detectRoles({
      desc,
      archetype: input.archetype,
      triggers,
      outcomes,
      restrictions,
      hasControlRequirement,
      mentionCount: input.mentions?.length ?? 0,
    });

    return { roles, triggers, outcomes, costFlags, restrictions };
  }
}
