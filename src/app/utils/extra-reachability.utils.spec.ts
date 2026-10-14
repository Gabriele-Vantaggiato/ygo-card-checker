import { CardMeta, KIND } from './card-meta.utils';
import { buildMonsterPool, isExtraReachable } from './extra-reachability.utils';

const monster = (level: number, tuner = false): CardMeta => ({ roles: 0, kind: KIND.monster, level, tuner, flags: 0, archetype: 0 });
const extra = (kind: number, level: number): CardMeta => ({ roles: 0, kind, level, tuner: false, flags: 0, archetype: 0 });

describe('extra reachability', () => {
  const meta = new Map<number, CardMeta>([
    [1, monster(4)],
    [2, monster(2)],
    [3, monster(3)],
    [4, monster(2, true)],
    [5, monster(1, true)],
  ]);
  const pool = (...pairs: Array<[number, number]>) => buildMonsterPool(pairs, meta);

  it('needs two same-level monsters for Xyz', () => {
    expect(isExtraReachable(extra(KIND.xyz, 4), pool([1, 2]))).toBeTrue();
    expect(isExtraReachable(extra(KIND.xyz, 4), pool([1, 1]))).toBeFalse();
    expect(isExtraReachable(extra(KIND.xyz, 3), pool([1, 3]))).toBeFalse();
  });

  it('needs a tuner plus fitting non-tuners for Synchro', () => {
    expect(isExtraReachable(extra(KIND.synchro, 6), pool([4, 1], [1, 1]))).toBeTrue(); // 2 + 4
    expect(isExtraReachable(extra(KIND.synchro, 6), pool([1, 3]))).toBeFalse(); // no tuner
    expect(isExtraReachable(extra(KIND.synchro, 5), pool([5, 1], [1, 1]))).toBeTrue(); // 1 + 4
    expect(isExtraReachable(extra(KIND.synchro, 5), pool([4, 1], [3, 1]))).toBeTrue(); // 2 + 3
  });

  it('allows a tuner plus two non-tuners and respects copies', () => {
    expect(isExtraReachable(extra(KIND.synchro, 7), pool([4, 1], [2, 1], [3, 1]))).toBeTrue(); // 2 + 2 + 3
    expect(isExtraReachable(extra(KIND.synchro, 6), pool([5, 1], [2, 2]))).toBeFalse(); // 1 + 2 + 2 needs 5, not 6
  });

  it('is permissive for unknown cards, Fusion and Link with enough monsters', () => {
    expect(isExtraReachable(undefined, pool())).toBeTrue();
    expect(isExtraReachable(extra(KIND.fusion, 0), pool())).toBeTrue();
    expect(isExtraReachable(extra(KIND.link, 2), pool([1, 2]))).toBeTrue();
    expect(isExtraReachable(extra(KIND.link, 2), pool())).toBeFalse();
  });
});
