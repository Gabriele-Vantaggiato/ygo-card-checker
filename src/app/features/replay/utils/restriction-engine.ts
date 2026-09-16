import {
  ActiveRestriction,
  RestrictionAnnotation,
  RestrictionCatalog,
  RestrictionEffect,
  RestrictionTrace,
} from '../../../models/replay-restriction.model';
import { ParsedReplay, ReplayEvent } from '../../../models/replay.model';

function affectsController(effect: RestrictionEffect, sourceController: number, target: number): boolean {
  if (effect.scope === 'both') return true;
  if (effect.scope === 'controller') return target === sourceController;
  return target !== sourceController;
}

function clearEndOfTurnLocks(locks: ActiveRestriction[], endingTurnPlayer: number): ActiveRestriction[] {
  return locks.filter((lock) => {
    if (lock.until !== 'end_of_turn') return true;
    // Duality-style: lock lasts for the turn of the controller who activated it.
    return !(lock.controller === endingTurnPlayer);
  });
}

function hasSsLock(locks: ActiveRestriction[], controller: number): ActiveRestriction | undefined {
  return locks.find(
    (l) =>
      (l.kind === 'cannot_special_summon' ||
        l.kind === 'cannot_special_summon_from_hand' ||
        l.kind === 'cannot_special_summon_from_extra' ||
        l.kind === 'cannot_special_summon_from_deck' ||
        l.kind === 'cannot_special_summon_from_gy') &&
      affectsController(l, l.controller, controller),
  );
}

/**
 * Walk the duel timeline and apply restriction catalog locks.
 * This is intentionally conservative: unknown cards do not invent locks.
 */
export function buildRestrictionTrace(
  replay: ParsedReplay,
  catalog: RestrictionCatalog,
  resolveName: (code: number) => string,
): RestrictionTrace {
  const annotations: RestrictionAnnotation[] = [];
  const timelineNotes: string[] = [];
  const focusLocksSeen: ActiveRestriction[] = [];
  const seenLockKeys = new Set<string>();

  let locks: ActiveRestriction[] = [];
  let turn = 0;
  let turnPlayer: number | null = null;
  const ssThisTurn = new Set<number>();
  const nsThisTurn = new Set<number>();

  const note = (line: string) => {
    timelineNotes.push(line);
  };

  const rememberFocusLock = (lock: ActiveRestriction) => {
    if (!affectsController(lock, lock.controller, replay.focusController)) return;
    const key = `${lock.kind}:${lock.sourceCode}:${lock.appliedTurn}`;
    if (seenLockKeys.has(key)) return;
    seenLockKeys.add(key);
    focusLocksSeen.push(lock);
  };

  for (const event of replay.events) {
    turn = event.turn ?? turn;

    if (event.kind === 'new_turn') {
      // End previous turn player's end_of_turn locks when a new turn starts.
      if (turnPlayer !== null) {
        const before = locks.length;
        locks = clearEndOfTurnLocks(locks, turnPlayer);
        if (locks.length < before) {
          annotations.push({
            kind: 'lock_cleared',
            turn,
            message: `End-of-turn locks cleared for player ${turnPlayer} at start of turn ${turn}.`,
          });
        }
      }
      turnPlayer = typeof event.controller === 'number' ? event.controller : turnPlayer;
      ssThisTurn.clear();
      nsThisTurn.clear();
      continue;
    }

    if (event.kind === 'sp_summon' && typeof event.controller === 'number') {
      ssThisTurn.add(event.controller);
      const lock = hasSsLock(locks, event.controller);
      if (lock && event.controller === replay.focusController) {
        annotations.push({
          kind: 'illegal_under_lock',
          turn,
          code: event.code,
          message: `Special Summon of ${resolveName(event.code ?? 0)} while lock ${lock.kind} from ${lock.sourceName} was active (engine still resolved — verify replay/client).`,
          relatedKinds: [lock.kind],
        });
      }
    }

    if (event.kind === 'summon' && typeof event.controller === 'number') {
      nsThisTurn.add(event.controller);
    }

    if (event.kind === 'chain' && event.code && typeof event.controller === 'number') {
      const entry = catalog.cards[String(event.code)];
      if (!entry) continue;

      if (entry.blockedIf?.includes('special_summoned_this_turn') && ssThisTurn.has(event.controller)) {
        note(
          `T${turn}: ${entry.name} activated while controller had already Special Summoned (text usually forbids this — flag for review).`,
        );
      }

      for (const effect of entry.onActivate ?? []) {
        const lock: ActiveRestriction = {
          kind: effect.kind,
          sourceCode: event.code,
          sourceName: entry.name,
          controller: event.controller,
          scope: effect.scope,
          until: effect.until,
          appliedTurn: turn,
          note: effect.note ?? entry.summary,
        };
        locks = [...locks, lock];
        rememberFocusLock(lock);
        annotations.push({
          kind: 'lock_applied',
          turn,
          code: event.code,
          message: `T${turn}: ${entry.name} applied ${effect.kind} (${effect.scope}, until ${effect.until}).`,
          relatedKinds: [effect.kind],
        });
        note(
          `T${turn}: LOCK ${effect.kind} via ${entry.name}` +
            (effect.note ? ` — ${effect.note}` : ''),
        );
      }
    }

    if (event.kind === 'missed_effect' && event.code && typeof event.controller === 'number') {
      const name = resolveName(event.code);
      const lock = hasSsLock(locks, event.controller);
      if (lock && event.controller === replay.focusController) {
        const msg = `T${turn}: Engine timing flag on ${name}, but Special Summon was illegal under ${lock.sourceName} (${lock.kind}). Not a missplay.`;
        annotations.push({
          kind: 'engine_flag_explained',
          turn,
          code: event.code,
          message: msg,
          relatedKinds: [lock.kind],
        });
        note(msg);
      } else if (event.controller === replay.focusController) {
        const msg = `T${turn}: Engine timing flag on ${name} (missed timing / window closed). Treat as information, not automatic missplay.`;
        annotations.push({
          kind: 'engine_flag_explained',
          turn,
          code: event.code,
          message: msg,
        });
        note(msg);
      }
    }
  }

  return {
    annotations,
    focusLocksSeen,
    timelineNotes,
  };
}

