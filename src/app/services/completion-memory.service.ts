import { Injectable, computed, signal } from '@angular/core';
import type { WaveKind } from '../utils/wave-planner.utils';

const STORAGE_KEY = 'ygo-checker-completion-memory-v1';
const MAX_DECISIONS = 300;
/** Decisions lose weight over time: a choice from months ago counts less than one from yesterday. */
const HALF_LIFE_DAYS = 60;
const SAME_ARCHETYPE_WEIGHT = 1;
const OTHER_ARCHETYPE_WEIGHT = 0.4;

/** What the user did with one wave of the guided completion. */
export interface CompletionDecision {
  at: string;
  formatId: string;
  /** Main archetype of the deck when the wave was decided (null when unknown). */
  archetype: string | null;
  waveKind: WaveKind;
  /** Cards of the wave the user took. */
  accepted: number[];
  /** Cards of the wave the user turned down. */
  rejected: number[];
  /** For a choice between alternatives: the card picked and the ones passed over. */
  chosen: number | null;
  passedOver: number[];
}

/**
 * Local memory of how the user decides during guided completion. It is a preference memory, not model
 * training: cards the user keeps taking rank slightly higher next time in the same format and archetype,
 * cards they keep turning down rank lower, and the log is shown back to the user as an analysis.
 */
@Injectable({ providedIn: 'root' })
export class CompletionMemoryService {
  private readonly state = signal<CompletionDecision[]>(this.read());

  readonly decisions = this.state.asReadonly();
  readonly count = computed(() => this.state().length);

  record(decision: Omit<CompletionDecision, 'at'>, now: Date = new Date()): void {
    this.state.update((all) => [...all, { ...decision, at: now.toISOString() }].slice(-MAX_DECISIONS));
    this.write();
  }

  /** Removes the most recent decision (the user undid the wave it described). */
  removeLast(): void {
    this.state.update((all) => all.slice(0, -1));
    this.write();
  }

  clear(): void {
    this.state.set([]);
    this.write();
  }

  /**
   * Net preference for a card in a format (and, more strongly, a deck archetype): roughly -3..3.
   * Taking a card or picking it from alternatives raises it, turning it down or passing it over lowers it.
   */
  preference(cardId: number, formatId: string, archetype: string | null, now: Date = new Date()): number {
    let net = 0;
    for (const d of this.state()) {
      if (d.formatId !== formatId) continue;
      const ageDays = Math.max(0, (now.getTime() - Date.parse(d.at)) / 86_400_000);
      const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      const scope = d.archetype === archetype ? SAME_ARCHETYPE_WEIGHT : OTHER_ARCHETYPE_WEIGHT;
      const w = decay * scope;
      if (d.accepted.includes(cardId)) net += w;
      if (d.chosen === cardId) net += 2 * w;
      if (d.rejected.includes(cardId)) net -= w;
      if (d.passedOver.includes(cardId)) net -= w;
    }
    return Math.max(-3, Math.min(3, net));
  }

  /** How often the user took a card (accepted or chosen) in this format. */
  timesTaken(cardId: number, formatId: string): number {
    return this.state().filter((d) => d.formatId === formatId && (d.accepted.includes(cardId) || d.chosen === cardId)).length;
  }

  /** Past choices where `cardId` was picked over `other`, for "you chose X over Y before" notes. */
  timesPreferred(cardId: number, other: number, formatId: string): number {
    return this.state().filter((d) => d.formatId === formatId && d.chosen === cardId && d.passedOver.includes(other)).length;
  }

  private read(): CompletionDecision[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isDecision).slice(-MAX_DECISIONS);
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      // private mode: the memory just lasts for the session
    }
  }
}

function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 200 && value.every((id) => Number.isSafeInteger(id) && (id as number) > 0);
}

export function isDecision(value: unknown): value is CompletionDecision {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<CompletionDecision>;
  return (
    typeof v.at === 'string' &&
    !Number.isNaN(Date.parse(v.at)) &&
    typeof v.formatId === 'string' &&
    (v.archetype === null || typeof v.archetype === 'string') &&
    typeof v.waveKind === 'string' &&
    isIdList(v.accepted) &&
    isIdList(v.rejected) &&
    (v.chosen === null || (typeof v.chosen === 'number' && Number.isSafeInteger(v.chosen))) &&
    isIdList(v.passedOver)
  );
}
