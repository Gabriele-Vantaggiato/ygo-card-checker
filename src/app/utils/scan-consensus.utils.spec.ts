import { ScanConsensus } from './scan-consensus.utils';

describe('ScanConsensus', () => {
  const make = () => new ScanConsensus({ required: 2, windowSize: 4, cooldownMs: 1500 });

  it('does not accept a single read', () => {
    expect(make().push('A', 0)).toBeNull();
  });

  it('accepts after two agreeing reads', () => {
    const c = make();
    c.push('A', 0);
    expect(c.push('A', 300)).toBe('A');
  });

  it('tolerates noise between agreeing reads', () => {
    const c = make();
    c.push('A', 0);
    c.push('B', 300);
    expect(c.push('A', 600)).toBe('A');
  });

  it('does not count a card that stays in front of the camera twice', () => {
    const c = make();
    c.push('A', 0);
    expect(c.push('A', 300)).toBe('A');
    for (let t = 600; t <= 6000; t += 300) {
      expect(c.push('A', t)).toBeNull();
    }
  });

  it('accepts the same card again after it left for longer than the cooldown', () => {
    const c = make();
    c.push('A', 0);
    c.push('A', 300);
    c.push(null, 600);
    expect(c.push('A', 3000)).toBeNull();
    expect(c.push('A', 3300)).toBe('A');
  });

  it('accepts a different card right after the previous one', () => {
    const c = make();
    c.push('A', 0);
    c.push('A', 300);
    c.push('B', 600);
    expect(c.push('B', 900)).toBe('B');
  });
});
