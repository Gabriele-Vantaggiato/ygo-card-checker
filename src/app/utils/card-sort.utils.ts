import { LegalityResult, YgoCard } from '../models/ygo-card.model';
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
