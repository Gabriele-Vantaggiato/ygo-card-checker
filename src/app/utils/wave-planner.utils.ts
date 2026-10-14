import type { RouletteDeck } from '../services/deck-roulette.service';
import { CardMeta, FLAG, hasFlag } from './card-meta.utils';
import { CompetitiveContext, SynergyLinks, scoreDeck } from './competitive-score.utils';
import { OptimizeOptions, optimizeMainFill } from './competitive-optimizer.utils';
import { buildMonsterPool, isExtraReachable } from './extra-reachability.utils';
import { FormatCardStats, FormatStaples, typicalCopies } from './format-staples.utils';
import { ConsensusSlot, DEFAULT_COPY_CAP, PoolMatch, consensusSlots, copyCaps, rankPoolDecks } from './pool-completion.utils';
import { selectStructuredSection } from './structured-sections.utils';

/**
 * Wave-by-wave completion. Each call looks at the deck AS IT IS NOW and proposes one small group of
 * cards (a wave) with the reasons for each; after the user accepts it the deck changes, similar decks
 * and needs are recomputed, and the next wave is decided on the updated deck.
 */

export type WaveKind = 'pack' | 'core' | 'need' | 'partners' | 'engine' | 'support' | 'extra' | 'side';
export type WaveSection = 'main' | 'extra' | 'side';
export type LinkRelation = 'gy' | 'engine' | 'search' | 'mention' | 'shared';

/** Why a card is proposed. Rendered by the UI; kept as data so the model's reasoning can also be stored. */
export type WhyTag =
  | { kind: 'playset'; have: number; typical: number }
  | { kind: 'linked'; to: number[]; relation: LinkRelation }
  | { kind: 'ritual-need' }
  | { kind: 'staple'; share: number }
  | { kind: 'usage'; share: number }
  | { kind: 'reachable' }
  | { kind: 'preference'; net: number }
  /** Compared with the other options, this one lowers the chance of a hand without the engine / raises synergy. */
  | { kind: 'better-score'; delta: number };

export interface WaveCard {
  cardId: number;
  section: WaveSection;
  quantity: number;
  /** Consensus probability (0..1) that the closest decks play these copies. */
  probability: number;
  /** How many of the compared decks play the card in this section, and how many were compared. */
  playedBy: number;
  of: number;
  why: WhyTag[];
}

export interface WaveChoice {
  id: string;
  prompt: 'ritual-spell' | 'close-call';
  /** Between 2 and MAX_CHOICE_OPTIONS alternatives; the user picks exactly one. */
  options: WaveCard[];
  recommended: number;
}

export interface Wave {
  id: string;
  kind: WaveKind;
  /** Cards proposed without asking. */
  cards: WaveCard[];
  /** An open decision between a few alternatives, when the data does not settle it. */
  choice: WaveChoice | null;
  basis: { decks: number; best: { name: string; coverage: number; archetype: string | null; url: string | null } | null };
}

export type WaveResult = { done: false; wave: Wave } | { done: true; reason: 'complete' | 'no-match' | 'no-candidates' };

export interface WaveTargets {
  main: number;
  extra: number;
  side: number;
}

export interface WaveContext {
  pool: readonly RouletteDeck[];
  meta: ReadonlyMap<number, CardMeta>;
  links: SynergyLinks;
  usage: ReadonlyMap<number, number>;
  staples: FormatStaples;
  stats: FormatCardStats;
  targets: WaveTargets;
  /**
   * Competitive data. When set, the main deck waves only draw from the copies the optimiser selects for the
   * deck as it is now (low brick rate, synergy, consistency, usage), recomputed before every wave.
   */
  competitive?: CompetitiveContext;
  optimizer?: OptimizeOptions;
}

export interface WaveState {
  /** Quantity per `section:cardId` key currently in the deck. */
  userBySection: ReadonlyMap<string, number>;
  /** Cards the user turned down: never proposed again. */
  rejected: ReadonlySet<number>;
  /** Learned preference per card (positive = chosen before, negative = turned down before), roughly -3..3. */
  preference?: (cardId: number) => number;
}

