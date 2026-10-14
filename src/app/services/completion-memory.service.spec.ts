import { TestBed } from '@angular/core/testing';
import { CompletionMemoryService, isDecision } from './completion-memory.service';

const decision = (over: Partial<Parameters<CompletionMemoryService['record']>[0]> = {}) => ({
  formatId: 'hat',
  archetype: 'Mermail',
  waveKind: 'partners' as const,
  accepted: [] as number[],
  rejected: [] as number[],
  chosen: null as number | null,
  passedOver: [] as number[],
  ...over,
});

describe('CompletionMemoryService', () => {
  let memory: CompletionMemoryService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    memory = TestBed.inject(CompletionMemoryService);
  });

  it('starts empty and has no preference', () => {
    expect(memory.count()).toBe(0);
    expect(memory.preference(1, 'hat', 'Mermail')).toBe(0);
  });

  it('raises cards that were taken or chosen and lowers rejected or passed-over ones', () => {
    memory.record(decision({ accepted: [1], rejected: [2], chosen: 3, passedOver: [4] }));
    expect(memory.preference(1, 'hat', 'Mermail')).toBeGreaterThan(0);
    expect(memory.preference(3, 'hat', 'Mermail')).toBeGreaterThan(memory.preference(1, 'hat', 'Mermail'));
    expect(memory.preference(2, 'hat', 'Mermail')).toBeLessThan(0);
    expect(memory.preference(4, 'hat', 'Mermail')).toBeLessThan(0);
  });

  it('is scoped to the format and weighs the same archetype more', () => {
    memory.record(decision({ accepted: [1] }));
    expect(memory.preference(1, 'edison', 'Mermail')).toBe(0);
    expect(memory.preference(1, 'hat', 'Mermail')).toBeGreaterThan(memory.preference(1, 'hat', 'Geargia'));
    expect(memory.preference(1, 'hat', 'Geargia')).toBeGreaterThan(0);
  });

  it('forgets old decisions gradually and stays within -3..3', () => {
    const longAgo = new Date(Date.now() - 400 * 86_400_000);
    memory.record(decision({ accepted: [1] }), longAgo);
    expect(memory.preference(1, 'hat', 'Mermail')).toBeLessThan(0.05);
    for (let i = 0; i < 20; i++) memory.record(decision({ chosen: 9 }));
    expect(memory.preference(9, 'hat', 'Mermail')).toBe(3);
  });

  it('counts how often a card was taken and preferred over another', () => {
    memory.record(decision({ chosen: 5, passedOver: [6, 7] }));
    memory.record(decision({ chosen: 5, passedOver: [6] }));
    expect(memory.timesTaken(5, 'hat')).toBe(2);
    expect(memory.timesPreferred(5, 6, 'hat')).toBe(2);
    expect(memory.timesPreferred(5, 7, 'hat')).toBe(1);
    expect(memory.timesPreferred(6, 5, 'hat')).toBe(0);
  });

  it('persists, can be cleared and survives corrupted storage', () => {
    memory.record(decision({ accepted: [1] }));
    TestBed.resetTestingModule();
    expect(TestBed.inject(CompletionMemoryService).count()).toBe(1);
    TestBed.inject(CompletionMemoryService).clear();
    expect(TestBed.inject(CompletionMemoryService).count()).toBe(0);
    localStorage.setItem('ygo-checker-completion-memory-v1', '{oops');
    TestBed.resetTestingModule();
    expect(TestBed.inject(CompletionMemoryService).count()).toBe(0);
  });

  it('validates stored decisions', () => {
    expect(isDecision({ ...decision(), at: new Date().toISOString() })).toBeTrue();
    expect(isDecision({ ...decision(), at: 'nope' })).toBeFalse();
    expect(isDecision({ ...decision({ accepted: ['x' as unknown as number] }), at: new Date().toISOString() })).toBeFalse();
    expect(isDecision(null)).toBeFalse();
  });
});
