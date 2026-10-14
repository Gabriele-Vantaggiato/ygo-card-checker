import { TestBed } from '@angular/core/testing';
import { ReplayHistoryEntry } from '../models/replay.model';
import { ReplayLineMemoryService, isReplayHistoryEntry, opponentCardCodes } from './replay-line-memory.service';

const HISTORY_KEY = 'ygo-replay-history-v1';

const entry = (n: number, opponentCards?: number[]): ReplayHistoryEntry => ({
  sha256: n.toString(16).padStart(64, '0'),
  fileName: `r${n}.yrp3d`,
  focusName: 'me',
  opponentName: 'rival',
  focusWon: true,
  turnCount: 5,
  masterRule: 5,
  savedAt: '2026-01-01T00:00:00.000Z',
  stats: {} as ReplayHistoryEntry['stats'],
  findings: [],
  lineComparisons: [],
  ...(opponentCards ? { opponentCards } : {}),
});

describe('opponent cards history', () => {
  describe('opponentCardCodes', () => {
    it('merges main, extra and side without duplicates and drops invalid codes', () => {
      const decks = { focus: { main: [], extra: [], side: [] }, opponent: { main: [1, 1, 2, -5, 0], extra: [3], side: [2, 4.5] } };
      expect(opponentCardCodes(decks)).toEqual([1, 2, 3]);
    });

    it('is empty when the replay has no deck data', () => {
      expect(opponentCardCodes(null)).toEqual([]);
    });
  });

  describe('ReplayLineMemoryService', () => {
    beforeEach(() => {
      localStorage.clear();
      TestBed.resetTestingModule();
    });

    it('counts each card once per game, most frequent first', () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify([entry(1, [10, 11]), entry(2, [10, 12]), entry(3, [10]), entry(4)]));
      const service = TestBed.inject(ReplayLineMemoryService);
      expect(service.opponentCardStats()).toEqual([
        { cardId: 10, games: 3 },
        { cardId: 11, games: 1 },
        { cardId: 12, games: 1 },
      ]);
      expect(service.opponentGamesRecorded()).toBe(3);
      expect(service.opponentCardStats(1).length).toBe(1);
    });

    it('still loads history saved before opponent cards existed', () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify([entry(1)]));
      const service = TestBed.inject(ReplayLineMemoryService);
      expect(service.historyEntries().length).toBe(1);
      expect(service.opponentCardStats()).toEqual([]);
    });
  });

  it('rejects history entries with malformed opponent cards', () => {
    expect(isReplayHistoryEntry(entry(1, [1, 2]))).toBeTrue();
    expect(isReplayHistoryEntry({ ...entry(1), opponentCards: ['x'] })).toBeFalse();
    expect(isReplayHistoryEntry({ ...entry(1), opponentCards: new Array(81).fill(5) })).toBeFalse();
  });
});