export const MAX_CHOICE_OPTIONS = 4;
const MAX_WAVE_COPIES = 6;
const CLOSE_CALL_RANGE: readonly [number, number] = [0.3, 0.65];
const STRONG_LINK_PROBABILITY = 0.4;
const CORE_PROBABILITY = 0.6;
const PREFERENCE_STEP = 0.08;
/** Reserve slots from the format's most played cards: minimum share of decks and weight against similar-deck consensus. */
const MIN_RESERVE_SHARE = 0.1;
const RESERVE_WEIGHT = 0.5;
const MIN_MATCH_OPTIONS = { limit: 8, minCoverage: 0.3, minOverlap: 3 } as const;

const RELATION_NAMES: Record<number, LinkRelation | undefined> = { 1: 'gy', 2: 'engine', 3: 'search', 4: 'mention', 5: 'shared' };
const RELATION_RANK: Record<LinkRelation, number> = { search: 0, mention: 1, gy: 2, engine: 3, shared: 4 };

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function sectionCount(state: WaveState, section: WaveSection): number {
  let total = 0;
  for (const [key, qty] of state.userBySection) if (key.startsWith(`${section}:`)) total += qty;
  return total;
}

function userMainExtra(state: WaveState): Map<number, number> {
  const out = new Map<number, number>();
  for (const [key, qty] of state.userBySection) {
    const [section, id] = key.split(':');
    if (section !== 'side') out.set(Number(id), (out.get(Number(id)) ?? 0) + qty);
  }
  return out;
}

/** Strong links between a candidate and cards the user already has: which user cards, and the best relation. */
function linksToDeck(
  cardId: number,
  deckIds: ReadonlySet<number>,
  links: SynergyLinks,
): { to: number[]; relation: LinkRelation; score: number } | null {
  const found = new Map<number, { relation: LinkRelation; score: number }>();
  const consider = (other: number, code: number, score: number) => {
    const relation = RELATION_NAMES[code];
    if (!relation || !deckIds.has(other) || other === cardId) return;
    const current = found.get(other);
    if (!current || RELATION_RANK[relation] < RELATION_RANK[current.relation]) found.set(other, { relation, score });
  };
  for (const [target, code, score] of links.get(cardId) ?? []) consider(target, code, score);
  for (const other of deckIds) for (const [target, code, score] of links.get(other) ?? []) if (target === cardId) consider(other, code, score);
  if (found.size === 0) return null;
  const best = [...found.entries()].sort((a, b) => RELATION_RANK[a[1].relation] - RELATION_RANK[b[1].relation] || b[1].score - a[1].score);
  return { to: best.slice(0, 2).map(([id]) => id), relation: best[0][1].relation, score: Math.max(...[...found.values()].map((f) => f.score)) };
}

/** Groups consecutive copy slots of the same card into a wave card. */
function groupSlots(
  slots: readonly ConsensusSlot[],
  matches: readonly PoolMatch[],
  extraWhy: (cardId: number) => WhyTag[],
): WaveCard[] {
  const byCard = new Map<string, WaveCard>();
  for (const slot of slots) {
    const key = `${slot.section}:${slot.cardId}`;
    const existing = byCard.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.probability = Math.min(existing.probability, slot.probability);
    } else {
      byCard.set(key, {
        cardId: slot.cardId,
        section: slot.section,
        quantity: 1,
        probability: slot.probability,
        playedBy: slot.support,
        of: matches.length,
        why: extraWhy(slot.cardId),
      });
    }
  }
  return [...byCard.values()];
}

function applyPreference(slot: ConsensusSlot, state: WaveState): ConsensusSlot {
  const net = clamp(state.preference?.(slot.cardId) ?? 0, -3, 3);
  return net === 0 ? slot : { ...slot, probability: clamp(slot.probability * (1 + PREFERENCE_STEP * net), 0, 1) };
}

