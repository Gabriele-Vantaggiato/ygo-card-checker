import { isExtraDeckType } from '../services/ydke.service';

export type DeckSectionKey = 'main' | 'extra' | 'side';

export const DECK_SECTION_KEYS: readonly DeckSectionKey[] = ['main', 'extra', 'side'] as const;

export const DECK_SECTION_I18N_KEYS: Record<DeckSectionKey, { title: string; empty: string }> = {
  main: {
    title: 'decklist.editor.main',
    empty: 'decklist.editor.emptyMain',
  },
  extra: {
    title: 'decklist.editor.extra',
    empty: 'decklist.editor.emptyExtra',
  },
  side: {
    title: 'decklist.editor.side',
    empty: 'decklist.editor.emptySide',
  },
};

/** Extra Deck monsters cannot sit in Main; Main/Spell/Trap cannot sit in Extra. Side accepts all. */
export function canPlaceCardInSection(cardType: string, section: DeckSectionKey): boolean {
  const isExtra = isExtraDeckType(cardType);
  if (section === 'extra') {
    return isExtra;
  }
  if (section === 'main') {
    return !isExtra;
  }
  return true;
}
