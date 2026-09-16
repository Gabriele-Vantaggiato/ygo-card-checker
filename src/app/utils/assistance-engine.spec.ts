import { AssistanceEngine, triggerOverlaps } from './assistance-engine';
import { belongsToSetcode, sharesSetcode } from './setcode.utils';
import { knowledgeFixture, scriptFixture, boardFixture } from '../testing/assistance.fixtures';

describe('assistance evidence and resources', () => {
  let engine: AssistanceEngine;
  beforeEach(() => engine = new AssistanceEngine(knowledgeFixture()));
  it('uses complete identities even when all recommendation buckets are empty', () => {
    expect(engine.catalog.size).toBe(5);
    expect(engine.targets('Target', 1)?.map(hit => hit.id)).toEqual([2]);
  });
  it('never matches a longer name merely containing the searched name', () => {
    expect(engine.candidates(1, scriptFixture()).map(hit => hit.targetId)).toEqual([2]);
    expect(engine.targets('Targ', 1)).toBeNull();
  });
  it('does not broaden unsupported exceptions or partly parsed alternatives', () => {
    expect(engine.targets('Zombie monster except Target', 1)).toBeNull();
    expect(engine.targets('Target | unknown restriction', 1)).toBeNull();
    expect(engine.targets('', 1)).toBeNull();
  });
  it('keeps attribute, race and card type conjunctive', () => {
    const ids = engine.targets('DARK Zombie monster', 1)!.map(hit => hit.id);
    expect(ids).toContain(2); expect(ids).not.toContain(3);
    expect(engine.targets('LIGHT Zombie monster', 1)).toEqual([]);
  });
  it('respects parent membership without assigning a sibling to a subfamily', () => {
    expect(belongsToSetcode([0x1048], 0x48)).toBeTrue();
    expect(belongsToSetcode([0x48], 0x1048)).toBeFalse();
    expect(belongsToSetcode([0x2048], 0x1048)).toBeFalse();
    expect(sharesSetcode([0x1048], [0x48])).toBeTrue();
    expect(belongsToSetcode([0], 0)).toBeFalse();
    expect(engine.familyPartners(1)).toEqual([4]);
  });
  it('matches setcodes and explicit series independently of card-name words', () => {
    expect(engine.targets('setcode:0x48', 1)?.map(hit => hit.id)).toEqual([1, 4]);
    expect(engine.targets('Family', 1)?.map(hit => hit.id)).toEqual([4]);
  });
  it('preserves numeric restrictions and excludes Extra Deck targets from deck searches', () => {
    const script = scriptFixture('monster');
    script.steps[0].actions[0].constraints = { maxLevel: 4, maxAtk: 1600 };
    expect(engine.candidates(1, script).map(hit => hit.targetId)).toEqual([2]);
    expect(engine.candidates(1, scriptFixture('Extra target'))).toEqual([]);
  });
  it('does not share the this-card cache between different sources', () => {
    expect(engine.targets('this card', 1)?.[0].id).toBe(1);
    expect(engine.targets('this card', 2)?.[0].id).toBe(2);
  });
  it('recomputes target availability after moving a card out of the required zone', () => {
    const board = boardFixture();
    expect(engine.assessResources(1, scriptFixture(), board)[0].status).toBe('resources_present');
    board.deck = []; board.gy = [2];
    expect(engine.assessResources(1, scriptFixture(), board)[0].status).toBe('missing_resources');
  });
  it('counts copies without mutating or spending the input inventory', () => {
    const board = boardFixture(); const script = scriptFixture();
    script.steps[0].actions[0].qty = 2;
    expect(engine.assessResources(1, script, board)[0].status).toBe('missing_resources');
    board.deck = [2, 2]; const before = JSON.stringify(board);
    expect(engine.assessResources(1, script, board)[0].status).toBe('resources_present');
    expect(JSON.stringify(board)).toBe(before);
  });
  it('never pretends a multi-action effect has been simulated', () => {
    const script = scriptFixture(); script.steps[0].actions.push({ ...script.steps[0].actions[0] });
    expect(engine.assessResources(1, script, boardFixture())[0].status).toBe('unknown');
  });
  it('keeps costs and summon restrictions explicit', () => {
    const script = scriptFixture(); script.steps[0].cost = ['banish_this']; script.steps[0].actions[0].op = 'ss';
    const result = engine.assessResources(1, script, boardFixture())[0];
    expect(result.checks).toContain('costs_and_restrictions');
    expect(result.checks).toContain('summon_restrictions');
    expect(result.checks).toContain('activation_conditions');
  });
  it('reports no active opportunity for a source still in deck', () => {
    expect(engine.assessResources(1, scriptFixture(), { ...boardFixture(), hand: [], deck: [1, 2] })).toEqual([]);
  });
  it('keeps unknown grammar unresolved instead of claiming a missing target', () => {
    expect(engine.assessResources(1, scriptFixture('monster with an unknown condition'), boardFixture())[0].status).toBe('unknown');
  });
  it('reports potential shared triggers, deduplicating copies and excluding quick effects', () => {
    const base = { effectType: 'trigger', spellSpeed: 1, missedTimingRisk: false, triggerEvents: ['to_grave', 'other'] };
    const result = triggerOverlaps([1, 1, 2, 3], { '1': base, '2': base, '3': { ...base, effectType: 'quick' } });
    expect(result).toEqual([{ event: 'to_grave', cardIds: [1, 2], potential: true }]);
  });
});
