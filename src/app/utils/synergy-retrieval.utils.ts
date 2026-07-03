import {
  CardKnowledgeEntry,
  CardKnowledgeIndex,
  CardKnowledgeRelated,
  CardKnowledgeRosterMember,
} from '../models/card-knowledge.model';
import { CompletionScoringProfile, scoreForCompletion } from './completion-prompt.utils';

const FORMAT_TAG_PREFIXES = ['format:', 'copies:', 'mention:'] as const;

/** Pairs used for full-dataset scan (includes series + summon ecosystem). */
export const DATASET_SYNERGY_PAIRS: ReadonlyArray<{
  trigger: string;
  response: string;
  relation: string;
}> = [
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
  { trigger: 'searches_deck', response: 'ss_from_hand', relation: 'engine' },
  { trigger: 'searches_deck', response: 'ss_from_deck', relation: 'engine' },
  { trigger: 'special_summons', response: 'searches_deck', relation: 'engine' },
  { trigger: 'special_summons', response: 'searches_monster', relation: 'engine' },
  { trigger: 'ss_from_hand', response: 'searches_monster', relation: 'engine' },
  { trigger: 'ss_from_hand', response: 'searches_deck', relation: 'engine' },
  { trigger: 'ss_from_hand', response: 'discards', relation: 'engine' },
  { trigger: 'ss_from_deck', response: 'special_summons', relation: 'engine' },
  { trigger: 'banishes', response: 'gy_interaction', relation: 'gy_synergy' },
  { trigger: 'discards', response: 'gy_interaction', relation: 'gy_synergy' },
  { trigger: 'mentions_photon', response: 'mentions_photon', relation: 'series' },
  { trigger: 'mentions_galaxy', response: 'mentions_galaxy', relation: 'series' },
];

import { SIDE_STAPLE_TAG_SET } from './knowledge-constants';

/** Tags too common to imply synergy without same-series context. */
const UBIQUITOUS_TAGS = new Set([
  'special_summons',
  'trigger_effect',
  'quick_effect',
  'once_per_turn',
  'hard_opt',
]);

const BROAD_PAIR_TRIGGERS = new Set(['special_summons', 'ss_from_hand', 'ss_from_deck', 'ss_from_gy']);

export interface DatasetSynergyOptions {
  limit?: number;
  minScore?: number;
  includeReversePairs?: boolean;
  tagIndex?: Map<string, number[]>;
  tagDf?: Map<string, number>;
}

export function mechanicTagsFrom(cardTags: readonly string[]): Set<string> {
  return new Set(cardTags.filter((tag) => !FORMAT_TAG_PREFIXES.some((p) => tag.startsWith(p))));
}

export function buildCardRosterMap(index: CardKnowledgeIndex): Map<number, CardKnowledgeRosterMember> {
  const map = new Map<number, CardKnowledgeRosterMember>();

  const add = (member: CardKnowledgeRosterMember) => {
    if (!map.has(member.id)) {
      map.set(member.id, member);
    }
  };

  for (const members of Object.values(index.archetypes ?? {})) {
    for (const member of members) {
      add(member);
    }
  }
  for (const members of Object.values(index.seriesIndex ?? {})) {
    for (const member of members) {
      add(member);
    }
  }
  for (const members of Object.values(index.mechanicIndex ?? {})) {
    for (const member of members) {
      add(member);
    }
  }
  for (const members of Object.values(index.matchupIndex ?? {})) {
    for (const member of members) {
      add(member);
    }
  }
  for (const entry of Object.values(index.entries)) {
    for (const related of entry.related ?? []) {
      add({
        id: related.id,
        name: related.name,
        type: 'Card',
        archetype: related.archetype,
        tcgDate: related.tcgDate,
        banTcg: related.banTcg,
        imageSmall: related.imageSmall,
      });
    }
  }

  return map;
}

function rosterOrFallback(
  id: number,
  entry: CardKnowledgeEntry,
  roster: Map<number, CardKnowledgeRosterMember>,
): CardKnowledgeRosterMember {
  const known = roster.get(id);
  if (known) {
    return known;
  }
  return {
    id,
    name: entry.series[0] ? `${entry.series[0]} #${id}` : `Card #${id}`,
    type: 'Card',
    archetype: entry.series[0] ?? null,
    tcgDate: null,
    banTcg: null,
    imageSmall: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
  };
}

