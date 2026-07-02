import { DecklistCard } from '../models/decklist.model';
import { isExtraDeckType } from '../services/ydke.service';
import { verdictPlayabilityRank } from './legality-display.utils';

export interface DeckTypeStats {
  monsters: number;
  spells: number;
  traps: number;
}

export interface DeckSectionView {
  key: 'main' | 'extra' | 'side';
  cards: DecklistCard[];
}

export function isSpellCard(type: string): boolean {
  return /Spell/i.test(type);
}

export function isTrapCard(type: string): boolean {
  return /Trap/i.test(type);
}

export function isMainDeckMonster(type: string): boolean {
  return /Monster/i.test(type) && !isExtraDeckType(type);
}

export function splitDeckSections(cards: readonly DecklistCard[]): {
  main: DecklistCard[];
  extra: DecklistCard[];
  side: DecklistCard[];
} {
  const main: DecklistCard[] = [];
  const extra: DecklistCard[] = [];

  for (const card of cards) {
    if (isExtraDeckType(card.type)) {
      extra.push(card);
    } else {
      main.push(card);
    }
  }

  return { main, extra, side: [] };
}

export function computeTypeStats(cards: readonly DecklistCard[]): DeckTypeStats {
  return cards.reduce(
    (acc, card) => {
      const qty = card.quantity;
      if (isSpellCard(card.type)) {
        acc.spells += qty;
      } else if (isTrapCard(card.type)) {
        acc.traps += qty;
      } else {
        acc.monsters += qty;
      }
      return acc;
    },
    { monsters: 0, spells: 0, traps: 0 },
  );
}

export function sectionCardCount(cards: readonly DecklistCard[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

export function expandCardsForGrid(cards: readonly DecklistCard[]): DecklistCard[] {
  return cards.flatMap((card) => Array.from({ length: card.quantity }, () => card));
}

const TYPE_SORT_RANK = (type: string): number => {
  if (isExtraDeckType(type)) {
    return 0;
  }
  if (isMainDeckMonster(type)) {
    return 1;
  }
  if (isSpellCard(type)) {
    return 2;
  }
  if (isTrapCard(type)) {
    return 3;
  }
  return 4;
};

export function sortDeckCards(cards: readonly DecklistCard[]): DecklistCard[] {
  return [...cards].sort((a, b) => {
    const playability =
      verdictPlayabilityRank(a.legalityVerdict) - verdictPlayabilityRank(b.legalityVerdict);
    if (playability !== 0) {
      return playability;
    }

    const rank = TYPE_SORT_RANK(a.type) - TYPE_SORT_RANK(b.type);
    if (rank !== 0) {
      return rank;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function deckSections(deckCards: readonly DecklistCard[]): DeckSectionView[] {
  const { main, extra, side } = splitDeckSections(deckCards);
  return [
    { key: 'main', cards: main },
    { key: 'extra', cards: extra },
    { key: 'side', cards: side },
  ];
}
