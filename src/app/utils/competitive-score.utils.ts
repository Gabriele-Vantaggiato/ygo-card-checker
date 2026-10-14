import { CardMeta, FLAG, KIND, hasFlag } from './card-meta.utils';

/**
 * Competitive quality model for a main deck, built from static card data (flags from knowledge tags,
 * typed card links, per-format usage in tournament decks), so scores are deterministic and cheap enough
 * to drive an optimiser.
 *
 * Calibration note: every component below was checked against real tournament decks vs random decks of
 * the same format (scripts/competitive-report.ts). Component definitions that did NOT separate them in the
 * right direction (a brick rate from single-card flags, link density normalised per distinct card) were
 * dropped. `crossTurn` could not be validated that way, so it is informational only (weight 0).
 */

/** Typed link between two pool cards: [targetId, relationCode, score]. */
export type SynergyLink = readonly [number, number, number];
export type SynergyLinks = ReadonlyMap<number, readonly SynergyLink[]>;

export interface CompetitiveContext {
  meta: ReadonlyMap<number, CardMeta>;
  links: SynergyLinks;
  /** Card id -> share (0..1) of competitive decks of the format that play it. */
  usage: ReadonlyMap<number, number>;
}

export interface SynergyScore {
  /** Engine coherence + archetype concentration + GY resource loop, 0..1. */
  inTurn: number;
  /** Continuous cards and recursion inside the main engine, 0..1. NOT validated against real decks; informational only. */
  crossTurn: number;
}

export interface CompetitiveScore {
  /**
   * Probability that an opening hand has no usable card of the deck's main engine, 0..1 (lower is better).
   * A proxy for bricking: it measures engine access, not what the hand can actually do.
   */
  brickRate: number;
  synergy: SynergyScore;
  /** Copy concentration: share of the main deck made of repeated cards, 0..1. */
  consistency: number;
  /** Average per-copy usage in the format's tournament decks, 0..1. */
  usage: number;
  /** Single number to compare decks: higher is better. */
  overall: number;
}

const RELATION = { gy: 1, engine: 2, search: 3, mention: 4, shared: 5 } as const;
/** Links that tie two cards into one engine. */
const ENGINE_RELATIONS = new Set<number>([RELATION.gy, RELATION.engine, RELATION.search, RELATION.mention, RELATION.shared]);

/**
 * `crossTurn` has weight 0 on purpose: with the data available (knowledge tags) it did not separate real
 * tournament decks from random ones (AUC 0.40-0.50), so it is reported but never optimised.
 */
export const OVERALL_WEIGHTS = { brick: 0.35, usage: 0.25, inTurn: 0.25, crossTurn: 0, consistency: 0.15 } as const;

/** Reference values: what real tournament decks typically reach, used to scale components into 0..1. */
const COHERENCE_REFERENCE = 0.5;
const ARCHETYPE_REFERENCE = 0.6;
const CONSISTENCY_REFERENCE = 0.5;

/** Deterministic PRNG (mulberry32) so a deck always gets the same score. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function countCopies(mainCopies: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of mainCopies) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * The deck's main engine: the largest group of cards tied together by engine-type links
 * (GY, engine, search, mention, shared mention). Returns the card ids and the share of copies they cover.
 */