export function summarizeLocksForBrief(trace: RestrictionTrace): string[] {
  return trace.focusLocksSeen.map(
    (l) =>
      `T${l.appliedTurn}: ${l.sourceName} → ${l.kind} (${l.until})` +
      (l.note ? ` — ${l.note}` : ''),
  );
}

/** Compact human timeline of focus player's key actions for Gemini. */
export function buildFocusActionTimeline(
  replay: ParsedReplay,
  resolveName: (code: number) => string,
  maxLines = 80,
): string[] {
  const focus = replay.focusController;
  const lines: string[] = [];
  for (const e of replay.events) {
    if (lines.length >= maxLines) break;
    const turn = e.turn ?? '?';
    if (e.kind === 'new_turn' && e.controller === focus) {
      lines.push(`T${turn}: --- your turn ---`);
      continue;
    }
    if (e.controller !== focus && e.kind !== 'damage') continue;
    switch (e.kind) {
      case 'chain':
        lines.push(`T${turn}: activate ${resolveName(e.code ?? 0)}`);
        break;
      case 'summon':
        lines.push(`T${turn}: Normal Summon ${resolveName(e.code ?? 0)}`);
        break;
      case 'sp_summon':
        lines.push(`T${turn}: Special Summon ${resolveName(e.code ?? 0)}`);
        break;
      case 'set':
        lines.push(`T${turn}: Set a card`);
        break;
      case 'attack':
        lines.push(`T${turn}: declared attack`);
        break;
      default:
        break;
    }
  }
  return lines;
}

export function emptyCatalog(): RestrictionCatalog {
  return {
    version: 0,
    coverageNote: '',
    kinds: [],
    cards: {},
  };
}
