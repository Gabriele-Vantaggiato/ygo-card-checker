import { ComboSheetGuide } from '../../combo-sheets/combo-sheet.model';
import { YdkeSections, parseYdkeUrl } from '../../../services/ydke.service';

export type CoachAction = 'normal-summon' | 'special-summon' | 'activate' | 'set' | 'send' | 'banish' | 'search' | 'draw' | 'return' | 'discard' | 'instruction';
export interface CoachMove { cardId: number; action: CoachAction; label: string; detail: string; zone?: string; stage?: number; unordered?: boolean; }
export interface CoachRoute { id: string; title: string; guide: ComboSheetGuide; deckTargets?: Record<string, number>; source: string; }
export interface CoachRun {
  id: string; startedAt: string; endedAt: string; ydke: string; deckName: string;
  opening: number[]; route: CoachRoute | null; moves: CoachMove[];
  outcome: 'success' | 'failed' | 'unknown'; source: 'confirmed' | 'replay' | 'mdpro';
  captureId?: string;
  goalObserved?: boolean;
  replayId?: string; interrupted: boolean; masterRule?: number; turn?: number;
}
export const COACH_ACTIONS: readonly CoachAction[] = ['normal-summon', 'special-summon', 'activate', 'set', 'send', 'banish', 'search', 'draw', 'return', 'discard', 'instruction'];
export const ACTION_LABELS: Record<CoachAction, string> = {
  'normal-summon': 'Evoca Normalmente', 'special-summon': 'Evoca Specialmente', activate: 'Attiva',
  set: 'Posiziona', send: 'Manda al Cimitero', banish: 'Bandisci', search: 'Aggiungi alla mano', draw: 'Pesca', return: 'Metti in cima al Deck', discard: 'Scarta', instruction: 'Passo della guida',
};
export function quantities<T extends string | number>(ids: readonly T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
  return map;
}
export function sameDeck(a: YdkeSections, b: YdkeSections): boolean {
  return (['main', 'extra', 'side'] as const).every(key => [...a[key]].sort((x,y) => x-y).join(',') === [...b[key]].sort((x,y) => x-y).join(','));
}
export function validDeck(input: string): YdkeSections {
  if (input.length > 2000 || !/^ydke:\/\/[A-Za-z0-9+/=_-]*![A-Za-z0-9+/=_-]*![A-Za-z0-9+/=_-]*!$/i.test(input.trim())) throw new Error('YDKE non valido.');
  const parts = input.trim().slice(7).split('!').slice(0,3);
  for (const part of parts) if (atob(part.replace(/-/g,'+').replace(/_/g,'/')).length % 4) throw new Error('YDKE troncato.');
  const deck = parseYdkeUrl(input);
  if (!deck.main.length || deck.main.length > 60 || deck.extra.length > 15 || deck.side.length > 15 ||
      [...deck.main,...deck.extra,...deck.side].some(id => !Number.isSafeInteger(id) || id <= 0 || id > 999999999)) throw new Error('Quantità o passcode non validi.');
  return deck;
}
/** Explicit diagram actions only. Explanatory prose is never parsed into fictional engine events. */
export function routeMoves(route: CoachRoute): CoachMove[] {
  return route.guide.steps.flatMap<CoachMove>((step,stage) => {
    const unordered = step.kind === 'summon' && (step.flow ?? []).some(c => ['send','banish'].includes(c.action));
    const moves = (step.flow ?? []).filter(c => (c.card > 0 || ['return','discard'].includes(c.action)) && COACH_ACTIONS.includes(c.action as CoachAction)).map(c => ({
      cardId: c.card, action: c.action as CoachAction, label: c.caption || step.title, detail: step.text, zone: c.zone, stage, unordered,
    }));
    return moves.length ? moves : [{ cardId: step.cards.find(Boolean) ?? 0, action: 'instruction' as const, label: step.title, detail: step.text }];
  }).filter(move => move.cardId > 0 || ['return','discard'].includes(move.action));
}
export function routeFitsDeck(guide: ComboSheetGuide, deck: YdkeSections): boolean {
  const main = quantities(deck.main), all = quantities([...deck.main,...deck.extra]);
  const referenced = [...guide.startingCards,...guide.requiredCards,...guide.endCards,
    ...(guide.startFlow ?? []).map(c => c.card),...(guide.endFlow ?? []).map(c => c.card),
    ...guide.steps.flatMap(s => [...s.cards,...(s.flow ?? []).map(c => c.card)])];
  return referenced.every(id => !id || all.has(id)) &&
    [...quantities(guide.startingCards.filter(Boolean))].every(([id,n]) => (main.get(id) ?? 0) >= n) &&
    [...quantities(guide.requiredCards.filter(Boolean))].every(([id,n]) => (all.get(id) ?? 0) >= n);
}
export function eligibleWithHand(route: CoachRoute, hand: readonly number[], deck: YdkeSections): boolean {
  const have = quantities(hand), main = quantities(deck.main);
  const named = route.guide.startingCards.filter(Boolean);
  if ([...quantities(named)].some(([id,n]) => (have.get(id) ?? 0) < n)) return false;
  if (hand.length < named.length + route.guide.startingCards.filter(id => !id).length) return false;
  return Object.entries(route.deckTargets ?? {}).every(([id,n]) => (main.get(+id) ?? 0) - (have.get(+id) ?? 0) >= n);
}
export function compareMoves(expected: readonly CoachMove[], played: readonly CoachMove[]): { matched: number; nextIndex: number; status: 'following' | 'complete' | 'deviation' } {
  const consumed = new Set<number>(); let nextIndex = 0;
  const matches = (want: CoachMove,move: CoachMove) => want.action === move.action && (want.cardId === move.cardId || want.cardId === 0 && ['return','discard'].includes(want.action) && move.cardId > 0);
  for (const move of played) {
    while (consumed.has(nextIndex)) nextIndex++;
    const next = expected[nextIndex];
    let candidate = nextIndex;
    if (next?.unordered) {
      candidate = expected.findIndex((wanted,index) => index >= nextIndex && wanted.stage === next.stage && !consumed.has(index) && matches(wanted,move));
    }
    if (!expected[candidate] || !matches(expected[candidate],move)) return { matched: consumed.size,nextIndex,status: 'deviation' };
    consumed.add(candidate);
  }
  while (consumed.has(nextIndex)) nextIndex++;
  return { matched: consumed.size,nextIndex,status: consumed.size === expected.length && expected.length > 0 ? 'complete' : 'following' };
}
