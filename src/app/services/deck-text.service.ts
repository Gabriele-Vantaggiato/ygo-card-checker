import { Injectable } from '@angular/core';
import { Decklist, DecklistCard } from '../models/decklist.model';
import { DeckSection } from '../models/decklist.model';
import { isExtraDeckType } from './ydke.service';
import { sortDeckCards, splitDeckSections } from '../utils/deck-card.utils';

export interface TextDeckLine {
  quantity: number;
  name: string;
  section: DeckSection;
}

export interface TextDeckSections {
  main: TextDeckLine[];
  extra: TextDeckLine[];
  side: TextDeckLine[];
}

const LINE_RE = /^(\d+)\s*[x×]?\s+(.+)$/i;

const SECTION_MARKERS: ReadonlyArray<{ pattern: RegExp; section: DeckSection }> = [
  { pattern: /^#!?main$/i, section: 'main' },
  { pattern: /^main\s*deck:?$/i, section: 'main' },
  { pattern: /^#!?extra$/i, section: 'extra' },
  { pattern: /^extra\s*deck:?$/i, section: 'extra' },
  { pattern: /^#!?side$/i, section: 'side' },
  { pattern: /^side\s*deck:?$/i, section: 'side' },
];

function parseSectionMarker(line: string): DeckSection | null {
  const trimmed = line.trim();
  for (const { pattern, section } of SECTION_MARKERS) {
    if (pattern.test(trimmed)) {
      return section;
    }
  }
  return null;
}

function parseCardLine(line: string, section: DeckSection): TextDeckLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null;
  }

  const match = trimmed.match(LINE_RE);
  if (!match) {
    return null;
  }

  const quantity = Number(match[1]);
  const name = match[2]?.trim();
  if (!Number.isFinite(quantity) || quantity <= 0 || !name) {
    return null;
  }

  return { quantity, name, section };
}

export function parseDeckText(input: string): TextDeckSections {
  const sections: TextDeckSections = { main: [], extra: [], side: [] };
  let currentSection: DeckSection = 'main';

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const marker = parseSectionMarker(line);
    if (marker) {
      currentSection = marker;
      continue;
    }

    const parsed = parseCardLine(line, currentSection);
    if (parsed) {
      sections[parsed.section].push(parsed);
    }
  }

  return sections;
}

export function countTextDeckLines(sections: TextDeckSections): {
  main: number;
  extra: number;
  side: number;
} {
  const sum = (lines: readonly TextDeckLine[]) =>
    lines.reduce((total, line) => total + line.quantity, 0);
  return {
    main: sum(sections.main),
    extra: sum(sections.extra),
    side: sum(sections.side),
  };
}

export function formatDeckText(
  deck: Pick<Decklist, 'cards'>,
  nameById?: ReadonlyMap<number, string>,
): string {
  const sections = splitDeckSections(sortDeckCards(deck.cards));
  const lines: string[] = [];

  const appendSection = (key: DeckSection, cards: readonly DecklistCard[]) => {
    if (cards.length === 0) {
      return;
    }
    if (lines.length > 0) {
      lines.push('');
    }
    if (key !== 'main' || sections.extra.length > 0 || sections.side.length > 0) {
      lines.push(key === 'extra' ? '#extra' : key === 'side' ? '#side' : '#main');
    }
    for (const card of cards) {
      const name = nameById?.get(card.id) ?? card.name;
      lines.push(`${card.quantity} ${name}`);
    }
  };

  appendSection('main', sections.main);
  appendSection('extra', sections.extra);
  appendSection('side', sections.side);

  return lines.join('\n');
}

export function resolveImportedSection(
  declaredSection: DeckSection,
  cardType: string,
): DeckSection {
  if (declaredSection === 'side') {
    return 'side';
  }
  if (isExtraDeckType(cardType)) {
    return 'extra';
  }
  if (declaredSection === 'extra' && !isExtraDeckType(cardType)) {
    return 'main';
  }
  return declaredSection === 'extra' ? 'extra' : 'main';
}

@Injectable({ providedIn: 'root' })
export class DeckTextService {
  parse(input: string): TextDeckSections {
    return parseDeckText(input);
  }

  count(sections: TextDeckSections): { main: number; extra: number; side: number } {
    return countTextDeckLines(sections);
  }

  format(deck: Pick<Decklist, 'cards'>, nameById?: ReadonlyMap<number, string>): string {
    return formatDeckText(deck, nameById);
  }
}
