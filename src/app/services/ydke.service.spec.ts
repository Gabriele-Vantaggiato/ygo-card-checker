import {
  decklistToYdkeUrl,
  isExtraDeckType,
  passcodesToBase64,
  splitDeckIntoYdkeSections,
  ydkeSectionsToUrl,
} from './ydke.service';
import { DecklistCard } from '../models/decklist.model';

describe('YdkeService', () => {
  it('matches official ydke.js toURL example', () => {
    const url = ydkeSectionsToUrl({
      main: [46986414, 44095762],
      extra: [1861629],
      side: [],
    });
    expect(url).toBe('ydke://rvTMAhLZoAI=!/WccAA==!!');
  });

  it('matches official ydke.js parseURL example segments', () => {
    expect(passcodesToBase64([89631139, 36996508])).toBe('o6lXBZyFNAI=');
    expect(passcodesToBase64([44508094])).toBe('viOnAg==');
    expect(passcodesToBase64([5318639])).toBe('7ydRAA==');
  });

  it('classifies extra deck monsters by type', () => {
    expect(isExtraDeckType('Link Monster')).toBe(true);
    expect(isExtraDeckType('XYZ Monster')).toBe(true);
    expect(isExtraDeckType('Pendulum Effect Fusion Monster')).toBe(true);
    expect(isExtraDeckType('Effect Monster')).toBe(false);
    expect(isExtraDeckType('Spell Card')).toBe(false);
  });

  it('expands quantities and splits main vs extra', () => {
    const cards: DecklistCard[] = [
      {
        id: 89631139,
        name: 'Blue-Eyes White Dragon',
        type: 'Normal Monster',
        imageUrlSmall: null,
        quantity: 3,
      },
      {
        id: 44508094,
        name: 'Stardust Dragon',
        type: 'Synchro Monster',
        imageUrlSmall: null,
        quantity: 1,
      },
    ];

    expect(splitDeckIntoYdkeSections(cards)).toEqual({
      main: [89631139, 89631139, 89631139],
      extra: [44508094],
      side: [],
    });
    expect(decklistToYdkeUrl({ cards })).toBe('ydke://o6lXBaOpVwWjqVcF!viOnAg==!!');
  });

  it('encodes empty deck', () => {
    expect(decklistToYdkeUrl({ cards: [] })).toBe('ydke://!!!');
  });
});
