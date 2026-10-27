import { DEFAULT_MIN_SCORE, FrameHit, FrameVoter } from './frame-vote.utils';

const frame = (a: number, b = 0.5) => [
  { id: 1, score: a },
  { id: 2, score: b },
];

describe('FrameVoter', () => {
  it('is never confident after a single frame', () => {
    const v = new FrameVoter();
    const r = v.push(frame(1.8, 0.9));
    expect(r.confident).toBeFalse();
    expect(r.framesUsed).toBe(1);
    expect(r.candidates[0].id).toBe(1);
  });

  it('is confident after three consistent frames', () => {
    const v = new FrameVoter();
    v.push(frame(1.8));
    v.push(frame(1.7));
    const r = v.push(frame(1.9));
    expect(r.confident).toBeTrue();
    expect(r.candidates[0].id).toBe(1);
    expect(r.candidates[0].votes).toBe(3);
    expect(r.candidates[0].score).toBeCloseTo(5.4, 5);
  });

  it('is not confident when two ids compete with a tiny margin', () => {
    const v = new FrameVoter();
    v.push(frame(1.8, 1.79));
    v.push(frame(1.8, 1.79));
    const r = v.push(frame(1.8, 1.79));
    expect(r.confident).toBeFalse();
  });

  it('is not confident when the top id appears in fewer than minFrames frames', () => {
    const v = new FrameVoter();
    v.push([{ id: 1, score: 1.9 }]);
    v.push([{ id: 2, score: 0.2 }]);
    const r = v.push([{ id: 3, score: 0.1 }]);
    expect(r.confident).toBeFalse();
  });

  it('evicts frames beyond the window', () => {
    const v = new FrameVoter({ windowSize: 3 });
    v.push([{ id: 9, score: 2 }]);
    v.push(frame(1.8));
    v.push(frame(1.8));
    const r = v.push(frame(1.8));
    expect(r.framesUsed).toBe(3);
    expect(r.candidates.some(c => c.id === 9)).toBeFalse();
  });

  it('reset clears history', () => {
    const v = new FrameVoter();
    v.push(frame(1.8));
    v.push(frame(1.8));
    v.push(frame(1.8));
    v.reset();
    const r = v.push(frame(1.8));
    expect(r.framesUsed).toBe(1);
    expect(r.confident).toBeFalse();
  });

  it('is not confident when the stable top candidate is below minScore', () => {
    const v = new FrameVoter({ minScore: 1.2 });
    v.push(frame(1.1, 0.5));
    v.push(frame(1.1, 0.5));
    const r = v.push(frame(1.1, 0.5));
    expect(r.candidates[0].id).toBe(1);
    expect(r.confident).toBeFalse();
  });

  it('is confident once the mean score of the top candidate reaches minScore', () => {
    const v = new FrameVoter({ minScore: 1.2 });
    v.push(frame(1.15, 0.5));
    v.push(frame(1.25, 0.5));
    const r = v.push(frame(1.3, 0.5));
    expect(r.confident).toBeTrue();
  });

  it('measures minScore over the frames the top candidate appeared in', () => {
    const v = new FrameVoter({ minScore: 1.5, windowSize: 4 });
    v.push([{ id: 2, score: 0.3 }]);
    v.push(frame(1.6, 0.3));
    v.push(frame(1.6, 0.3));
    const r = v.push(frame(1.6, 0.3));
    expect(r.framesUsed).toBe(4);
    expect(r.candidates[0].votes).toBe(3);
    expect(r.confident).toBeTrue();
  });

  it('uses a positive default minScore that rejects low-similarity frames', () => {
    expect(DEFAULT_MIN_SCORE).toBeGreaterThan(0);
    const v = new FrameVoter();
    const low = DEFAULT_MIN_SCORE - 0.05;
    v.push(frame(low, 0.1));
    v.push(frame(low, 0.1));
    expect(v.push(frame(low, 0.1)).confident).toBeFalse();
  });

  it('copies the pushed hits (later mutation by the caller does not change the vote)', () => {
    const v = new FrameVoter({ minScore: 0 });
    const hits: FrameHit[] = frame(1.8);
    v.push(hits);
    hits[0].id = 99;
    hits[0].score = 5;
    hits.length = 0;
    v.push(frame(1.8));
    const r = v.push(frame(1.8));
    expect(r.candidates[0].id).toBe(1);
    expect(r.candidates[0].votes).toBe(3);
    expect(r.candidates[0].score).toBeCloseTo(5.4, 5);
  });
});
