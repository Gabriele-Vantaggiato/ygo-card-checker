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

export type ComboPayoffParsed = SpecialSummonFromDeckPayoff | SelfSummonHandTributePayoff;

export interface ParsedCardEffects {
  requirements: ControlRequirement[];
  payoffs: ComboPayoffParsed[];
}

function extractQuotedNames(fragment: string): string[] {
  const names = new Set<string>();
  const pattern = /["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fragment)) !== null) {
    names.add(match[1]);
  }
  return [...names];
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

export function parseCardEffects(desc: string): ParsedCardEffects {
  const requirements: ControlRequirement[] = [];
  const payoffs: ComboPayoffParsed[] = [];

  const control = parseControlRequirement(desc);
  if (control) {
    requirements.push(control);
  }

  const summonDeck = parseSpecialSummonFromDeck(desc);
  if (summonDeck) {
    payoffs.push(summonDeck);
  }

  const selfTribute = parseSelfSummonHandTributeAtk(desc);
  if (selfTribute) {
    payoffs.push(selfTribute);
  }

  return { requirements, payoffs };
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
  } else if (/\bGalaxy\b/i.test(input.name)) {
    names.add('Galaxy');
  }
  return [...names];
}

export function mentionsCardName(desc: string, cardName: string): boolean {
  return desc.toLowerCase().includes(cardName.toLowerCase());
}
