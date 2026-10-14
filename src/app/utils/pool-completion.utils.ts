import type { RouletteDeck } from '../services/deck-roulette.service';
import { CardMeta } from './card-meta.utils';
import { CompetitiveContext } from './competitive-score.utils';
import { OptimizeOptions, optimizeMainFill } from './competitive-optimizer.utils';
import { buildMonsterPool, isExtraReachable } from './extra-reachability.utils';
import { FormatStaples } from './format-staples.utils';
import { selectStructuredSection } from './structured-sections.utils';

export type PoolSection = 'main' | 'extra' | 'side';

export interface PoolMatch {
  deck: RouletteDeck;
  /** Copies shared with the user's deck (main + extra). */
  overlap: number;
  /** Share of the user's cards (main + extra) found in the pool deck, 0..1. */
  coverage: number;
  /** Ranking score: coverage weighted with how much of the pool deck the user already has. */
  score: number;
}

export interface PoolAdd {
  cardId: number;
  quantity: number;
  section: PoolSection;
  /** Name of the best-ranked pool deck this card comes from. */
  fromDeck: string;
  /** How many of the matched decks play this card. */
  supportCount: number;
  /** Share (0..1) of the format's decks that play this card in this section, when it is a recurring staple. */
  stapleShare?: number;
}

export interface PoolGaps {
  main: number;
  extra: number;
  side: number;
}

export interface RankOptions {
  minCoverage?: number;
  minOverlap?: number;
  limit?: number;
}

const DEFAULT_MIN_COVERAGE = 0.35;
const DEFAULT_MIN_OVERLAP = 3;
const DEFAULT_LIMIT = 8;

