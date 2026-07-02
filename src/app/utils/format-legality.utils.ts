import { FormatLegalityIndex } from '../models/card-knowledge.model';

export function isPlayableInFormat(
  index: FormatLegalityIndex | null,
  cardId: number,
  formatId: string,
): boolean {
  if (!index) {
    return true;
  }
  return (index.playable[String(cardId)] ?? []).includes(formatId);
}

export function maxCopiesInFormat(
  index: FormatLegalityIndex | null,
  cardId: number,
  formatId: string,
): number | null {
  if (!index) {
    return null;
  }
  return index.maxCopies[String(cardId)]?.[formatId] ?? null;
}

export function isFormatMetaTag(tag: string): boolean {
  return tag.startsWith('format:') || tag.startsWith('copies:');
}