export function engineCore(counts: ReadonlyMap<number, number>, links: SynergyLinks): { core: Set<number>; share: number } {
  const ids = [...counts.keys()];
  if (ids.length === 0) return { core: new Set(), share: 0 };
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let node = x;
    while (parent.get(node) !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  for (const id of ids) {
    for (const [target, relation] of links.get(id) ?? []) {
      if (counts.has(target) && ENGINE_RELATIONS.has(relation)) parent.set(find(id), find(target));
    }
  }
  const weight = new Map<number, number>();
  let total = 0;
  for (const [id, qty] of counts) {
    weight.set(find(id), (weight.get(find(id)) ?? 0) + qty);
    total += qty;
  }
  const [bestRoot, bestWeight] = [...weight.entries()].sort((a, b) => b[1] - a[1])[0];
  return { core: new Set(ids.filter((id) => find(id) === bestRoot)), share: bestWeight / Math.max(total, 1) };
}

function isEnabler(card: CardMeta | undefined): boolean {
  return hasFlag(card, FLAG.search | FLAG.ssDeck | FLAG.draw | FLAG.ssHand);
}

export interface BrickOptions {
  handSize?: number;
  samples?: number;
  seed?: number;
}

/** Monte Carlo brick rate of a main deck given as card ids (one entry per copy). */
export function brickRate(
  mainCopies: readonly number[],
  ctx: Pick<CompetitiveContext, 'meta' | 'links'>,
  options: BrickOptions = {},
): number {
  const handSize = options.handSize ?? 5;
  const samples = options.samples ?? 800;
  if (mainCopies.length < handSize) return 1;
  const { core } = engineCore(countCopies(mainCopies), ctx.links);
  const isCore = mainCopies.map((id) => core.has(id));
  const isCoreEnabler = mainCopies.map((id) => core.has(id) && isEnabler(ctx.meta.get(id)));
  const random = seededRandom(options.seed ?? 20241);
  const indexes = mainCopies.map((_, i) => i);
  let noCore = 0;
  let noEnabler = 0;
  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < handSize; i++) {
      const j = i + Math.floor(random() * (indexes.length - i));
      [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    let core1 = false;
    let enabler1 = false;
    for (let i = 0; i < handSize; i++) {
      core1 ||= isCore[indexes[i]];
      enabler1 ||= isCoreEnabler[indexes[i]];
    }
    if (!core1) noCore++;
    if (!enabler1) noEnabler++;
  }
  // blend: no engine card at all, and no engine card that starts something
  return 0.5 * (noCore / samples) + 0.5 * (noEnabler / samples);
}

/** Share of main copies in the single most represented archetype. */
export function archetypeShare(mainCopies: readonly number[], meta: ReadonlyMap<number, CardMeta>): number {
  if (mainCopies.length === 0) return 0;
  const tally = new Map<number, number>();
  for (const id of mainCopies) {
    const archetype = meta.get(id)?.archetype ?? 0;
    if (archetype > 0) tally.set(archetype, (tally.get(archetype) ?? 0) + 1);
  }
  return tally.size === 0 ? 0 : Math.max(...tally.values()) / mainCopies.length;
}

/** Copy concentration: 1 - distinct/size, so decks full of 3-ofs score high and singleton piles low. */
export function consistencyScore(mainCopies: readonly number[]): number {
  if (mainCopies.length === 0) return 0;
  const concentration = 1 - new Set(mainCopies).size / mainCopies.length;
  return Math.min(1, concentration / CONSISTENCY_REFERENCE);
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Synergy of a main deck. Both parts are in 0..1. */
export function synergyScore(mainCopies: readonly number[], ctx: Pick<CompetitiveContext, 'meta' | 'links'>): SynergyScore {
  if (mainCopies.length === 0) return { inTurn: 0, crossTurn: 0 };
  const counts = countCopies(mainCopies);
  const { core, share } = engineCore(counts, ctx.links);

  let gyFill = 0;
  let gyUse = 0;
  let continuous = 0;
  let recursion = 0;
  for (const [id, qty] of counts) {
    const card = ctx.meta.get(id);
    if (hasFlag(card, FLAG.gyFill)) gyFill += qty;
    if (hasFlag(card, FLAG.gyUse | FLAG.ssGy)) gyUse += qty;
    // value that carries over turns only counts inside the main engine: loose recursion in an
    // unrelated pile of cards does not build a game plan
    if (!core.has(id)) continue;
    if (hasFlag(card, FLAG.continuous)) continuous += qty;
    if (hasFlag(card, FLAG.ssGy) || (hasFlag(card, FLAG.gyUse) && card?.kind === KIND.monster)) recursion += qty;
  }
  const loop = Math.min(1, gyFill / 5) * Math.min(1, gyUse / 5);
  return {
    inTurn: 0.45 * clamp01(share / COHERENCE_REFERENCE) + 0.4 * clamp01(archetypeShare(mainCopies, ctx.meta) / ARCHETYPE_REFERENCE) + 0.15 * loop,
    crossTurn: clamp01((continuous + 0.8 * recursion) / 8),
  };
}

/** Average per-copy usage of the main deck's cards in the format's tournament decks. */
export function usageScore(mainCopies: readonly number[], usage: ReadonlyMap<number, number>): number {
  if (mainCopies.length === 0) return 0;
  let sum = 0;
  for (const id of mainCopies) sum += usage.get(id) ?? 0;
  return sum / mainCopies.length;
}

export function overallScore(brick: number, synergy: SynergyScore, consistency: number, usage: number): number {
  const w = OVERALL_WEIGHTS;
  return w.brick * (1 - brick) + w.usage * usage + w.inTurn * synergy.inTurn + w.crossTurn * synergy.crossTurn + w.consistency * consistency;
}

/** Full competitive score of a main deck (list of card ids, one entry per copy). */
export function scoreDeck(mainCopies: readonly number[], ctx: CompetitiveContext, options: BrickOptions = {}): CompetitiveScore {
  const brick = brickRate(mainCopies, ctx, options);
  const synergy = synergyScore(mainCopies, ctx);
  const consistency = consistencyScore(mainCopies);
  const usage = usageScore(mainCopies, ctx.usage);
  return { brickRate: brick, synergy, consistency, usage, overall: overallScore(brick, synergy, consistency, usage) };
}
