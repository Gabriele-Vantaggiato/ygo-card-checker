import { CardMeta, KIND, isExtraKind } from './card-meta.utils';

/**
 * Can the main-deck monsters realistically summon this Extra Deck card?
 * Level/rank/tuner only (no card-specific material text), so it is deliberately permissive:
 * Fusion and Link are never rejected beyond a minimum monster count, since their materials are card-specific.
 */
export interface MonsterPool {
  /** Non-Tuner main monsters by level -> copies. */
  nonTuners: Map<number, number>;
  /** Tuner main monsters by level -> copies. */
  tuners: Map<number, number>;
  total: number;
}

export function buildMonsterPool(
  mainCopies: Iterable<[number, number]>,
  meta: ReadonlyMap<number, CardMeta>,
): MonsterPool {
  const pool: MonsterPool = { nonTuners: new Map(), tuners: new Map(), total: 0 };
  for (const [id, qty] of mainCopies) {
    const card = meta.get(id);
    if (!card || card.kind !== KIND.monster) continue;
    const bucket = card.tuner ? pool.tuners : pool.nonTuners;
    bucket.set(card.level, (bucket.get(card.level) ?? 0) + qty);
    pool.total += qty;
  }
  return pool;
}

function copiesAt(map: ReadonlyMap<number, number>, level: number): number {
  return map.get(level) ?? 0;
}

function synchroReachable(level: number, pool: MonsterPool): boolean {
  for (const [tunerLevel] of pool.tuners) {
    const remaining = level - tunerLevel;
    if (remaining <= 0) continue;
    if (copiesAt(pool.nonTuners, remaining) >= 1) return true;
    for (const [first] of pool.nonTuners) {
      const second = remaining - first;
      if (second <= 0) continue;
      const need = first === second ? 2 : 1;
      if (copiesAt(pool.nonTuners, first) >= need && copiesAt(pool.nonTuners, second) >= 1) return true;
    }
  }
  return false;
}

export function isExtraReachable(card: CardMeta | undefined, pool: MonsterPool): boolean {
  if (!card || !isExtraKind(card.kind) || card.level <= 0) return true;
  switch (card.kind) {
    case KIND.xyz:
      return copiesAt(pool.nonTuners, card.level) + copiesAt(pool.tuners, card.level) >= 2;
    case KIND.synchro:
      return synchroReachable(card.level, pool);
    case KIND.link:
      return pool.total >= Math.min(card.level, 2);
    default:
      return pool.total >= 2;
  }
}
