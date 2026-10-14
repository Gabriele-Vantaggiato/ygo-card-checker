import { DecklistCard } from '../models/decklist.model';
import { isExtraDeckType, resolveDeckSection } from '../services/ydke.service';
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
  const side: DecklistCard[] = [];

  for (const card of cards) {
    const section = resolveDeckSection(card);
    if (section === 'extra') {
      extra.push(card);
    } else if (section === 'side') {
      side.push(card);
    } else {
      main.push(card);
    }
  }

  return { main, extra, side };
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

/** Expand one section into an ordered passcode list (one id per copy). */
export function expandSectionPasscodes(
  cards: readonly DecklistCard[],
  section: DeckSectionView['key'],
): number[] {
  return cards
    .filter((card) => resolveDeckSection(card) === section)
    .flatMap((card) => Array.from({ length: card.quantity }, () => card.id));
}

/** Collapse consecutive identical passcodes back into quantity rows. */
export function collapsePasscodesToCards(
  passcodes: readonly number[],
  templates: ReadonlyMap<number, DecklistCard>,
  section: DeckSectionView['key'],
): DecklistCard[] {
  const out: DecklistCard[] = [];
  for (const id of passcodes) {
    const last = out[out.length - 1];
    if (last?.id === id) {
      out[out.length - 1] = { ...last, quantity: last.quantity + 1 };
      continue;
    }
    const template = templates.get(id);
    if (!template) {
      continue;
    }
    out.push({ ...template, quantity: 1, section });
  }
  return out;
}

/**
 * Reorder a copy within a section, or move it between Main/Extra/Side at a drop index.
 * Preserves manual order (no auto-sort).
 */
export function applyDeckCopyDrop(
  cards: readonly DecklistCard[],
  from: DeckSectionView['key'],
  to: DeckSectionView['key'],
  previousIndex: number,
  currentIndex: number,
): DecklistCard[] {
  const templates = new Map(cards.map((card) => [card.id, card]));
  const sections: Record<DeckSectionView['key'], number[]> = {
    main: expandSectionPasscodes(cards, 'main'),
    extra: expandSectionPasscodes(cards, 'extra'),
    side: expandSectionPasscodes(cards, 'side'),
  };

  if (previousIndex < 0 || previousIndex >= sections[from].length) {
    return cards as DecklistCard[];
  }

  if (from === to && previousIndex === currentIndex) {
    return cards as DecklistCard[];
  }

  const nextFrom = [...sections[from]];
  const [movingId] = nextFrom.splice(previousIndex, 1);
  if (movingId == null) {
    return cards as DecklistCard[];
  }
  sections[from] = nextFrom;

  if (from === to) {
    const next = nextFrom;
    const insertAt = Math.max(0, Math.min(currentIndex, next.length));
    next.splice(insertAt, 0, movingId);
    sections[from] = next;
  } else {
    const nextTo = [...sections[to]];
    const insertAt = Math.max(0, Math.min(currentIndex, nextTo.length));
    nextTo.splice(insertAt, 0, movingId);
    sections[to] = nextTo;
  }

  return [
    ...collapsePasscodesToCards(sections.main, templates, 'main'),
    ...collapsePasscodesToCards(sections.extra, templates, 'extra'),
    ...collapsePasscodesToCards(sections.side, templates, 'side'),
  ];
}
