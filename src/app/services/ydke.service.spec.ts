import {
  base64ToPasscodes,
  decklistToYdkeUrl,
  isExtraDeckType,
  parseYdkeUrl,
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

  it('round-trips official ydke.js parseURL example', () => {
    const url = 'ydke://o6lXBZyFNAI=!viOnAg==!7ydRAA==!';
    expect(parseYdkeUrl(url)).toEqual({
      main: [89631139, 36996508],
      extra: [44508094],
      side: [5318639],
    });
    expect(base64ToPasscodes('o6lXBZyFNAI=')).toEqual([89631139, 36996508]);
  });

  it('round-trips encode then decode', () => {
    const sections = {
      main: [46986414, 44095762],
      extra: [1861629],
      side: [5318639],
    };
    const url = ydkeSectionsToUrl(sections);
    expect(parseYdkeUrl(url)).toEqual(sections);
  });

  it('imports our own export with empty side deck', () => {
    const url = 'ydke://rvTMAhLZoAI=!/WccAA==!!';
    expect(parseYdkeUrl(url)).toEqual({
      main: [46986414, 44095762],
      extra: [1861629],
      side: [],
    });
  });

  it('imports game-style ydke with trailing delimiter and empty side', () => {
    expect(parseYdkeUrl('ydke://o6lXBaOpVwWjqVcF!viOnAg==!!')).toEqual({
      main: [89631139, 89631139, 89631139],
      extra: [44508094],
      side: [],
    });
    expect(parseYdkeUrl('ydke://!!!')).toEqual({
      main: [],
      extra: [],
      side: [],
    });
    expect(parseYdkeUrl('ydke://abc!def!')).toEqual({
      main: [],
      extra: [],
      side: [],
    });
  });

  it('accepts percent-encoded and quoted clipboard text', () => {
    const url = 'ydke://o6lXBZyFNAI=!viOnAg==!7ydRAA==!';
    expect(parseYdkeUrl(encodeURIComponent(url))).toEqual({
      main: [89631139, 36996508],
      extra: [44508094],
      side: [5318639],
    });
    expect(parseYdkeUrl(`"${url}"`)).toEqual({
      main: [89631139, 36996508],
      extra: [44508094],
      side: [5318639],
    });
  });

  it('accepts two-segment ydke without trailing delimiter', () => {
    expect(parseYdkeUrl('ydke://o6lXBZyFNAI=!viOnAg==')).toEqual({
      main: [89631139, 36996508],
      extra: [44508094],
      side: [],
    });
  });

  it('accepts bare main!extra!side segments without prefix', () => {
    const url = ydkeSectionsToUrl({
      main: [89631139],
      extra: [44508094],
      side: [],
    });
    const bare = url.slice('ydke://'.length);
    expect(parseYdkeUrl(bare)).toEqual({
      main: [89631139],
      extra: [44508094],
      side: [],
    });
  });

  it('respects explicit side section on cards', () => {
    const cards: DecklistCard[] = [
      {
        id: 5318639,
        name: 'Mystical Space Typhoon',
        type: 'Spell Card',
        imageUrlSmall: null,
        quantity: 1,
        section: 'side',
      },
    ];
    expect(splitDeckIntoYdkeSections(cards)).toEqual({
      main: [],
      extra: [],
      side: [5318639],
    });
  });
});
