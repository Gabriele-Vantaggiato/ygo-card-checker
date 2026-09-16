import { aggregateLines, compareLine, deckKey, openingLine } from './replay-lines';
import { lineReplay } from '../testing/replay-line.fixtures';
import { RestrictionTrace } from '../models/replay-restriction.model';

describe('shared replay lines', () => {
  it('retains action identity, repetitions and opening hand without mutating the replay', () => {
    const replay = lineReplay(); const before = JSON.stringify(replay);
    const line = openingLine(replay)!;
    expect(line.actions.map(a => a.kind)).toEqual(['normal_summon','activate','special_summon']);
    expect(line.openingHand).toEqual([1,2,3,4,5]); expect(JSON.stringify(replay)).toBe(before);
  });
  it('never reconstructs a hidden hand from the deck', () => {
    const replay = lineReplay(); replay.events[0].cards = [1,0,3,4,5];
    expect(openingLine(replay)).toBeNull();
    delete replay.events[0].cards; expect(openingLine(replay)).toBeNull();
  });
  it('does not include later draws or opponent actions in the opening sequence', () => {
    const replay = lineReplay(); replay.events.push({kind:'draw',cards:[6],controller:0,turn:2,rawType:'draw'});
    expect(openingLine(replay)!.openingHand).not.toContain(6);
  });
  it('separates copy counts and extra decks while ignoring deck order', () => {
    expect(deckKey({main:[2,1,1],extra:[3]})).toBe(deckKey({main:[1,2,1],extra:[3]}));
    expect(deckKey({main:[2,1],extra:[3]})).not.toBe(deckKey({main:[2,1,1],extra:[3]}));
  });
  it('deduplicates samples and excludes unknown outcomes from winrate', () => {
    const row = openingLine(lineReplay())!;
    const groups = aggregateLines([row,row,{...row,replayId:'b',won:null}]);
    expect(groups[0].games).toBe(2); expect(groups[0].unknownResults).toBe(1); expect(groups[0].winRate).toBeCloseTo(2/3);
  });
  it('detects order deviations without declaring a mistake', () => {
    const replay = lineReplay(); const row = openingLine(replay)!;
    expect(compareLine(replay,row,row.actions).status).toBe('matched');
    const diff = compareLine(replay,row,[...row.actions].reverse());
    expect(diff.status).toBe('deviation'); expect(diff.provenMisplay).toBeFalse();
  });
  it('abstains under opponent interaction or historical locks', () => {
    const replay = lineReplay(); const row = openingLine(replay)!;
    replay.events.push({kind:'chain',controller:1,code:10,turn:1,rawType:'chain'});
    expect(compareLine(replay,row,row.actions).reason).toBe('opponent_interaction');
    const trace: RestrictionTrace = { annotations:[], timelineNotes:[], focusLocksSeen:[{kind:'cannot_special_summon',sourceCode:9,sourceName:'Lock',controller:0,scope:'controller',until:'end_of_turn',appliedTurn:1}] };
    expect(compareLine(lineReplay(),row,row.actions,trace).status).toBe('inconclusive');
  });
});
