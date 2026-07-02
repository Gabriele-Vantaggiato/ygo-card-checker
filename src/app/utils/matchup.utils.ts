import { MatchupCatalogEntry } from '../models/card-knowledge.model';

export function detectMatchupKeys(text: string, catalog: readonly MatchupCatalogEntry[]): string[] {
  const normalized = text.trim().toLowerCase();
  if (!normalized || catalog.length === 0) {
    return [];
  }

  const hits = new Set<string>();
  for (const entry of catalog) {
    if (entry.labels.some((label) => normalized.includes(label))) {
      hits.add(entry.key);
    }
  }

  const weakPattern =
    /(?:debole\s+contro|weak\s+against|counter(?:are)?|migliorare\s+contro|anti[-\s]?|contro\s+(?:i\s+|gli |le )?)([a-z0-9][\w\s-]{2,40})/gi;
  for (const match of normalized.matchAll(weakPattern)) {
    const fragment = match[1]?.trim() ?? '';
    for (const entry of catalog) {
      if (entry.labels.some((label) => fragment.includes(label) || label.includes(fragment))) {
        hits.add(entry.key);
      }
    }
  }

  return [...hits];
}