function takeCopies(slots: readonly ConsensusSlot[], max: number): ConsensusSlot[] {
  const taken = new Map<number, number>();
  const out: ConsensusSlot[] = [];
  for (const slot of slots) {
    if (out.length >= max) break;
    const already = taken.get(slot.cardId) ?? 0;
    if (slot.copy !== (slots.find((s) => s.cardId === slot.cardId)?.copy ?? slot.copy) + already) continue; // keep copies consecutive
    taken.set(slot.cardId, already + 1);
    out.push(slot);
  }
  return out;
}

/**
 * Orders the options of a choice by how much each improves the competitive score of the deck (with the
 * wave's fixed cards already in), best first. Options that clearly beat the worst one get a `better-score` tag.
 */
function rankOptionsByScore(options: WaveCard[], state: WaveState, fixed: readonly ConsensusSlot[], competitive: CompetitiveContext): WaveCard[] {
  const base: number[] = [];
  for (const [key, qty] of state.userBySection) {
    const [section, id] = key.split(':');
    if (section === 'main') for (let i = 0; i < qty; i++) base.push(Number(id));
  }
  for (const slot of fixed) base.push(slot.cardId);
  const scored = options.map((option) => {
    const deck = [...base];
    for (let i = 0; i < option.quantity; i++) deck.push(option.cardId);
    return { option, overall: scoreDeck(deck, competitive, { samples: 300 }).overall };
  });
  const worst = Math.min(...scored.map((x) => x.overall));
  return scored
    .sort((a, b) => b.overall - a.overall || b.option.probability - a.option.probability)
    .map(({ option, overall }) =>
      overall - worst >= 0.004 ? { ...option, why: [...option.why, { kind: 'better-score', delta: overall - worst } as WhyTag] } : option,
    );
}

