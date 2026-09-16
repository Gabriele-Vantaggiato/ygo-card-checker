import { ReplayLineMemoryService, isObservedLine } from './replay-line-memory.service';
import { lineReplay } from '../testing/replay-line.fixtures';
import { openingLine } from '../utils/replay-lines';

describe('ReplayLineMemoryService', () => {
  let memory: ReplayLineMemoryService;
  beforeEach(() => { localStorage.removeItem('ygo-replay-lines-v1'); memory = new ReplayLineMemoryService(); });
  afterEach(() => memory.clear());
  const games = () => ['a','b','c'].map(id => lineReplay({sha256:id.repeat(64)}));
  it('requires repeated wins and same hand, separates rules, excludes the current replay', () => {
    memory.record(games()); const row = openingLine(games()[0])!;
    expect(memory.recommend(row.deckKey,row.openingHand)).toBeDefined();
    expect(memory.recommend(row.deckKey,[1,2,3,4,6])).toBeUndefined();
    expect(memory.recommend(row.deckKey,row.openingHand,row.replayId)).toBeUndefined();
    expect(memory.recommend(row.deckKey,row.openingHand,undefined,4)).toBeUndefined();
    expect(memory.recommend(row.deckKey,row.openingHand,undefined,5,2)).toBeUndefined();
  });
  it('persists validated rows, deduplicates uploads and clears memory', () => {
    memory.record([...games(),...games()]); expect(memory.observations().length).toBe(3);
    expect(new ReplayLineMemoryService().observations().length).toBe(3);
    memory.clear(); expect(new ReplayLineMemoryService().observations().length).toBe(0);
    expect(isObservedLine({actions: 'invalid'})).toBeFalse();
  });
  it('reports per-deck game counts independent of any specific opening line', () => {
    const rows = games();
    memory.record([rows[0], { ...rows[1], focusWon: false }, { ...rows[2], focusWon: null }]);
    const key = openingLine(rows[0])!.deckKey;
    expect(memory.deckStats(key)).toEqual({ games: 3, wins: 1, losses: 1, unknown: 1 });
    expect(memory.deckStats('nonexistent|key')).toEqual({ games: 0, wins: 0, losses: 0, unknown: 0 });
  });
  it('does not promote unknown results or sequences requiring opponent interaction', () => {
    const rows = games().map(r => ({...r,focusWon:null})); memory.record(rows);
    const row = openingLine(rows[0])!; expect(memory.recommend(row.deckKey,row.openingHand)).toBeUndefined();
    memory.record(games().map(r => ({...r,events:[...r.events.slice(0,3),{kind:'chain' as const,controller:1,code:20,turn:1,rawType:'chain'},...r.events.slice(3)]})));
    expect(memory.recommend(row.deckKey,row.openingHand)).toBeUndefined();
  });
});
