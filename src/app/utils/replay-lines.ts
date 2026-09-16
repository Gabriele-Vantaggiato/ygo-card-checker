import { DuelLineAction, LineComparison, LineEvidence, ObservedLine } from '../models/duel-line.model';
import { ParsedReplay, ReplayDeckSection, ReplayEvent } from '../models/replay.model';
import { RestrictionTrace } from '../models/replay-restriction.model';

export function deckKey(deck: Pick<ReplayDeckSection, 'main' | 'extra'>): string {
  return [deck.main, deck.extra].map(ids => [...ids].sort((a, b) => a - b).join(',')).join('|');
}
export function actionKey(action: DuelLineAction): string { return `${action.kind}:${action.cardId}`; }
export function lineKey(actions: readonly DuelLineAction[]): string { return actions.map(actionKey).join('/'); }
export function replayAction(event: ReplayEvent): DuelLineAction | null {
  const kinds: Partial<Record<ReplayEvent['kind'], DuelLineAction['kind']>> = { summon: 'normal_summon', sp_summon: 'special_summon', chain: 'activate', set: 'set' };
  const kind = kinds[event.kind];
  return kind && event.code && event.code > 0 ? { kind, cardId: event.code } : null;
}
/** Only the first own turn: later hands cannot be reconstructed from this lossy log. */
export function openingLine(replay: ParsedReplay): ObservedLine | null {
  if (!replay.decks || ![0, 1].includes(replay.focusController)) return null;
  const start = replay.events.findIndex(e => e.kind === 'new_turn' && e.controller === replay.focusController);
  if (start < 0) return null;
  const turn = replay.events[start].turn ?? 0;
  let end = replay.events.findIndex((e, i) => i > start && e.kind === 'new_turn');
  if (end < 0) end = replay.events.length;
  const firstAction = replay.events.findIndex((e, i) => i >= start && i < end && e.controller === replay.focusController && replayAction(e));
  if (firstAction < 0) return null;
  const draws = replay.events.slice(0, firstAction).filter(e => e.kind === 'draw' && e.controller === replay.focusController);
  const hand = draws.flatMap(e => e.cards ?? []);
  // No opening hand guesses from the full deck or cards revealed after a decision.
  if (hand.length < 5 || hand.length > 6 || hand.some(id => id <= 0) || draws.some(e => !e.cards || (e.value != null && e.value !== e.cards.length))) return null;
  if (replay.events.slice(0, start).some(e => e.controller === replay.focusController && replayAction(e))) return null;
  const actions = replay.events.slice(start, end).filter(e => e.controller === replay.focusController).map(replayAction).filter((a): a is DuelLineAction => a !== null);
  if (replay.events.slice(start, end).some(e => ['summon', 'sp_summon', 'chain', 'set'].includes(e.kind) && (e.controller == null || !e.code))) return null;
  const available = new Set([...replay.decks.focus.main, ...replay.decks.focus.extra]);
  if (actions.some(action => !available.has(action.cardId))) return null;
  if (!actions.length || actions.length > 40 || !hand.includes(actions[0].cardId)) return null;
  return { replayId: replay.sha256, deckKey: deckKey(replay.decks.focus), masterRule: replay.masterRule, turn, openingHand: hand, actions, won: replay.focusWon, uninterrupted: !replay.events.slice(start, end).some(e => e.controller != null && e.controller !== replay.focusController && replayAction(e)) };
}
export function aggregateLines(rows: readonly ObservedLine[]): LineEvidence[] {
  const groups = new Map<string, Map<string, ObservedLine>>();
  for (const row of rows) {
    const key = lineKey(row.actions);
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key)!.set(row.replayId, row);
  }
  return [...groups.values()].map(group => {
    const values = [...group.values()];
    const wins = values.filter(r => r.won === true).length;
    const losses = values.filter(r => r.won === false).length;
    return { actions: values[0].actions, games: values.length, wins, losses, unknownResults: values.length - wins - losses, winRate: wins + losses ? (wins + 1) / (wins + losses + 2) : null };
  }).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.games - a.games || lineKey(a.actions).localeCompare(lineKey(b.actions)));
}
/** Compare an ordered subsequence, retaining repetitions (summon + activate is two actions). */
export function compareLine(replay: ParsedReplay, observed: ObservedLine, recommended: readonly DuelLineAction[], trace?: RestrictionTrace, evidenceGames = 0): LineComparison {
  let next = 0;
  for (const action of observed.actions) if (next < recommended.length && actionKey(action) === actionKey(recommended[next])) next++;
  const missing = recommended.slice(next);
  const interrupted = replay.events.some(e => e.turn === observed.turn && e.controller !== replay.focusController && e.controller != null && ['chain', 'summon', 'sp_summon', 'set'].includes(e.kind));
  // Trace stores historical locks, not exact decision snapshots: conservatively abstain.
  const locks = trace?.focusLocksSeen.some(lock => lock.appliedTurn <= observed.turn) ?? false;
  const reason = !recommended.length ? 'no_comparable_line' : locks ? 'restriction_context' : interrupted ? 'opponent_interaction' : !missing.length ? 'ordered_actions_match' : 'different_observed_sequence';
  return { turn: observed.turn, status: !recommended.length || locks || interrupted ? 'inconclusive' : missing.length ? 'deviation' : 'matched', reason, played: observed.actions, recommended: [...recommended], missing, evidenceGames, provenMisplay: false };
}
