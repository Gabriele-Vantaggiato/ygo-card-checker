import { Injectable } from '@angular/core';
import { Decklist, DecklistCard, DeckSection } from '../models/decklist.model';

export interface YdkeSections {
  main: number[];
  extra: number[];
  side: number[];
}

const EXTRA_DECK_TYPE = /Fusion|Synchro|Synchron|Xyz|XYZ|Link/i;
const YDKE_PREFIX = 'ydke://';
const YDKE_EXTRACT_RE =
  /ydke:\/\/[A-Za-z0-9+/=_-]*?![A-Za-z0-9+/=_-]*?![A-Za-z0-9+/=_-]*?!/gi;

export function isExtraDeckType(type: string): boolean {
  return EXTRA_DECK_TYPE.test(type);
}

export function resolveDeckSection(card: Pick<DecklistCard, 'type' | 'section'>): DeckSection {
  if (card.section) {
    return card.section;
  }
  return isExtraDeckType(card.type) ? 'extra' : 'main';
}

export function expandPasscodes(cards: readonly DecklistCard[]): number[] {
  return cards.flatMap((card) => Array.from({ length: card.quantity }, () => card.id));
}

export function splitDeckIntoYdkeSections(cards: readonly DecklistCard[]): YdkeSections {
  const main: number[] = [];
  const extra: number[] = [];
  const side: number[] = [];

  for (const card of cards) {
    const passcodes = Array.from({ length: card.quantity }, () => card.id);
    const section = resolveDeckSection(card);
    if (section === 'extra') {
      extra.push(...passcodes);
    } else if (section === 'side') {
      side.push(...passcodes);
    } else {
      main.push(...passcodes);
    }
  }

  return { main, extra, side };
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

function normalizeBase64Segment(segment: string): string {
  const cleaned = segment.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!cleaned) {
    return '';
  }
  const pad = cleaned.length % 4;
  return pad === 0 ? cleaned : cleaned + '='.repeat(4 - pad);
}

export function base64ToPasscodes(base64: string): number[] {
  const normalized = normalizeBase64Segment(base64);
  if (!normalized) {
    return [];
  }

  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error('Invalid YDKE base64 segment');
  }

  const usableLength = binary.length - (binary.length % 4);
  if (usableLength === 0) {
    return [];
  }

  const bytes = new Uint8Array(usableLength);
  for (let i = 0; i < usableLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);
  const passcodes: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 4) {
    passcodes.push(view.getUint32(offset, true));
  }
  return passcodes;
}

function sanitizeYdkeClipboard(input: string): string {
  let text = input.trim().replace(/^\uFEFF/, '');

  if (text.includes('%')) {
    try {
      text = decodeURIComponent(text);
    } catch {
      // Keep the original text when clipboard content is only partially encoded.
    }
  }

  return text.replace(/\s+/g, '').replace(/^[\s"'[<(]+/, '').replace(/[\s"'\]>).,;]+$/, '');
}

export function normalizeYdkeInput(input: string): string {
  const text = sanitizeYdkeClipboard(input);
  const extracted = extractYdkeUrl(text);
  if (extracted) {
    return extracted;
  }
  if (text.includes('!') && !text.toLowerCase().includes(YDKE_PREFIX)) {
    return `${YDKE_PREFIX}${text}`;
  }
  return text;
}

export function extractYdkeUrl(text: string): string | null {
  const normalized = sanitizeYdkeClipboard(text);
  const strict = normalized.match(YDKE_EXTRACT_RE);
  if (strict?.[0]) {
    return strict[0];
  }

  const loose = normalized.match(/ydke:\/\/[!A-Za-z0-9+/=_-]*/i);
  return loose?.[0] ?? null;
}

export function parseYdkeUrl(input: string): YdkeSections {
  const raw = normalizeYdkeInput(input);
  if (!raw.toLowerCase().startsWith(YDKE_PREFIX)) {
    throw new Error('Missing ydke:// prefix');
  }

  const components = raw.slice(YDKE_PREFIX.length).split('!');
  while (components.length < 3) {
    components.push('');
  }

  return {
    main: base64ToPasscodes(components[0] ?? ''),
    extra: base64ToPasscodes(components[1] ?? ''),
    side: base64ToPasscodes(components[2] ?? ''),
  };
}

export function passcodesToQuantityMap(passcodes: readonly number[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const id of passcodes) {
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
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

  parseUrl(input: string): YdkeSections {
    return parseYdkeUrl(input);
  }

  extractUrl(text: string): string | null {
    return extractYdkeUrl(text);
  }
}