export function buildTagDocumentFrequency(index: CardKnowledgeIndex): Map<string, number> {
  const df = new Map<string, number>();
  for (const entry of Object.values(index.entries)) {
    for (const tag of mechanicTagsFrom(entry.tags)) {
      df.set(tag, (df.get(tag) ?? 0) + 1);
    }
  }
  return df;
}

function tagIdf(tag: string, df: Map<string, number>, total: number): number {
  const freq = df.get(tag) ?? 1;
  return Math.log((total + 1) / (freq + 1));
}

function sharesSeries(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const left = new Set(a.map((s) => s.toLowerCase()));
  return b.some((s) => left.has(s.toLowerCase()));
}
function sharedSeriesScore(sourceSeries: readonly string[], candidateSeries: readonly string[]): number {
  if (sourceSeries.length === 0 || candidateSeries.length === 0) {
    return 0;
  }
  const source = new Set(sourceSeries.map((s) => s.toLowerCase()));
  for (const token of candidateSeries) {
    if (source.has(token.toLowerCase())) {
      return 0.38;
    }
  }
  return 0;
}

function pairScore(
  trigger: string,
  response: string,
  relation: string,
  reverse: boolean,
  df: Map<string, number>,
  total: number,
  sameSeries: boolean,
): number {
  if (
    BROAD_PAIR_TRIGGERS.has(trigger) &&
    !sameSeries &&
    relation !== 'series' &&
    (UBIQUITOUS_TAGS.has(trigger) || UBIQUITOUS_TAGS.has(response))
  ) {
    return 0;
  }

  const idf = (tagIdf(trigger, df, total) + tagIdf(response, df, total)) / 2;
  const base = relation === 'series' ? 0.72 : relation === 'gy_synergy' ? 0.78 : 0.62;
  const weighted = base * (0.55 + Math.min(idf / 4, 0.85));
  return reverse ? weighted * 0.88 : weighted;
}

function computeRawSynergyScore(
  sourceTags: Set<string>,
  sourceSeries: readonly string[],
  candidateTags: Set<string>,
  candidateSeries: readonly string[],
  pairs: ReadonlyArray<{ trigger: string; response: string; relation: string }>,
  includeReverse: boolean,
  df: Map<string, number>,
  total: number,
): { score: number; relation: string; trigger?: string } {
  let best = { score: 0, relation: 'engine', trigger: undefined as string | undefined };
  const sameSeries = sharesSeries(sourceSeries, candidateSeries);

  for (const pair of pairs) {
    if (sourceTags.has(pair.trigger) && candidateTags.has(pair.response)) {
      const score = pairScore(pair.trigger, pair.response, pair.relation, false, df, total, sameSeries);
      if (score > best.score) {
        best = { score, relation: pair.relation, trigger: pair.trigger };
      }
    }
    if (includeReverse && candidateTags.has(pair.trigger) && sourceTags.has(pair.response)) {
      const score = pairScore(pair.trigger, pair.response, pair.relation, true, df, total, sameSeries);
      if (score > best.score) {
        best = { score, relation: pair.relation, trigger: pair.response };
      }
    }
  }

  const seriesBoost = sharedSeriesScore(sourceSeries, candidateSeries);
  if (seriesBoost > best.score) {
    best = { score: seriesBoost, relation: 'series', trigger: undefined };
  }

  const specificShared = [...sourceTags].filter(
    (t) => candidateTags.has(t) && !UBIQUITOUS_TAGS.has(t) && !t.startsWith('mention'),
  );
  if (specificShared.length >= 2) {
    const affinity =
      0.2 +
      Math.min(
        specificShared.reduce((sum, tag) => sum + tagIdf(tag, df, total), 0) / specificShared.length / 6,
        0.35,
      );
    if (affinity > best.score) {
      best = { score: affinity, relation: 'engine', trigger: specificShared[0] };
    }
  }

  return best;
}

export function buildTagToCardIdsIndex(index: CardKnowledgeIndex): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const [idStr, entry] of Object.entries(index.entries)) {
    const id = Number(idStr);
    for (const tag of mechanicTagsFrom(entry.tags)) {
      const bucket = map.get(tag);
      if (bucket) {
        bucket.push(id);
      } else {
        map.set(tag, [id]);
      }
    }
  }
  return map;
}

