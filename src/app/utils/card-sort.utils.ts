import { LegalityResult, YgoCard } from '../models/ygo-card.model';
import { DecklistCard } from '../models/decklist.model';
import { comparePlayability } from './legality-display.utils';

export function sortYgoCardsByPlayability(
  cards: readonly YgoCard[],
  legality: ReadonlyMap<number, LegalityResult>,
): YgoCard[] {
  return [...cards].sort((a, b) => {
    const playability = comparePlayability(
      legality.get(a.id)?.verdict,
      legality.get(b.id)?.verdict,
    );
    if (playability !== 0) {
      return playability;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function sortDecklistCardsByPlayability(cards: readonly DecklistCard[]): DecklistCard[] {
  return [...cards].sort((a, b) => {
    const playability = comparePlayability(a.legalityVerdict, b.legalityVerdict);
    if (playability !== 0) {
      return playability;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
