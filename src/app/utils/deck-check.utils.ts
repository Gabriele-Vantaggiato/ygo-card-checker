import { DecklistCard, maxCopiesForStatus } from '../models/decklist.model';
import { LegalityVerdict } from '../models/ygo-card.model';
import { BanlistStatus } from '../models/ygo-format.model';
import { splitDeckSections } from './deck-card.utils';

export type DeckIssueKind = 'not-legal' | 'forbidden' | 'over-limit' | 'main-size' | 'extra-size' | 'side-size';

export interface DeckIssue {
  kind: DeckIssueKind;
  /** Card involved, for card-level issues. */
  cardId?: number;
  cardName?: string;
  /** Copies in the deck / allowed copies (over-limit) or section size / bound (size issues). */
  found?: number;
  allowed?: number;
}

/** Legality of one card in the format being checked. */
export interface CardCheck {
  banlistStatus: BanlistStatus;
  verdict: LegalityVerdict;
}

export const MIN_MAIN = 40;
export const MAX_MAIN = 60;
export const MAX_EXTRA = 15;
export const MAX_SIDE = 15;

function totalCopies(cards: readonly DecklistCard[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

/**
 * Format-rule problems of a deck: cards outside the card pool, banned cards, copies above the banlist
 * limit (counted across main/extra/side together) and section sizes.
 * Cards missing from `checks` are skipped, since their legality is unknown.
 */
export function checkDeck(cards: readonly DecklistCard[], checks: ReadonlyMap<number, CardCheck>): DeckIssue[] {
  const issues: DeckIssue[] = [];
  const copies = new Map<number, { name: string; qty: number }>();
  for (const card of cards) {
    const entry = copies.get(card.id) ?? { name: card.name, qty: 0 };
    entry.qty += card.quantity;
    copies.set(card.id, entry);
  }

  for (const [cardId, { name, qty }] of copies) {
    const check = checks.get(cardId);
    if (!check) continue;
    if (check.banlistStatus === 'Forbidden') {
      issues.push({ kind: 'forbidden', cardId, cardName: name });
      continue;
    }
    if (check.verdict === 'not-legal') {
      issues.push({ kind: 'not-legal', cardId, cardName: name });
    }
    const allowed = maxCopiesForStatus(check.banlistStatus);
    if (qty > allowed) {
      issues.push({ kind: 'over-limit', cardId, cardName: name, found: qty, allowed });
    }
  }

  const sections = splitDeckSections(cards);
  const main = totalCopies(sections.main);
  const extra = totalCopies(sections.extra);
  const side = totalCopies(sections.side);
  if (cards.length > 0 && main < MIN_MAIN) issues.push({ kind: 'main-size', found: main, allowed: MIN_MAIN });
  if (main > MAX_MAIN) issues.push({ kind: 'main-size', found: main, allowed: MAX_MAIN });
  if (extra > MAX_EXTRA) issues.push({ kind: 'extra-size', found: extra, allowed: MAX_EXTRA });
  if (side > MAX_SIDE) issues.push({ kind: 'side-size', found: side, allowed: MAX_SIDE });
  return issues;
}