function countCopies(ids: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * Real pool decks closest to the user's partial deck. Only main + extra count for similarity
 * (side decks are noisy); pool decks were already validated against the format when the pool was built.
 */
export function rankPoolDecks(
  userMainExtra: ReadonlyMap<number, number>,
  pool: readonly RouletteDeck[],
  options: RankOptions = {},
): PoolMatch[] {
  const minCoverage = options.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const minOverlap = options.minOverlap ?? DEFAULT_MIN_OVERLAP;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const userTotal = [...userMainExtra.values()].reduce((sum, qty) => sum + qty, 0);
  if (userTotal === 0) return [];

  const matches: PoolMatch[] = [];
  for (const deck of pool) {
    const copies = countCopies([...deck.main, ...deck.extra]);
    let overlap = 0;
    for (const [id, qty] of userMainExtra) overlap += Math.min(qty, copies.get(id) ?? 0);
    const coverage = overlap / userTotal;
    if (overlap < minOverlap || coverage < minCoverage) continue;
    const poolTotal = deck.main.length + deck.extra.length;
    const score = coverage * 0.75 + (overlap / Math.max(poolTotal, 1)) * 0.25;
    matches.push({ deck, overlap, coverage, score });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface PlanOptions {
  /** Exponent applied to the match score when weighting decks: higher = trust the closest deck more. */
  gamma?: number;
  /** Card metadata (kind, level, tuner). Enables the Extra Deck reachability preference. */
  meta?: ReadonlyMap<number, CardMeta>;
  /**
   * Competitive data (card flags, links, format usage). When set, the main deck fill is optimised for
   * brick rate, synergy, consistency and usage on top of the consensus of similar real decks.
   */
  competitive?: CompetitiveContext;
  optimizer?: OptimizeOptions;
  /**
   * Recurring cards of the format (see buildFormatStaples). When set, Extra and Side Deck are filled in two
   * parts: staples with the format's typical copies, and cards specific to the archetype from similar decks.
   */
  staples?: FormatStaples;
  /** Probability multiplier for Extra Deck cards the planned main deck cannot summon. */
  unreachablePenalty?: number;
}

const DEFAULT_UNREACHABLE_PENALTY = 0.35;

const DEFAULT_GAMMA = 8;

/** One candidate copy of a card with the consensus probability that the closest real decks play it. */
export interface ConsensusSlot {
  cardId: number;
  section: PoolSection;
  /** 1-based copy number counted from zero copies (copies the user already has are excluded). */
  copy: number;
  probability: number;
  /** How many of the matched decks play this card in this section. */
  support: number;
  /** Rank (0 = closest) of the first matched deck that plays it. */
  rank: number;
  fromDeck: string;
  stapleShare?: number;
}

/**
 * Every (card, k-th copy) of the matched decks with the weighted share of decks that play at least k copies.
 * Shared by the one-shot planner and the wave-by-wave completion.
 */
export function consensusSlots(
  userBySection: ReadonlyMap<string, number>,
  matches: readonly PoolMatch[],
  gamma: number = DEFAULT_GAMMA,
): { slots: ConsensusSlot[]; weights: number[]; totalWeight: number } {
  const weights = matches.map((m) => Math.pow(Math.max(m.score, 1e-6), gamma));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const slots: ConsensusSlot[] = [];
  if (totalWeight === 0) return { slots, weights, totalWeight };

  const perCard = new Map<string, { qtys: number[]; firstRank: number }>();
  matches.forEach((match, rank) => {
    const sections: Array<[PoolSection, readonly number[]]> = [
      ['main', match.deck.main],
      ['extra', match.deck.extra],
      ['side', match.deck.side],
    ];
    for (const [section, ids] of sections) {
      for (const [cardId, qty] of countCopies(ids)) {
        const key = `${section}:${cardId}`;
        const entry = perCard.get(key) ?? { qtys: new Array<number>(matches.length).fill(0), firstRank: rank };
        entry.qtys[rank] = qty;
        perCard.set(key, entry);
      }
    }
  });

  for (const [key, entry] of perCard) {
    const [section, id] = key.split(':');
    const cardId = Number(id);
    const maxQty = Math.max(...entry.qtys);
    const have = userBySection.get(key) ?? 0;
    const support = entry.qtys.filter((q) => q > 0).length;
    for (let copy = have + 1; copy <= maxQty; copy++) {
      let weight = 0;
      entry.qtys.forEach((q, i) => {
        if (q >= copy) weight += weights[i];
      });
      slots.push({
        cardId,
        section: section as PoolSection,
        copy,
        probability: weight / totalWeight,
        support,
        rank: entry.firstRank,
        fromDeck: matches[entry.firstRank].deck.name,
      });
    }
  }
  return { slots, weights, totalWeight };
}

/**
 * Consensus plan: every (card, k-th copy) gets the weighted share of matched decks that play at least
 * k copies of it in that section. Gaps are filled with the most probable copies first, so a card all
 * similar decks play at 3 beats a card one deck plays once. Copies never exceed what a legal pool
 * deck plays, so banlist limits hold by construction. With `meta`, Extra Deck cards the planned main
 * deck cannot summon (level/rank/tuner check) are demoted. A role-balancing step (starters, hand traps,
 * removal from knowledge tags) was tried and measured worse than plain consensus, so it is not used.
 *
 * @param userBySection quantity per `section:cardId` key currently in the user's deck
 */
export function planPoolAdds(
  userBySection: ReadonlyMap<string, number>,
  matches: readonly PoolMatch[],
  gaps: PoolGaps,
  options: PlanOptions = {},
): PoolAdd[] {
  const gamma = options.gamma ?? DEFAULT_GAMMA;
  const { slots, weights, totalWeight } = consensusSlots(userBySection, matches, gamma);
  if (totalWeight === 0) return [];
  type Slot = ConsensusSlot;

  const caps = copyCaps(matches);
  const planned = new Map<string, PoolAdd>();
  const sectionsOfDeck: readonly PoolSection[] = ['main', 'extra', 'side'];
  /** Copies of the card in the other sections: what the user already has plus what is planned so far. */
  const elsewhere = (cardId: number, section: PoolSection): number =>
    sectionsOfDeck
      .filter((other) => other !== section)
      .reduce((sum, other) => sum + (userBySection.get(`${other}:${cardId}`) ?? 0) + (planned.get(`${other}:${cardId}`)?.quantity ?? 0), 0);
  /** Most copies this section may hold for the card: its total cap minus the copies sitting in other sections. */
  const sectionCap = (cardId: number, section: PoolSection): number =>
    Math.max(0, (caps.get(cardId) ?? DEFAULT_COPY_CAP) - elsewhere(cardId, section));
  const bySection = (section: PoolSection) =>
    slots
      .filter((slot) => slot.section === section && slot.copy <= sectionCap(slot.cardId, section))
      .sort((a, b) => b.probability - a.probability || a.rank - b.rank || a.copy - b.copy);
  const take = (slot: Slot): void => {
    const key = `${slot.section}:${slot.cardId}`;
    const existing = planned.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      planned.set(key, {
        cardId: slot.cardId,
        quantity: 1,
        section: slot.section,
        fromDeck: slot.fromDeck,
        supportCount: slot.support,
        ...(slot.stapleShare !== undefined ? { stapleShare: slot.stapleShare } : {}),
      });
    }
  };

  const meta = options.meta;
  const mainSlots = bySection('main');
  if (options.competitive && gaps.main > 0 && mainSlots.length > 0) {
    const userMain: number[] = [];
    for (const [key, qty] of userBySection) {
      const [section, id] = key.split(':');
      if (section === 'main') for (let i = 0; i < qty; i++) userMain.push(Number(id));
    }
    const chosen = optimizeMainFill(
      userMain,
      mainSlots.map((slot) => ({ cardId: slot.cardId, copy: slot.copy, probability: slot.probability })),
      gaps.main,
      options.competitive,
      options.optimizer,
    );
    for (const pick of chosen) {
      const slot = mainSlots.find((candidate) => candidate.cardId === pick.cardId && candidate.copy === pick.copy);
      if (slot) take(slot);
    }
  } else {
    mainSlots.slice(0, Math.max(gaps.main, 0)).forEach(take);
  }

  const mainCopiesAfterMain = new Map<number, number>();
  for (const [key, qty] of userBySection) {
    const [section, id] = key.split(':');
    if (section === 'main') mainCopiesAfterMain.set(Number(id), (mainCopiesAfterMain.get(Number(id)) ?? 0) + qty);
  }
  for (const add of planned.values()) {
    if (add.section === 'main') mainCopiesAfterMain.set(add.cardId, (mainCopiesAfterMain.get(add.cardId) ?? 0) + add.quantity);
  }
  const monsters = meta ? buildMonsterPool(mainCopiesAfterMain, meta) : null;
  const penalty = options.unreachablePenalty ?? DEFAULT_UNREACHABLE_PENALTY;
  const reachability = (slot: { cardId: number }): number =>
    meta && monsters && !isExtraReachable(meta.get(slot.cardId), monsters) ? penalty : 1;

  const structure = (section: 'extra' | 'side', gap: number): void => {
    const staples = options.staples?.[section];
    if (!staples) return;
    const picks = selectStructuredSection({
      section,
      slots: bySection(section),
      gap,
      matchedSections: matches.map((m) => (section === 'extra' ? m.deck.extra : m.deck.side)),
      weights,
      staples,
      have: (cardId) => userBySection.get(`${section}:${cardId}`) ?? 0,
      adjust: section === 'extra' ? reachability : undefined,
      maxCopies: (cardId) => sectionCap(cardId, section),
      makeSlot: (cardId, copy, probability): Slot => ({
        cardId,
        section,
        copy,
        probability,
        support: 0,
        rank: matches.length,
        fromDeck: '',
      }),
    });
    for (const pick of picks) take(pick.staple ? { ...pick.slot, stapleShare: pick.staple.share } : pick.slot);
  };

  if (options.staples) {
    structure('extra', Math.max(gaps.extra, 0));
    structure('side', Math.max(gaps.side, 0));
  } else {
    let extraSlots = bySection('extra');
    if (meta) {
      extraSlots = [...extraSlots].sort((a, b) => b.probability * reachability(b) - a.probability * reachability(a) || a.rank - b.rank || a.copy - b.copy);
    }
    extraSlots.slice(0, Math.max(gaps.extra, 0)).forEach(take);
    bySection('side').slice(0, Math.max(gaps.side, 0)).forEach(take);
  }

  return [...planned.values()];
}

/** Default limit of copies of one card across the whole deck. */
export const DEFAULT_COPY_CAP = 3;

/**
 * Most copies of each card (Main + Extra + Side together) that any matched real deck plays. The decks are legal
 * for the format, so this also respects banlist limits (a Limited card tops out at one).
 */
export function copyCaps(matches: readonly PoolMatch[]): Map<number, number> {
  const caps = new Map<number, number>();
  for (const match of matches) {
    const total = countCopies([...match.deck.main, ...match.deck.extra, ...match.deck.side]);
    for (const [id, qty] of total) caps.set(id, Math.max(caps.get(id) ?? 0, qty));
  }
  return caps;
}

export interface PoolCompletion {
  matches: PoolMatch[];
  adds: PoolAdd[];
}

/** Sums the user's per-section quantities (`section:cardId` keys) into main+extra copies per card. */
function mainExtraCopies(userBySection: ReadonlyMap<string, number>): Map<number, number> {
  const copies = new Map<number, number>();
  for (const [key, qty] of userBySection) {
    const [section, id] = key.split(':');
    if (section === 'side') continue;
    copies.set(Number(id), (copies.get(Number(id)) ?? 0) + qty);
  }
  return copies;
}

/** Full pipeline: similar pool decks, then the missing cards. Null when no pool deck is similar enough. */
export function completeFromPool(
  userBySection: ReadonlyMap<string, number>,
  pool: readonly RouletteDeck[],
  gaps: PoolGaps,
  options: RankOptions & PlanOptions = {},
): PoolCompletion | null {
  const matches = rankPoolDecks(mainExtraCopies(userBySection), pool, options);
  if (matches.length === 0) return null;
  const adds = planPoolAdds(userBySection, matches, gaps, options);
  return adds.length > 0 ? { matches, adds } : null;
}
