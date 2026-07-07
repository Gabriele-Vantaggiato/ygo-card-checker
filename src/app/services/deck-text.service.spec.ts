import {
  countTextDeckLines,
  formatDeckText,
  parseDeckText,
  resolveImportedSection,
} from './deck-text.service';
import { DecklistCard } from '../models/decklist.model';

describe('DeckTextService', () => {
  it('parses quantity and card name lines', () => {
    const sections = parseDeckText(`2 Summoner Monk
3x Maxx "C"
1 Ash Blossom & Joyous Spring`);

    expect(sections.main).toEqual([
      { quantity: 2, name: 'Summoner Monk', section: 'main' },
      { quantity: 3, name: 'Maxx "C"', section: 'main' },
      { quantity: 1, name: 'Ash Blossom & Joyous Spring', section: 'main' },
    ]);
    expect(sections.extra).toEqual([]);
    expect(sections.side).toEqual([]);
  });

  it('parses section markers', () => {
    const sections = parseDeckText(`#main
2 Effect Veiler
#extra
1 Stardust Dragon
#side
1 Droll & Lock Bird`);

    expect(sections.main).toEqual([
      { quantity: 2, name: 'Effect Veiler', section: 'main' },
    ]);
    expect(sections.extra).toEqual([
      { quantity: 1, name: 'Stardust Dragon', section: 'extra' },
    ]);
    expect(sections.side).toEqual([
      { quantity: 1, name: 'Droll & Lock Bird', section: 'side' },
    ]);
    expect(countTextDeckLines(sections)).toEqual({ main: 2, extra: 1, side: 1 });
  });

  it('formats deck with section headers', () => {
    const cards: DecklistCard[] = [
      {
        id: 1,
        name: 'Summoner Monk',
        type: 'Effect Monster',
        imageUrlSmall: null,
        quantity: 2,
      },
      {
        id: 2,
        name: 'Stardust Dragon',
        type: 'Synchro Monster',
        imageUrlSmall: null,
        quantity: 1,
        section: 'extra',
      },
    ];

    expect(formatDeckText({ cards })).toBe(
      '#main\n2 Summoner Monk\n\n#extra\n1 Stardust Dragon',
    );
  });

  it('moves extra deck monsters to extra when imported in main block', () => {
    expect(resolveImportedSection('main', 'Synchro Monster')).toBe('extra');
    expect(resolveImportedSection('main', 'Effect Monster')).toBe('main');
    expect(resolveImportedSection('side', 'Synchro Monster')).toBe('side');
  });

  it('round-trips parsed export format', () => {
    const cards: DecklistCard[] = [
      {
        id: 10,
        name: 'Pot of Greed',
        type: 'Spell Card',
        imageUrlSmall: null,
        quantity: 1,
      },
      {
        id: 20,
        name: 'Number 41: Bagooska',
        type: 'Xyz Monster',
        imageUrlSmall: null,
        quantity: 1,
      },
    ];

    const text = formatDeckText({ cards });
    const parsed = parseDeckText(text);
    expect(countTextDeckLines(parsed)).toEqual({ main: 1, extra: 1, side: 0 });
  });
});
