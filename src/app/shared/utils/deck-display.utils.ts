/** First grapheme of a deck name, uppercased — used as avatar fallback. */
export function deckInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : '?';
}
