/** Picks the most name-like line of an OCR blob (most letters, at least 3). */
export function cleanOcrName(text: string): string | null {
  let best: string | null = null;
  let bestLetters = 2;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const letters = (trimmed.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    if (letters > bestLetters) {
      best = trimmed;
      bestLetters = letters;
    }
  }
  return best;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

/** 1 = identical after normalisation, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) {
    return 0;
  }
  return 1 - levenshtein(x, y) / longest;
}

/**
 * Collapses OCR-noisy variants of one name: returns the first entry of `recent` that is
 * similar enough to `candidate`, otherwise the normalized candidate itself.
 */
export function canonicalizeName(candidate: string, recent: readonly string[], threshold = 0.72): string {
  const normalized = normalizeName(candidate);
  if (!normalized) {
    return '';
  }
  return recent.find((entry) => similarity(normalized, entry) >= threshold) ?? normalized;
}

/** Search queries for a noisy name: the full text, then up to 3 longest distinct words (>= 4 letters). */
export function buildNameQueries(text: string): string[] {
  const full = text.trim().replace(/[ \t\r\n]+/g, ' ');
  if (!full) {
    return [];
  }
  const seen = new Set<string>();
  const words = full
    .split(' ')
    .map((word) => word.replace(/[^A-Za-zÀ-ÿ]/g, ''))
    .filter((word) => {
      const key = word.toLowerCase();
      if (word.length < 4 || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  return [full, ...words];
}

export function bestNameMatch<T extends { name: string }>(
  ocrName: string,
  cards: readonly T[],
  minScore = 0.6,
): T | null {
  let best: T | null = null;
  let bestScore = minScore;
  for (const card of cards) {
    const score = similarity(ocrName, card.name);
    if (score >= bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}