function collectCandidateIds(
  sourceTags: Set<string>,
  sourceSeries: readonly string[],
  pairs: ReadonlyArray<{ trigger: string; response: string; relation: string }>,
  tagIndex: Map<string, number[]>,
  index: CardKnowledgeIndex,
  includeReverse: boolean,
): Set<number> {
  const ids = new Set<number>();

  for (const pair of pairs) {
    if (sourceTags.has(pair.trigger)) {
      for (const id of tagIndex.get(pair.response) ?? []) {
        ids.add(id);
      }
    }
    if (includeReverse && sourceTags.has(pair.response)) {
      for (const id of tagIndex.get(pair.trigger) ?? []) {
        ids.add(id);
      }
    }
  }

  for (const token of sourceSeries) {
    for (const member of index.seriesIndex?.[token] ?? []) {
      ids.add(member.id);
    }
    for (const member of index.archetypes?.[token] ?? []) {
      ids.add(member.id);
    }
  }

  return ids;
}

function applyDirectionBias(
  score: number,
  relation: string,
  candidate: CardKnowledgeRosterMember,
  candidateTags: Set<string>,
  profile: CompletionScoringProfile,
): number {
  if (profile.preferArchetype && (relation === 'series' || relation === 'archetype')) {
    score *= 1.55;
  }
  if (profile.preferCombo && relation === 'engine') {
    score *= 1.4;
  }
  if (profile.preferGenericStaples && !candidate.archetype) {
    score *= 1.35;
  }
  if (profile.preferGenericStaples || profile.matchupKeys.length > 0) {
    const sideHits = [...candidateTags].filter((t) => SIDE_STAPLE_TAG_SET.has(t)).length;
    if (sideHits > 0) {
      score *= 1 + sideHits * 0.12;
    }
  }
  return score;
}

/**
 * Scans the full knowledge dataset for mechanic complementarity (not limited to precomputed related[]).
 */
export function retrieveDatasetSynergies(
  sourceId: number,
  sourceEntry: CardKnowledgeEntry,
  index: CardKnowledgeIndex,
  profile: CompletionScoringProfile,
  excludeIds: ReadonlySet<number>,
  roster: Map<number, CardKnowledgeRosterMember>,
  options: DatasetSynergyOptions = {},
): CardKnowledgeRelated[] {
  const limit = options.limit ?? 64;
  const minScore = options.minScore ?? 0.48;
  const includeReverse = options.includeReversePairs ?? true;
  const total = Object.keys(index.entries).length;
  const tagDf = options.tagDf ?? buildTagDocumentFrequency(index);
  const tagIndex = options.tagIndex ?? buildTagToCardIdsIndex(index);

  const sourceTags = mechanicTagsFrom(sourceEntry.tags);
  if (sourceTags.size === 0 && sourceEntry.series.length === 0) {
    return [];
  }

  const pairs = mergePairs(index);
  const candidateIds = collectCandidateIds(
    sourceTags,
    sourceEntry.series,
    pairs,
    tagIndex,
    index,
    includeReverse,
  );
  const scored: CardKnowledgeRelated[] = [];

  for (const id of candidateIds) {
    if (id === sourceId || excludeIds.has(id)) {
      continue;
    }

    const entry = index.entries[String(id)];
    if (!entry) {
      continue;
    }

    const candidateTags = mechanicTagsFrom(entry.tags);
    const raw = computeRawSynergyScore(
      sourceTags,
      sourceEntry.series,
      candidateTags,
      entry.series,
      pairs,
      includeReverse,
      tagDf,
      total,
    );

    if (raw.score < minScore) {
      continue;
    }

    const member = rosterOrFallback(id, entry, roster);
    let score = applyDirectionBias(raw.score, raw.relation, member, candidateTags, profile);

    score = scoreForCompletion(
      {
        cardId: id,
        name: member.name,
        relation: raw.relation,
        score,
        archetype: member.archetype,
        imageSmall: member.imageSmall,
        reasonKey: 'knowledge.reason.mechanicSynergy',
      },
      entry,
      profile,
      'main',
    );

    scored.push({
      id,
      name: member.name,
      relation: raw.relation === 'series' ? 'series' : 'mechanic_synergy',
      score,
      archetype: member.archetype,
      tcgDate: member.tcgDate,
      banTcg: member.banTcg,
      imageSmall: member.imageSmall,
      mechanicTrigger: raw.trigger,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function mergePairs(index: CardKnowledgeIndex): Array<{ trigger: string; response: string; relation: string }> {
  const merged = new Map<string, { trigger: string; response: string; relation: string }>();
  for (const pair of [...(index.mechanicSynergies ?? []), ...DATASET_SYNERGY_PAIRS]) {
    merged.set(`${pair.trigger}→${pair.response}`, pair);
  }
  return [...merged.values()];
}
