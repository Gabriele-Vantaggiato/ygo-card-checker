import type { MechanicTag } from './mechanic-tags';

export interface MatchupDefinition {
  key: string;
  labels: string[];
  tags: MechanicTag[];
  namePatterns: RegExp[];
  archetypeHints: string[];
  preferredSections: Array<'main' | 'extra' | 'side'>;
  cap: number;
}

export const MATCHUP_DEFINITIONS: MatchupDefinition[] = [
  {
    key: 'artifact',
    labels: ['artifact', 'artefatto', 'artefatti', 'artifacts'],
    tags: ['destroys', 'banishes', 'negates', 'bounce_to_hand'],
    namePatterns: [
      /twin twisters/i,
      /mystical space typhoon/i,
      /cosmic cyclone/i,
      /harpie/i,
      /lightning storm/i,
      /dark hole/i,
    ],
    archetypeHints: ['Artifact'],
    preferredSections: ['side', 'main'],
    cap: 28,
  },
  {
    key: 'combo',
    labels: ['combo', 'combos', 'combos deck', 'extend', 'extender'],
    tags: ['negates', 'hand_trap', 'destroys', 'banishes'],
    namePatterns: [/ash blossom/i, /infinite impermanence/i, /droll/i, /nibiru/i, /bystial/i, /ghost ogre/i],
    archetypeHints: [],
    preferredSections: ['side', 'main'],
    cap: 32,
  },
  {
    key: 'graveyard',
    labels: ['graveyard', 'cimitero', 'gy', 'recursion', 'ricorsione', 'banish gy'],
    tags: ['banishes', 'negates', 'mills'],
    namePatterns: [/macro cosmos/i, /bystial/i, /dd crow/i, /ghost belle/i, /called by the grave/i],
    archetypeHints: [],
    preferredSections: ['side', 'main'],
    cap: 28,
  },
  {
    key: 'backrow',
    labels: ['backrow', 'continu', 'spell trap', 'magie trappole', 'trap hole', 'st continuous'],
    tags: ['destroys', 'negates', 'bounce_to_hand'],
    namePatterns: [/twin twisters/i, /harpie/i, /typhoon/i, /cyclone/i, /storm/i, /mystical space/i],
    archetypeHints: [],
    preferredSections: ['side', 'main'],
    cap: 28,
  },
  {
    key: 'hand_trap',
    labels: ['hand trap', 'trappola mano', 'trappole mano', 'ash', 'impermanence'],
    tags: ['hand_trap', 'negates', 'quick_effect'],
    namePatterns: [/ash blossom/i, /infinite impermanence/i, /ghost ogre/i, /droll/i, /nibiru/i],
    archetypeHints: [],
    preferredSections: ['side', 'main'],
    cap: 24,
  },
  {
    key: 'kashtira',
    labels: ['kashtira', 'kashira'],
    tags: ['negates', 'banishes', 'destroys'],
    namePatterns: [/kashtira/i, /unicorn/i, /fenrir/i, /perulia/i],
    archetypeHints: ['Kashtira'],
    preferredSections: ['side', 'main'],
    cap: 24,
  },
  {
    key: 'branded',
    labels: ['branded', 'despia', 'despian', 'fusion'],
    tags: ['banishes', 'negates', 'destroys'],
    namePatterns: [/bystial/i, /dimension shifter/i, /droll/i, /macro cosmos/i],
    archetypeHints: ['Branded', 'Despia'],
    preferredSections: ['side'],
    cap: 24,
  },
  {
    key: 'cyber',
    labels: ['cyber', 'cyber dragon', 'machine', 'macchina'],
    tags: ['negates', 'destroys', 'hand_trap'],
    namePatterns: [/system down/i, /chimeratech/i, /kaiju/i, /lava golem/i],
    archetypeHints: ['Cyber', 'Cyber Dragon'],
    preferredSections: ['side'],
    cap: 24,
  },
  {
    key: 'mill',
    labels: ['mill', 'deck out', 'milla', 'milling'],
    tags: ['mills', 'draw'],
    namePatterns: [/excavator/i, /card of safe return/i, /royal decree/i],
    archetypeHints: [],
    preferredSections: ['main', 'side'],
    cap: 20,
  },
  {
    key: 'draw',
    labels: ['draw', 'pesca', 'card advantage', 'vantaggio'],
    tags: ['draw', 'discards'],
    namePatterns: [/allure of darkness/i, /trade-in/i, /pot of prosperity/i, /pot of desires/i],
    archetypeHints: [],
    preferredSections: ['main'],
    cap: 24,
  },
];

export function detectMatchupKeys(text: string): string[] {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const hits = new Set<string>();
  for (const def of MATCHUP_DEFINITIONS) {
    if (def.labels.some((label) => normalized.includes(label))) {
      hits.add(def.key);
    }
  }

  const weakPattern =
    /(?:debole\s+contro|weak\s+against|counter(?:are)?|migliorare\s+contro|anti[-\s]?|contro\s+(?:i\s+|gli |le )?)([a-z0-9][\w\s-]{2,40})/gi;
  for (const match of normalized.matchAll(weakPattern)) {
    const fragment = match[1]?.trim() ?? '';
    for (const def of MATCHUP_DEFINITIONS) {
      if (def.labels.some((label) => fragment.includes(label) || label.includes(fragment))) {
        hits.add(def.key);
      }
    }
  }

  return [...hits];
}
