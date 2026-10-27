import { FrameVoter } from './frame-vote.utils';

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
});
