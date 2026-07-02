import { Injectable } from '@angular/core';
import { Decklist, DecklistCard } from '../models/decklist.model';

export interface YdkeSections {
  main: number[];
  extra: number[];
  side: number[];
}

const EXTRA_DECK_TYPE = /Fusion|Synchro|Synchron|Xyz|XYZ|Link/i;

export function isExtraDeckType(type: string): boolean {
  return EXTRA_DECK_TYPE.test(type);
}

export function expandPasscodes(cards: readonly DecklistCard[]): number[] {
  return cards.flatMap((card) => Array.from({ length: card.quantity }, () => card.id));
}

export function splitDeckIntoYdkeSections(cards: readonly DecklistCard[]): YdkeSections {
  const main: number[] = [];
  const extra: number[] = [];

  for (const card of cards) {
    const passcodes = Array.from({ length: card.quantity }, () => card.id);
    if (isExtraDeckType(card.type)) {
      extra.push(...passcodes);
    } else {
      main.push(...passcodes);
    }
  }

  return { main, extra, side: [] };
}

export function passcodesToBase64(passcodes: readonly number[]): string {
  if (passcodes.length === 0) {
    return '';
  }

  const bytes = new Uint8Array(passcodes.length * 4);
  const view = new DataView(bytes.buffer);
  passcodes.forEach((code, index) => view.setUint32(index * 4, code, true));

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function ydkeSectionsToUrl(sections: YdkeSections): string {
  return (
    'ydke://' +
    `${passcodesToBase64(sections.main)}!` +
    `${passcodesToBase64(sections.extra)}!` +
    `${passcodesToBase64(sections.side)}!`
  );
}

export function decklistToYdkeUrl(deck: Pick<Decklist, 'cards'>): string {
  return ydkeSectionsToUrl(splitDeckIntoYdkeSections(deck.cards));
}

@Injectable({ providedIn: 'root' })
export class YdkeService {
  splitSections(cards: readonly DecklistCard[]): YdkeSections {
    return splitDeckIntoYdkeSections(cards);
  }

  encodeDeck(deck: Pick<Decklist, 'cards'>): string {
    return decklistToYdkeUrl(deck);
  }
}
