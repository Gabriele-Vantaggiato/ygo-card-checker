import { Injectable, signal } from '@angular/core';
import { LineEvidence, ObservedLine } from '../models/duel-line.model';
import { ParsedReplay, ReplayAnalysis, ReplayHistoryEntry } from '../models/replay.model';
import { aggregateLines, openingLine } from '../utils/replay-lines';

const HISTORY_KEY = 'ygo-replay-history-v1';
const MAX_HISTORY = 40;

/** Shared across page-scoped ReplayStore and FlowStore; bounded local evidence, no model training. */
@Injectable({ providedIn: 'root' })
export class ReplayLineMemoryService {
  private readonly rows = signal<ObservedLine[]>(this.load());
  private readonly games = signal<ReplayAnalysis[]>([]);
  private readonly history = signal<ReplayHistoryEntry[]>(this.loadHistory());
  readonly recentGames = this.games.asReadonly();
  /** Browsable, persisted-across-reloads record of past analyses (findings + line comparisons). */
  readonly historyEntries = this.history.asReadonly();
  rememberAnalyses(analyses: readonly ReplayAnalysis[]): void {
    const merged = new Map(this.games().map(a => [a.replay.sha256, a]));
    for (const analysis of analyses) { merged.delete(analysis.replay.sha256); merged.set(analysis.replay.sha256, analysis); }
    this.games.set([...merged.values()].slice(-10));

    const savedAt = new Date().toISOString();
    const historyMerged = new Map(this.history().map(e => [e.sha256, e]));
    for (const analysis of analyses) {
      historyMerged.delete(analysis.replay.sha256);
      historyMerged.set(analysis.replay.sha256, {
        sha256: analysis.replay.sha256,
        fileName: analysis.replay.fileName,
        focusName: analysis.replay.focusName,
        opponentName: analysis.replay.opponentName,
        focusWon: analysis.replay.focusWon,
        turnCount: analysis.replay.turnCount,
        masterRule: analysis.replay.masterRule,
        savedAt,
        stats: analysis.stats,
        findings: analysis.findings,
        lineComparisons: analysis.lineComparisons ?? [],
      });
    }
    this.history.set([...historyMerged.values()].slice(-MAX_HISTORY));
    this.saveHistory();
  }
  private load(): ObservedLine[] {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem('ygo-replay-lines-v1') ?? '[]');
      return Array.isArray(raw) ? raw.slice(-200).filter(isObservedLine) : [];
    } catch { return []; }
  }
  private save(): void {
    try { localStorage.setItem('ygo-replay-lines-v1', JSON.stringify(this.rows())); } catch { /* Session memory remains available. */ }
  }
  private loadHistory(): ReplayHistoryEntry[] {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.slice(-MAX_HISTORY).filter(isReplayHistoryEntry) : [];
    } catch { return []; }
  }
  private saveHistory(): void {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history())); } catch { /* Session memory remains available. */ }
  }
  readonly observations = this.rows.asReadonly();
  record(replays: readonly ParsedReplay[]): void {
    const merged = new Map(this.rows().map(row => [row.replayId, row]));
    for (const replay of replays) {
      const row = openingLine(replay);
      if (row) merged.set(row.replayId, row);
    }
    this.rows.set([...merged.values()].slice(-200));
    this.save();
  }
  clear(): void { this.rows.set([]); this.games.set([]); this.history.set([]); this.save(); this.saveHistory(); }
  evidence(key: string, excludeReplay?: string, masterRule?: number): LineEvidence[] {
    return aggregateLines(this.rows().filter(row => row.deckKey === key && row.replayId !== excludeReplay && (masterRule == null || row.masterRule === masterRule)));
  }
  /** Distinct recorded games for this exact deck (main+extra), independent of any specific opening line. */
  deckStats(key: string): { games: number; wins: number; losses: number; unknown: number } {
    const rows = this.rows().filter(row => row.deckKey === key);
    const ids = new Set(rows.map(row => row.replayId));
    let wins = 0, losses = 0, unknown = 0;
    for (const id of ids) {
      const row = rows.find(r => r.replayId === id)!;
      if (row.won === true) wins++; else if (row.won === false) losses++; else unknown++;
    }
    return { games: ids.size, wins, losses, unknown };
  }
  recommend(key: string, hand: readonly number[], excludeReplay?: string, masterRule?: number, turn?: number): LineEvidence | undefined {
    const handKey = [...hand].sort((a, b) => a - b).join(',');
    const rows = this.rows().filter(row => row.uninterrupted && (turn == null || row.turn === turn) && row.deckKey === key && row.replayId !== excludeReplay && (masterRule == null || row.masterRule === masterRule) && [...row.openingHand].sort((a, b) => a - b).join(',') === handKey);
    return aggregateLines(rows).find(line => line.games >= 3 && line.wins >= 2 && (line.winRate ?? 0) > 0.5 && line.actions.length >= 2);
  }
}

export function isObservedLine(value: unknown): value is ObservedLine {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ObservedLine>;
  const card = (id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id < 0x80000000;
  return typeof v.replayId === 'string' && /^[a-f0-9]{64}$/i.test(v.replayId) &&
    typeof v.deckKey === 'string' && v.deckKey.length <= 2000 && /^[0-9,]+\|[0-9,]*$/.test(v.deckKey) &&
    Number.isInteger(v.masterRule) && Number.isInteger(v.turn) && (v.turn ?? 0) > 0 &&
    typeof v.uninterrupted === 'boolean' && (v.won === true || v.won === false || v.won === null) &&
    Array.isArray(v.openingHand) && v.openingHand.length >= 5 && v.openingHand.length <= 6 && v.openingHand.every(card) &&
    Array.isArray(v.actions) && v.actions.length >= 1 && v.actions.length <= 40 &&
    v.actions.every(a => a && ['normal_summon', 'special_summon', 'activate', 'set'].includes(a.kind) && card(a.cardId));
}

export function isReplayHistoryEntry(value: unknown): value is ReplayHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ReplayHistoryEntry>;
  const str = (s: unknown, max: number) => typeof s === 'string' && s.length <= max;
  return /^[a-f0-9]{64}$/i.test(v.sha256 ?? '') &&
    str(v.fileName, 260) && str(v.focusName, 100) && str(v.opponentName, 100) &&
    (v.focusWon === true || v.focusWon === false || v.focusWon === null) &&
    Number.isInteger(v.turnCount) && Number.isInteger(v.masterRule) &&
    str(v.savedAt, 40) && !!v.stats && typeof v.stats === 'object' &&
    Array.isArray(v.findings) && v.findings.length <= 100 &&
    Array.isArray(v.lineComparisons) && v.lineComparisons.length <= 50;
}
