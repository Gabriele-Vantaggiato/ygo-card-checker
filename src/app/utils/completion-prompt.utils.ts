import { CardKnowledgeEntry, CardRelatedSuggestion } from '../models/card-knowledge.model';

export type DeckCompletionDirection = 'archetype' | 'combo' | 'staples' | 'side_meta';

export interface CompletionScoringProfile {
  tagBoosts: Record<string, number>;
  relationBoosts: Record<string, number>;
  nameKeywords: string[];
  archetypeKeywords: string[];
  cardIdBoosts: Record<number, number>;
  matchupKeys: string[];
  directionMultiplier: number;
  preferGenericStaples: boolean;
  preferCombo: boolean;
  preferArchetype: boolean;
}

export interface CompletionRagResult {
  profile: CompletionScoringProfile;
  summary: string | null;
  sources: Array<'rules' | 'matchup' | 'ollama'>;
  ollamaUsed: boolean;
}

interface CounterRule {
  patterns: RegExp[];
  tags: string[];
  nameHints: string[];
  archetypes: string[];
}

const COUNTER_RULES: CounterRule[] = [
  {
    patterns: [/artifact/i, /artefatt/i],
    tags: ['destroys', 'banishes', 'negates', 'bounce_to_hand'],
    nameHints: ['typhoon', 'twister', 'cyclone', 'harpie', 'lightning storm', 'laundry'],
    archetypes: ['Artifact'],
  },
  {
    patterns: [/spell|magia|magie/i, /trap|trappol/i, /backrow|continu/i],
    tags: ['destroys', 'negates', 'bounce_to_hand'],
    nameHints: ['typhoon', 'twister', 'cyclone', 'harpie', 'twin', 'storm'],
    archetypes: [],
  },
  {
    patterns: [/combo/i, /combos/i],
    tags: ['negates', 'hand_trap', 'destroys', 'banishes'],
    nameHints: ['ash', 'impermanence', 'droll', 'nibiru', 'bystial'],
    archetypes: [],
  },
  {
    patterns: [/hand trap|trappol[ae] mano|trappole mano/i],
    tags: ['hand_trap', 'negates', 'quick_effect'],
    nameHints: ['ash', 'impermanence', 'droll', 'ghost ogre', 'nibiru'],
    archetypes: [],
  },
  {
    patterns: [/graveyard|cimitero|gy\b/i, /recursion|ricors/i],
    tags: ['banishes', 'negates', 'mills'],
    nameHints: ['macro cosmos', 'bystial', 'dd crow', 'ghost belle'],
    archetypes: [],
  },
  {
    patterns: [/draw|pesc/i],
    tags: ['draw', 'discards'],
    nameHints: ['allure', 'trade-in', 'pot of'],
    archetypes: [],
  },
  {
    patterns: [/cyber|machine|macchin/i],
    tags: ['destroys', 'negates', 'hand_trap'],
    nameHints: ['system down', 'chimeratech', 'kaiju'],
    archetypes: ['Cyber', 'Cyber Dragon'],
  },
  {
    patterns: [/dragon|drago/i],
    tags: ['negates', 'banishes', 'destroys'],
    nameHints: ['bystial', 'droll'],
    archetypes: ['Dragon'],
  },
  {
    patterns: [/fusion|synchro|xyz|link|pendulum/i],
    tags: ['negates', 'hand_trap', 'banishes'],
    nameHints: ['impermanence', 'veiler', 'gamma'],
    archetypes: [],
  },
];

const WEAK_AGAINST_PATTERN =
  /(?:debole\s+contro|weak\s+against|counter(?:are)?|migliorare\s+contro|anti[-\s]?|contro\s+(?:i\s+)?)([a-z0-9][\w\s-]{2,40})/gi;

const SIDE_SECTION_TAGS = new Set([
  'hand_trap',
  'negates',
  'destroys',
  'banishes',
  'bounce_to_hand',
]);

