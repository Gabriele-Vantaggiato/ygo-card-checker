import { Decklist, DecklistCard } from '../../models/decklist.model';
import { splitDeckSections } from '../../utils/deck-card.utils';

/** First grapheme of a deck name, uppercased — used as avatar fallback. */
export function deckInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : '?';
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Stable accent hue (OKLCH) per deck — used when the deck has no cards yet. */
export function deckAccentHue(deckId: string): number {
  const spread = [265, 285, 305, 55, 75, 95, 145, 200, 240];
  return spread[hashString(deckId) % spread.length]!;
}

export function deckAccentStyle(deckId: string): string {
  const hue = deckAccentHue(deckId);
  return `linear-gradient(145deg, oklch(28% 0.06 ${hue}) 0%, oklch(18% 0.04 265) 55%, oklch(22% 0.08 ${hue + 20}) 100%)`;
}

/** Cover card for deck tiles: first Extra Deck card, then Main — never Side. */
export function deckCoverCard(deck: Decklist): DecklistCard | null {
  const { extra, main } = splitDeckSections(deck.cards);
  return extra.find((card) => card.imageUrlSmall) ?? main.find((card) => card.imageUrlSmall) ?? null;
}

export function deckCoverImage(deck: Decklist): string | null {
  return deckCoverCard(deck)?.imageUrlSmall ?? null;
}

/** @deprecated Use deckCoverCard — kept for callers migrating from preview fan. */
export function deckLeadCard(deck: Decklist): DecklistCard | null {
  return deckCoverCard(deck);
}

export function deckLeadImage(deck: Decklist): string | null {
  return deckCoverImage(deck);
}
