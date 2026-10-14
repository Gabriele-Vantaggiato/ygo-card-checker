import { DecklistCard } from '../models/decklist.model';
import {
  applyDeckCopyDrop,
  collapsePasscodesToCards,
  expandSectionPasscodes,
} from './deck-card.utils';

function card(
  id: number,
  name: string,
  quantity: number,
  section: DecklistCard['section'],
  type = 'Effect Monster',
): DecklistCard {
  return { id, name, type, imageUrlSmall: null, quantity, section };
}

describe('deck copy drag-and-drop helpers', () => {
  const ash = card(1, 'Ash', 3, 'main');
  const veiler = card(2, 'Veiler', 1, 'main');
  const maxx = card(3, 'Maxx C', 1, 'side');

  it('expands a section into one passcode per copy', () => {
    expect(expandSectionPasscodes([ash, veiler, maxx], 'main')).toEqual([1, 1, 1, 2]);
  });

  it('collapses consecutive passcodes into quantity rows', () => {
    const templates = new Map<number, DecklistCard>([
      [1, ash],
      [2, veiler],
    ]);
    expect(collapsePasscodesToCards([2, 1, 1, 1], templates, 'main')).toEqual([
      jasmine.objectContaining({ id: 2, quantity: 1, section: 'main' }),
      jasmine.objectContaining({ id: 1, quantity: 3, section: 'main' }),
    ]);
  });

  it('reorders a copy within the same section', () => {
    const next = applyDeckCopyDrop([ash, veiler], 'main', 'main', 3, 0);
    expect(expandSectionPasscodes(next, 'main')).toEqual([2, 1, 1, 1]);
  });

  it('moves a copy from main to side at the drop index', () => {
    const next = applyDeckCopyDrop([ash, veiler, maxx], 'main', 'side', 0, 0);
    expect(expandSectionPasscodes(next, 'main')).toEqual([1, 1, 2]);
    expect(expandSectionPasscodes(next, 'side')).toEqual([1, 3]);
  });
});
