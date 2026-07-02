export interface ControlRequirement {
  kind: 'control';
  minLevel: number;
  names: string[];
}

export interface SpecialSummonFromDeckPayoff {
  kind: 'special_summon_deck';
  minLevel: number;
  names: string[];
  position: 'defense' | 'attack' | 'any';
}

export interface SelfSummonHandTributePayoff {
  kind: 'self_summon_hand_tribute_atk';
  tributeCount: number;
  minAtk: number;
}

export interface SpecialSummonFromGyPayoff {
  kind: 'special_summon_gy';
  names: string[];
}

export interface AddFromDeckPayoff {
  kind: 'add_from_deck';
  names: string[];
  toHand: boolean;
}

export interface TributeSummonPayoff {
  kind: 'tribute_summon';
  tributeCount: number;
  names: string[];
}

export interface TributeSpecialSummonPayoff {
  kind: 'tribute_special_summon';
  tributeCount: number;
  tributeNames: string[];
  summonNames: string[];
  fromHandOrDeck: boolean;
}

export interface SynchroSummonPayoff {
  kind: 'synchro_summon';
  minLevel: number | null;
  names: string[];
}

export interface XyzSummonPayoff {
  kind: 'xyz_summon';
  rank: number | null;
  names: string[];
}

export type ComboPayoffParsed =
  | SpecialSummonFromDeckPayoff
  | SelfSummonHandTributePayoff
  | SpecialSummonFromGyPayoff
  | AddFromDeckPayoff
  | TributeSummonPayoff
  | TributeSpecialSummonPayoff
  | SynchroSummonPayoff
  | XyzSummonPayoff;

export type StructuredEffect = ControlRequirement | ComboPayoffParsed;

export type EffectKind = StructuredEffect['kind'];

export interface ParsedCardEffects {
  requirements: ControlRequirement[];
  payoffs: ComboPayoffParsed[];
  effects: StructuredEffect[];
}

export function extractQuotedNames(text: string): string[] {
  const names = new Set<string>();
  const pattern = /["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 1) {
      names.add(name);
    }
  }
  return [...names];
}

export function extractMentions(desc: string): string[] {
  return extractQuotedNames(desc);
}

export function parseControlRequirement(desc: string): ControlRequirement | null {
  const match = desc.match(/If you control a Level (\d+) or higher\s+(.+?)\s+monster/i);
  if (!match) {
    return null;
  }
  const names = extractQuotedNames(match[2]);
  if (names.length === 0) {
    return null;
  }
  return { kind: 'control', minLevel: Number(match[1]), names };
}

export function parseSpecialSummonFromDeck(desc: string): SpecialSummonFromDeckPayoff | null {
  const match = desc.match(
    /Special Summon\s+(?:\d+\s+)?Level (\d+) or higher\s+(.+?)\s+monster from your Deck(?:\s+in\s+(Defense|Attack)\s+Position)?/i,
  );
  if (!match) {
    return null;
  }
  const names = extractQuotedNames(match[2]);
  if (names.length === 0) {
    return null;
  }
  const position =
    match[3]?.toLowerCase() === 'defense'
      ? 'defense'
      : match[3]?.toLowerCase() === 'attack'
        ? 'attack'
        : 'any';
  return { kind: 'special_summon_deck', minLevel: Number(match[1]), names, position };
}

export function parseSelfSummonHandTributeAtk(desc: string): SelfSummonHandTributePayoff | null {
  const match = desc.match(
    /Special Summon this card \(from your hand\) by Tributing (\d+) monsters? with (\d{3,4}) or more ATK/i,
  );
  if (!match) {
    return null;
  }
  return {
    kind: 'self_summon_hand_tribute_atk',
    tributeCount: Number(match[1]),
    minAtk: Number(match[2]),
  };
}

