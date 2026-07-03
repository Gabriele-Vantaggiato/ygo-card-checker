export type DeckSectionKey = 'main' | 'extra' | 'side';

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