export function buildCompletionProfile(
  direction: DeckCompletionDirection,
  prompt: string,
): CompletionScoringProfile {
  const normalized = prompt.trim().toLowerCase();
  const profile: CompletionScoringProfile = {
    tagBoosts: {},
    relationBoosts: {},
    nameKeywords: [],
    archetypeKeywords: [],
    cardIdBoosts: {},
    matchupKeys: [],
    directionMultiplier: 1,
    preferGenericStaples: direction === 'staples' || direction === 'side_meta',
    preferCombo: direction === 'combo',
    preferArchetype: direction === 'archetype',
  };

  applyDirectionBase(profile, direction);

  if (!normalized) {
    return profile;
  }

  for (const rule of COUNTER_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      boostTags(profile, rule.tags, 1.4);
      profile.nameKeywords.push(...rule.nameHints);
      profile.archetypeKeywords.push(...rule.archetypes);
    }
  }

  for (const match of normalized.matchAll(WEAK_AGAINST_PATTERN)) {
    const fragment = match[1]?.trim();
    if (!fragment) {
      continue;
    }
    profile.nameKeywords.push(fragment);
    for (const rule of COUNTER_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(fragment))) {
        boostTags(profile, rule.tags, 1.6);
        profile.nameKeywords.push(...rule.nameHints);
        profile.archetypeKeywords.push(...rule.archetypes);
      }
    }
    for (const rule of COUNTER_RULES) {
      for (const archetype of rule.archetypes) {
        if (fragment.includes(archetype.toLowerCase())) {
          boostTags(profile, rule.tags, 1.6);
          profile.nameKeywords.push(...rule.nameHints);
        }
      }
    }
  }

  profile.nameKeywords = [...new Set(profile.nameKeywords.map((k) => k.toLowerCase()))];
  profile.archetypeKeywords = [...new Set(profile.archetypeKeywords.map((k) => k.toLowerCase()))];
  return profile;
}

export function scoreForCompletion(
  suggestion: CardRelatedSuggestion,
  entry: CardKnowledgeEntry | undefined,
  profile: CompletionScoringProfile,
  section: 'main' | 'extra' | 'side',
): number {
  let score = suggestion.score;

  if (profile.preferArchetype) {
    if (suggestion.relation === 'archetype' || suggestion.relation === 'series') {
      score *= 1.45;
    }
  }

  if (profile.preferCombo) {
    if (suggestion.relation === 'engine' || suggestion.relation === 'mentions_card') {
      score *= 1.35;
    }
    score += (suggestion.score >= 1.2 ? 0.35 : 0) * profile.directionMultiplier;
  }

  if (profile.preferGenericStaples && !suggestion.archetype) {
    score *= 1.25;
  }

  for (const [relation, boost] of Object.entries(profile.relationBoosts)) {
    if (suggestion.relation === relation) {
      score *= boost;
    }
  }

  const tags = entry?.tags ?? [];
  for (const tag of tags) {
    const boost = profile.tagBoosts[tag];
    if (boost) {
      score *= boost;
    }
  }

  const name = suggestion.name.toLowerCase();
  for (const keyword of profile.nameKeywords) {
    if (name.includes(keyword)) {
      score *= 1.55;
    }
  }

  const archetype = suggestion.archetype?.toLowerCase() ?? '';
  for (const keyword of profile.archetypeKeywords) {
    if (archetype.includes(keyword) || name.includes(keyword)) {
      score *= 1.2;
    }
  }

  if (section === 'side') {
    const sideTagHits = tags.filter((tag) => SIDE_SECTION_TAGS.has(tag)).length;
    score *= 1 + sideTagHits * 0.18;
    if (suggestion.relation === 'engine' && sideTagHits === 0) {
      score *= 0.72;
    }
    if (profile.preferGenericStaples && !suggestion.archetype) {
      score *= 1.35;
    }
  }

  const cardBoost = profile.cardIdBoosts[suggestion.cardId];
  if (cardBoost) {
    score *= cardBoost;
  }

  return score;
}