/** The next wave for the deck as it is now, or why there is none. */
export function nextWave(state: WaveState, ctx: WaveContext): WaveResult {
  const mainGap = ctx.targets.main - sectionCount(state, 'main');
  const extraGap = ctx.targets.extra - sectionCount(state, 'extra');
  const sideGap = ctx.targets.side - sectionCount(state, 'side');
  if (mainGap <= 0 && extraGap <= 0 && sideGap <= 0) return { done: true, reason: 'complete' };

  const matches = rankPoolDecks(userMainExtra(state), ctx.pool, MIN_MATCH_OPTIONS);
  if (matches.length === 0) return { done: true, reason: 'no-match' };
  const { slots: rawSlots, weights } = consensusSlots(state.userBySection, matches);
  // a card is limited to its total copies across Main, Extra and Side, not per section
  const caps = copyCaps(matches);
  const haveIn = (section: WaveSection, cardId: number): number => state.userBySection.get(`${section}:${cardId}`) ?? 0;
  const haveTotal = (cardId: number): number => haveIn('main', cardId) + haveIn('extra', cardId) + haveIn('side', cardId);
  /** Copies the deck can still take of the card, in any section. */
  const room = (cardId: number): number => Math.max(0, (caps.get(cardId) ?? DEFAULT_COPY_CAP) - haveTotal(cardId));
  const slots = rawSlots
    .filter((s) => !state.rejected.has(s.cardId) && s.copy - haveIn(s.section, s.cardId) <= room(s.cardId))
    .map((s) => applyPreference(s, state));
  // Similar decks hold ~40 cards, so a larger main deck would run out of candidates. Reserve slots from the
  // format's most played main deck cards: low probability (they only fill what the similar decks cannot),
  // `support: 0` so they never count as "decks disagree" contenders.
  if (mainGap > 0) {
    const present = new Set(slots.filter((s) => s.section === 'main').map((s) => `${s.cardId}:${s.copy}`));
    for (const [cardId, usage] of ctx.stats.main) {
      if (state.rejected.has(cardId) || usage.share < MIN_RESERVE_SHARE) continue;
      const maxByData = usage.copyShare[2] > 0 ? 3 : usage.copyShare[1] > 0 ? 2 : 1;
      const have = haveIn('main', cardId);
      for (let copy = have + 1; copy <= maxByData; copy++) {
        if (copy - have > room(cardId) || present.has(`${cardId}:${copy}`)) continue;
        const probability = RESERVE_WEIGHT * usage.copyShare[copy - 1];
        if (probability <= 0) continue;
        slots.push(applyPreference({ cardId, section: 'main', copy, probability, support: 0, rank: matches.length, fromDeck: '' }, state));
      }
    }
  }
  const basis = {
    decks: matches.length,
    best: { name: matches[0].deck.name, coverage: matches[0].coverage, archetype: matches[0].deck.archetype ?? null, url: matches[0].deck.url ?? null },
  };
  const deckIds = new Set<number>([...userMainExtra(state).keys()]);

  const sortSlots = (list: ConsensusSlot[]) =>
    [...list].sort((a, b) => b.probability - a.probability || a.rank - b.rank || a.copy - b.copy);
  const allMainSlots = sortSlots(slots.filter((s) => s.section === 'main'));
  let mainSlots = allMainSlots;
  if (ctx.competitive && mainGap > 0 && allMainSlots.length > 0) {
    const userMain: number[] = [];
    for (const [key, qty] of state.userBySection) {
      const [section, id] = key.split(':');
      if (section === 'main') for (let i = 0; i < qty; i++) userMain.push(Number(id));
    }
    const chosen = optimizeMainFill(
      userMain,
      allMainSlots.map((slot) => ({ cardId: slot.cardId, copy: slot.copy, probability: slot.probability })),
      mainGap,
      ctx.competitive,
      ctx.optimizer,
    );
    const keep = new Set(chosen.map((c) => `${c.cardId}:${c.copy}`));
    mainSlots = allMainSlots.filter((s) => keep.has(`${s.cardId}:${s.copy}`));
  }
  const prefTag = (cardId: number): WhyTag[] => {
    const net = state.preference?.(cardId) ?? 0;
    return Math.abs(net) >= 1 ? [{ kind: 'preference', net }] : [];
  };
  const why = (cardId: number, extra: WhyTag[] = []): WhyTag[] => {
    const tags: WhyTag[] = [...extra];
    const link = linksToDeck(cardId, deckIds, ctx.links);
    if (link) tags.push({ kind: 'linked', to: link.to, relation: link.relation });
    const stapleEntry = ctx.staples.main.get(cardId);
    const usage = ctx.usage.get(cardId);
    if (stapleEntry) tags.push({ kind: 'staple', share: stapleEntry.share });
    else if (usage !== undefined && usage >= 0.25) tags.push({ kind: 'usage', share: usage });
    return [...tags, ...prefTag(cardId)];
  };
  const make = (kind: WaveKind, cards: WaveCard[], choice: WaveChoice | null = null): WaveResult => ({
    done: false,
    wave: { id: `${kind}-${[...state.userBySection.values()].reduce((a, b) => a + b, 0)}`, kind, cards, choice, basis },
  });

  if (mainGap > 0) {
    // 1. core: raise the copies of cards the user already plays toward what similar decks run
    const haveMain = new Set([...state.userBySection.keys()].filter((k) => k.startsWith('main:')).map((k) => Number(k.split(':')[1])));
    const core = takeCopies(
      mainSlots.filter((s) => haveMain.has(s.cardId) && s.probability >= CORE_PROBABILITY),
      Math.min(MAX_WAVE_COPIES, mainGap),
    );
    if (core.length > 0) {
      const cards = groupSlots(core, matches, (id) => {
        const have = state.userBySection.get(`main:${id}`) ?? 0;
        const typical = ctx.stats.main.get(id) ? typicalCopies(ctx.stats.main.get(id)!) : have + 1;
        return [{ kind: 'playset', have, typical }];
      });
      return make('core', cards.map((c) => ({ ...c, why: [...c.why, ...why(c.cardId).filter((t) => t.kind !== 'playset')] })));
    }

    // 2. need: a ritual monster without enough ritual spells -> the user picks the spell
    const ritualMonsters = [...haveMain].filter((id) => hasFlag(ctx.meta.get(id), FLAG.ritualMonster));
    const ritualSpells = [...state.userBySection.entries()]
      .filter(([k]) => k.startsWith('main:') && hasFlag(ctx.meta.get(Number(k.split(':')[1])), FLAG.ritualSpell))
      .reduce((sum, [, q]) => sum + q, 0);
    if (ritualMonsters.length > 0 && ritualSpells < 2) {
      const candidates = new Map<number, number>();
      for (const s of mainSlots) if (hasFlag(ctx.meta.get(s.cardId), FLAG.ritualSpell) && s.copy === 1) candidates.set(s.cardId, s.probability);
      for (const [id, usage] of ctx.stats.main) {
        if (!hasFlag(ctx.meta.get(id), FLAG.ritualSpell) || state.rejected.has(id) || haveMain.has(id)) continue;
        candidates.set(id, Math.max(candidates.get(id) ?? 0, 0.6 * (candidates.get(id) ?? 0) + 0.4 * usage.share));
      }
      const ranked = [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHOICE_OPTIONS);
      if (ranked.length >= 2) {
        const options = ranked.map(([cardId, probability]): WaveCard => {
          const usage = ctx.stats.main.get(cardId);
          return {
            cardId,
            section: 'main',
            quantity: Math.min(usage ? typicalCopies(usage) : 2, mainGap),
            probability,
            playedBy: mainSlots.find((s) => s.cardId === cardId)?.support ?? 0,
            of: matches.length,
            why: why(cardId, [{ kind: 'ritual-need' }]),
          };
        });
        return make('need', [], { id: 'ritual-spell', prompt: 'ritual-spell', options, recommended: 0 });
      }
      if (ranked.length === 1) {
        const [cardId, probability] = ranked[0];
        const usage = ctx.stats.main.get(cardId);
        return make('need', [
          { cardId, section: 'main', quantity: Math.min(usage ? typicalCopies(usage) : 2, mainGap), probability, playedBy: 0, of: matches.length, why: why(cardId, [{ kind: 'ritual-need' }]) },
        ]);
      }
    }

    // 3. partners: candidates strongly tied to what the user already plays
    const partnerSlots = mainSlots.filter((s) => s.probability >= STRONG_LINK_PROBABILITY && linksToDeck(s.cardId, deckIds, ctx.links));
    const partners = takeCopies(partnerSlots, Math.min(MAX_WAVE_COPIES, mainGap));
    if (partners.length > 0) return make('partners', groupSlots(partners, matches, (id) => why(id)));

    // 4. engine: the rest of what the closest decks play most reliably
    const confident = takeCopies(mainSlots.filter((s) => s.probability >= 0.65 && !ctx.staples.main.has(s.cardId)), Math.min(MAX_WAVE_COPIES, mainGap));
    if (confident.length > 0) return make('engine', groupSlots(confident, matches, (id) => why(id)));

    // 5. support: generic and flexible slots; when the decks disagree, let the user pick
    const sure = takeCopies(mainSlots.filter((s) => s.probability >= CLOSE_CALL_RANGE[1]), Math.min(MAX_WAVE_COPIES, mainGap));
    const contenders = mainSlots.filter((s) => s.copy === 1 && s.support > 0 && s.probability >= CLOSE_CALL_RANGE[0] && s.probability < CLOSE_CALL_RANGE[1]);
    const distinct = [...new Map(contenders.map((s) => [s.cardId, s])).values()];
    if (distinct.length >= 2 && sure.length < Math.min(MAX_WAVE_COPIES, mainGap)) {
      let options = distinct.slice(0, MAX_CHOICE_OPTIONS).map((s): WaveCard => ({
        cardId: s.cardId,
        section: 'main',
        quantity: 1,
        probability: s.probability,
        playedBy: s.support,
        of: matches.length,
        why: why(s.cardId),
      }));
      if (ctx.competitive) options = rankOptionsByScore(options, state, sure, ctx.competitive);
      return make('support', groupSlots(sure, matches, (id) => why(id)), { id: 'close-call', prompt: 'close-call', options, recommended: 0 });
    }
    const fill = takeCopies(mainSlots, Math.min(MAX_WAVE_COPIES, mainGap));
    if (fill.length > 0) return make('support', groupSlots(fill, matches, (id) => why(id)));
  }

  // extra and side: structured fill (recurring cards of the format + cards specific to the archetype)
  const finalMain = new Map<number, number>();
  for (const [key, qty] of state.userBySection) {
    const [section, id] = key.split(':');
    if (section === 'main') finalMain.set(Number(id), qty);
  }
  const monsters = buildMonsterPool(finalMain, ctx.meta);
  for (const section of ['extra', 'side'] as const) {
    const gap = section === 'extra' ? extraGap : sideGap;
    if (gap <= 0) continue;
    const picks = selectStructuredSection({
      section,
      slots: sortSlots(slots.filter((s) => s.section === section)),
      gap,
      matchedSections: matches.map((m) => (section === 'extra' ? m.deck.extra : m.deck.side)),
      weights,
      staples: ctx.staples[section],
      have: (cardId) => state.userBySection.get(`${section}:${cardId}`) ?? 0,
      adjust: section === 'extra' ? (slot) => (isExtraReachable(ctx.meta.get(slot.cardId), monsters) ? 1 : 0.35) : undefined,
      maxCopies: (cardId) => haveIn(section, cardId) + room(cardId),
      makeSlot: (cardId, copy, probability): ConsensusSlot => ({ cardId, section, copy, probability, support: 0, rank: matches.length, fromDeck: '' }),
    }).filter((p) => !state.rejected.has(p.slot.cardId));
    if (picks.length === 0) continue;
    const staple = new Map(picks.filter((p) => p.staple).map((p) => [p.slot.cardId, p.staple!.share]));
    const cards = groupSlots(picks.map((p) => p.slot), matches, (id) => {
      const tags: WhyTag[] = [];
      if (staple.has(id)) tags.push({ kind: 'staple', share: staple.get(id)! });
      if (section === 'extra' && isExtraReachable(ctx.meta.get(id), monsters)) tags.push({ kind: 'reachable' });
      const link = linksToDeck(id, deckIds, ctx.links);
      if (link) tags.push({ kind: 'linked', to: link.to, relation: link.relation });
      return [...tags, ...prefTag(id)];
    });
    return make(section, cards);
  }
  return { done: true, reason: 'no-candidates' };
}