export function parseSpecialSummonFromGy(desc: string): SpecialSummonFromGyPayoff | null {
  const patterns = [
    /Special Summon (?:\d+\s+)?(.+?)\s+from (?:your )?GY/i,
    /Special Summon (?:\d+\s+)?(.+?)\s+from your Graveyard/i,
  ];

  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (!match) {
      continue;
    }
    const names = extractQuotedNames(match[1]);
    if (names.length === 0) {
      continue;
    }
    return { kind: 'special_summon_gy', names };
  }

  return null;
}

export function parseAddFromDeck(desc: string): AddFromDeckPayoff | null {
  const patterns = [
    /add\s+(?:\d+\s+)?(.+?)\s+from your Deck(?:\s+to your hand)?/i,
    /add\s+(?:to your hand,?\s+)?(?:\d+\s+)?(.+?)\s+from your Deck/i,
    /add\s+(?:\d+\s+)?(.+?)\s+from your Deck to your hand/i,
  ];

  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (!match) {
      continue;
    }
    const names = extractQuotedNames(match[1]);
    if (names.length === 0) {
      continue;
    }
    const toHand = /to your hand/i.test(match[0]);
    return { kind: 'add_from_deck', names, toHand };
  }

  return null;
}

export function parseTributeSummon(desc: string): TributeSummonPayoff | null {
  const match = desc.match(
    /Tributing (\d+) (?:monsters?|".+?" monsters?)[^.;]*Special Summon(?:\s+this card)?(?:\s+\(from your hand\))?/i,
  );
  if (!match) {
    return null;
  }
  const names = extractQuotedNames(desc);
  return {
    kind: 'tribute_summon',
    tributeCount: Number(match[1]),
    names,
  };
}

export function parseTributeSpecialSummon(desc: string): TributeSpecialSummonPayoff | null {
  const patterns = [
    /Tribute (\d+)\s+(.+?)\.\s*Special Summon (?:\d+\s+)?(.+?)\s+from your (?:hand or )?Deck/i,
    /Tribute\s+(.+?)\.\s*Special Summon (?:\d+\s+)?(.+?)\s+from your (?:hand or )?Deck/i,
    /Tribute (\d+)\s+(.+?);\s*Special Summon (?:\d+\s+)?(.+?)\s+from your (?:hand or )?Deck/i,
  ];

  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (!match) {
      continue;
    }

    const tributePart = match.length === 5 ? match[2] : match[1];
    const summonPart = match.length === 5 ? match[3] : match[2];
    const tributeCount = match.length === 5 ? Number(match[1]) : 1;
    const tributeNames = extractQuotedNames(tributePart);
    const summonNames = extractQuotedNames(summonPart);
    if (tributeNames.length === 0 || summonNames.length === 0) {
      continue;
    }

    return {
      kind: 'tribute_special_summon',
      tributeCount,
      tributeNames,
      summonNames,
      fromHandOrDeck: true,
    };
  }

  return null;
}

export function parseSpecialSummonHandOrDeck(desc: string): SpecialSummonFromDeckPayoff | null {
  const match = desc.match(
    /Special Summon (?:\d+\s+)?(.+?)\s+from your (?:hand or )?Deck/i,
  );
  if (!match || /Level \d+/i.test(match[1])) {
    return null;
  }

  const names = extractQuotedNames(match[1]);
  if (names.length === 0) {
    return null;
  }

  return {
    kind: 'special_summon_deck',
    minLevel: 0,
    names,
    position: 'any',
  };
}

export function parseSynchroSummon(desc: string): SynchroSummonPayoff | null {
  if (!/Synchro Summon/i.test(desc)) {
    return null;
  }
  const levelMatch = desc.match(/Level (\d+) or higher/i);
  const names = extractQuotedNames(desc);
  if (names.length === 0 && !levelMatch) {
    return null;
  }
  return {
    kind: 'synchro_summon',
    minLevel: levelMatch ? Number(levelMatch[1]) : null,
    names,
  };
}

export function parseXyzSummon(desc: string): XyzSummonPayoff | null {
  if (!/Xyz Summon/i.test(desc) && !/Rank (\d+)/i.test(desc)) {
    return null;
  }
  const rankMatch = desc.match(/Rank (\d+)/i);
  const names = extractQuotedNames(desc);
  return {
    kind: 'xyz_summon',
    rank: rankMatch ? Number(rankMatch[1]) : null,
    names,
  };
}