export function mergeCompletionProfiles(
  base: CompletionScoringProfile,
  extra: Partial<CompletionScoringProfile>,
): CompletionScoringProfile {
  const merged: CompletionScoringProfile = {
    ...base,
    tagBoosts: { ...base.tagBoosts },
    relationBoosts: { ...base.relationBoosts },
    nameKeywords: [...base.nameKeywords],
    archetypeKeywords: [...base.archetypeKeywords],
    cardIdBoosts: { ...base.cardIdBoosts },
    matchupKeys: [...base.matchupKeys],
  };

  if (extra.tagBoosts) {
    for (const [tag, factor] of Object.entries(extra.tagBoosts)) {
      merged.tagBoosts[tag] = Math.max(merged.tagBoosts[tag] ?? 1, factor);
    }
  }
  if (extra.relationBoosts) {
    Object.assign(merged.relationBoosts, extra.relationBoosts);
  }
  if (extra.nameKeywords) {
    merged.nameKeywords.push(...extra.nameKeywords);
  }
  if (extra.archetypeKeywords) {
    merged.archetypeKeywords.push(...extra.archetypeKeywords);
  }
  if (extra.cardIdBoosts) {
    Object.assign(merged.cardIdBoosts, extra.cardIdBoosts);
  }
  if (extra.matchupKeys) {
    merged.matchupKeys.push(...extra.matchupKeys);
  }
  if (extra.preferCombo !== undefined) {
    merged.preferCombo = extra.preferCombo;
  }
  if (extra.preferGenericStaples !== undefined) {
    merged.preferGenericStaples = extra.preferGenericStaples;
  }
  if (extra.preferArchetype !== undefined) {
    merged.preferArchetype = extra.preferArchetype;
  }

  merged.nameKeywords = [...new Set(merged.nameKeywords.map((k) => k.toLowerCase()))];
  merged.archetypeKeywords = [...new Set(merged.archetypeKeywords.map((k) => k.toLowerCase()))];
  merged.matchupKeys = [...new Set(merged.matchupKeys)];
  return merged;
}

export function profileSummary(profile: CompletionScoringProfile): string | null {
  const parts = [
    ...profile.matchupKeys,
    ...Object.keys(profile.tagBoosts).slice(0, 4),
    ...profile.nameKeywords.slice(0, 3),
  ];
  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length > 0 ? unique.join(', ') : null;
}

export function completionPromptSummary(
  direction: DeckCompletionDirection,
  prompt: string,
): string | null {
  return profileSummary(buildCompletionProfile(direction, prompt));
}

function applyDirectionBase(profile: CompletionScoringProfile, direction: DeckCompletionDirection): void {
  switch (direction) {
    case 'archetype':
      profile.directionMultiplier = 1.2;
      profile.relationBoosts = { archetype: 1.5, series: 1.4, gy_synergy: 1.15 };
      break;
    case 'combo':
      profile.directionMultiplier = 1.35;
      profile.relationBoosts = { engine: 1.4, mentions_card: 1.35, search_target: 1.3 };
      boostTags(profile, ['special_summons', 'searches_deck', 'ss_from_hand', 'ss_from_deck'], 1.2);
      break;
    case 'staples':
      profile.directionMultiplier = 1.15;
      boostTags(profile, ['hand_trap', 'draw', 'negates', 'destroys', 'banishes'], 1.45);
      break;
    case 'side_meta':
      profile.directionMultiplier = 1.25;
      boostTags(profile, ['hand_trap', 'negates', 'destroys', 'banishes', 'bounce_to_hand'], 1.55);
      break;
  }
}

function boostTags(profile: CompletionScoringProfile, tags: string[], factor: number): void {
  for (const tag of tags) {
    profile.tagBoosts[tag] = Math.max(profile.tagBoosts[tag] ?? 1, factor);
  }
}