/** The deck after a wave: every card of the wave, plus the chosen option when the wave has a choice. */
export function applyWave(
  state: WaveState,
  wave: Wave,
  choiceIndex: number | null,
): Map<string, number> {
  const next = new Map(state.userBySection);
  const cards = [...wave.cards];
  if (wave.choice && choiceIndex !== null && wave.choice.options[choiceIndex]) cards.push(wave.choice.options[choiceIndex]);
  for (const card of cards) {
    const key = `${card.section}:${card.cardId}`;
    next.set(key, (next.get(key) ?? 0) + card.quantity);
  }
  return next;
}

/** Runs the whole wave sequence taking the recommended option of every choice. Used by tests and the backtest. */
export function simulateWaves(
  initial: ReadonlyMap<string, number>,
  ctx: WaveContext,
  options: { maxWaves?: number; preference?: (cardId: number) => number } = {},
): { waves: Wave[]; deck: Map<string, number>; stopped: 'complete' | 'no-match' | 'no-candidates' | 'max-waves' } {
  let state: WaveState = { userBySection: initial, rejected: new Set(), preference: options.preference };
  const waves: Wave[] = [];
  for (let i = 0; i < (options.maxWaves ?? 30); i++) {
    const result = nextWave(state, ctx);
    if (result.done) return { waves, deck: new Map(state.userBySection), stopped: result.reason };
    waves.push(result.wave);
    state = { ...state, userBySection: applyWave(state, result.wave, result.wave.choice ? result.wave.choice.recommended : null) };
  }
  return { waves, deck: new Map(state.userBySection), stopped: 'max-waves' };
}