export function parseCardEffects(desc: string): ParsedCardEffects {
  const requirements: ControlRequirement[] = [];
  const payoffs: ComboPayoffParsed[] = [];
  const effects: StructuredEffect[] = [];

  const parsers: Array<() => StructuredEffect | null> = [
    parseControlRequirement,
    parseTributeSpecialSummon,
    parseSpecialSummonFromDeck,
    parseSpecialSummonHandOrDeck,
    parseSelfSummonHandTributeAtk,
    parseSpecialSummonFromGy,
    parseAddFromDeck,
    parseTributeSummon,
    parseSynchroSummon,
    parseXyzSummon,
  ];

  const seen = new Set<EffectKind>();
  for (const parse of parsers) {
    const effect = parse(desc);
    if (!effect || seen.has(effect.kind)) {
      continue;
    }
    seen.add(effect.kind);
    effects.push(effect);
    if (effect.kind === 'control') {
      requirements.push(effect);
    } else {
      payoffs.push(effect);
    }
  }

  return { requirements, payoffs, effects };
}

export function mergeParsedEffects(a: ParsedCardEffects, b: ParsedCardEffects): ParsedCardEffects {
  const effects: StructuredEffect[] = [];
  const seen = new Set<EffectKind>();
  for (const effect of [...a.effects, ...b.effects]) {
    if (seen.has(effect.kind)) {
      continue;
    }
    seen.add(effect.kind);
    effects.push(effect);
  }
  return {
    requirements: effects.filter((e): e is ControlRequirement => e.kind === 'control'),
    payoffs: effects.filter((e): e is ComboPayoffParsed => e.kind !== 'control'),
    effects,
  };
}

export function cardMatchesNames(input: {
  name: string;
  archetype: string | null;
  desc: string;
  names: string[];
}): boolean {
  const archetype = input.archetype?.toLowerCase() ?? '';
  const name = input.name.toLowerCase();
  const desc = input.desc.toLowerCase();
  return input.names.some((token) => {
    const needle = token.toLowerCase();
    return (
      name.includes(needle) ||
      archetype === needle ||
      archetype.includes(needle) ||
      desc.includes(`"${token}"`) ||
      desc.includes(`'${token}'`)
    );
  });
}

export function seriesNamesForCard(input: {
  name: string;
  archetype: string | null;
}): string[] {
  const names = new Set<string>();
  if (input.archetype) {
    names.add(input.archetype);
  }
  if (/\bPhoton\b/i.test(input.name)) {
    names.add('Photon');
  }
  if (/\bGalaxy-Eyes\b/i.test(input.name)) {
    names.add('Galaxy-Eyes');
    names.add('Galaxy');
    names.add('Photon');
  } else   if (/\bGalaxy\b/i.test(input.name)) {
    names.add('Galaxy');
  }
  if (/\bCyber\b/i.test(input.name)) {
    names.add('Cyber');
  }
  if (/\bShaddoll\b/i.test(input.name)) {
    names.add('Shaddoll');
  }
  if (/\bBranded\b/i.test(input.name) || /\bDespia\b/i.test(input.name)) {
    names.add('Branded');
  }
  if (/\bLabrynth\b/i.test(input.name)) {
    names.add('Labrynth');
  }
  if (/\bRunick\b/i.test(input.name)) {
    names.add('Runick');
  }
  if (/\bTellarknight\b/i.test(input.name) || /\bConstellar\b/i.test(input.name)) {
    names.add('Tellarknight');
  }
  if (/\bEvil\s*Eye\b/i.test(input.name)) {
    names.add('Evil Eye');
  }
  if (/\bSnake[- ]Eye\b/i.test(input.name)) {
    names.add('Snake-Eye');
  }
  return [...names];
}

export function mentionsCardName(desc: string, cardName: string): boolean {
  return desc.toLowerCase().includes(cardName.toLowerCase());
}
