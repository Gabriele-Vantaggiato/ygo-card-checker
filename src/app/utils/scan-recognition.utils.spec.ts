import { PresenceCooldown, UnconfidentClock, formatTopHits, shouldOfferCandidates } from './scan-recognition.utils';

describe('shouldOfferCandidates', () => {
  it('waits for the threshold', () => {
    expect(shouldOfferCandidates(0)).toBeFalse();
    expect(shouldOfferCandidates(2499)).toBeFalse();
    expect(shouldOfferCandidates(2500)).toBeTrue();
  });

  it('honours a custom threshold', () => {
    expect(shouldOfferCandidates(1000, 1000)).toBeTrue();
    expect(shouldOfferCandidates(999, 1000)).toBeFalse();
  });
});

describe('UnconfidentClock', () => {
  it('accumulates time between sharp unconfident frames', () => {
    const c = new UnconfidentClock();
    expect(c.push('sharp-unconfident', 0)).toBe(0);
    expect(c.push('sharp-unconfident', 300)).toBe(300);
    expect(c.push('sharp-unconfident', 700)).toBe(700);
  });

  it('pauses on blurry frames without resetting', () => {
    const c = new UnconfidentClock();
    c.push('sharp-unconfident', 0);
    c.push('sharp-unconfident', 300);
    expect(c.push('blurry', 600)).toBe(300);
    expect(c.push('sharp-unconfident', 5000)).toBe(300);
    expect(c.push('sharp-unconfident', 5300)).toBe(600);
  });

  it('resets on a confident vote', () => {
    const c = new UnconfidentClock();
    c.push('sharp-unconfident', 0);
    c.push('sharp-unconfident', 300);
    expect(c.push('confident', 600)).toBe(0);
    expect(c.push('sharp-unconfident', 900)).toBe(0);
  });

  it('caps a single step', () => {
    const c = new UnconfidentClock(1000);
    c.push('sharp-unconfident', 0);
    expect(c.push('sharp-unconfident', 10_000)).toBe(1000);
  });
});

describe('PresenceCooldown', () => {
  it('lets unblocked ids through', () => {
    const p = new PresenceCooldown(1500);
    expect(p.push(1, 0)).toBeTrue();
    expect(p.push(null, 0)).toBeFalse();
  });

  it('blocks the emitted id while it stays in view', () => {
    const p = new PresenceCooldown(1500);
    p.block(1);
    for (let t = 300; t <= 6000; t += 300) {
      expect(p.push(1, t)).toBeFalse();
    }
    expect(p.isBlocked(1)).toBeTrue();
  });

  it('does not release on slow frames that keep showing the card', () => {
    const p = new PresenceCooldown(1500);
    p.block(1);
    expect(p.push(1, 5000)).toBeFalse();
    expect(p.push(1, 10000)).toBeFalse();
  });

  it('releases the id after it was observed absent long enough (blurry or other card)', () => {
    const p = new PresenceCooldown(1500);
    p.block(1);
    expect(p.push(1, 300)).toBeFalse();
    expect(p.push(2, 600)).toBeTrue(); // absent from 600
    expect(p.push(null, 900)).toBeFalse();
    expect(p.push(1, 1500)).toBeFalse(); // absent only 900 ms, seen again
    expect(p.push(1, 2900)).toBeFalse(); // no absence in between
    expect(p.push(null, 3000)).toBeFalse(); // absent from 3000
    expect(p.push(1, 4500)).toBeTrue();
    expect(p.isBlocked(1)).toBeFalse();
  });

  it('a new block replaces the previous one', () => {
    const p = new PresenceCooldown(1500);
    p.block(1);
    p.block(2);
    expect(p.push(1, 200)).toBeTrue();
    expect(p.push(2, 300)).toBeFalse();
  });
});

describe('formatTopHits', () => {
  it('formats id:score pairs', () => {
    expect(formatTopHits([{ id: 1, score: 0.91234 }, { id: 22, score: 0.5 }])).toBe('1:0.912 22:0.500');
  });

  it('keeps at most n hits', () => {
    const hits = [1, 2, 3, 4, 5, 6].map((id) => ({ id, score: 1 }));
    expect(formatTopHits(hits).split(' ').length).toBe(5);
    expect(formatTopHits([])).toBe('');
  });
});
