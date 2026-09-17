import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { AdvancedCardSearchFilters, normalizeAdvancedSearchFilters } from '../models/card-search-filters.model';

export interface SearchIndexEntry {
  id: number;
  name: string;
  type: string;
  race: string | null;
  attribute: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  archetype: string | null;
  desc: string;
  tags: string[];
}

const INDEX_URL = 'assets/data/card-knowledge/search-index.json';

@Injectable({ providedIn: 'root' })
export class CardSearchIndexService {
  private readonly http = inject(HttpClient);
  private index$: Observable<SearchIndexEntry[]> | null = null;

  loadIndex$(): Observable<SearchIndexEntry[]> {
    if (!this.index$) {
      this.index$ = this.http
        .get<SearchIndexEntry[]>(INDEX_URL)
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.index$;
  }

  filterIndex(entries: readonly SearchIndexEntry[], query: string, filters: AdvancedCardSearchFilters): number[] {
    const trimmedQuery = canonicalizeEffectText(query.trim());

    const matches = entries.filter((entry) => {
      if (trimmedQuery) {
        const nameMatch = canonicalizeEffectText(entry.name).includes(trimmedQuery);
        const descMatch = canonicalizeEffectText(entry.desc).includes(trimmedQuery);
        if (!nameMatch && !descMatch) return false;
      }
      return matchesAdvancedFilters(entry, filters);
    });

    return matches
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => entry.id);
  }

  sortIdsWithin(entries: readonly SearchIndexEntry[], ids: ReadonlySet<number>): number[] {
    return entries
      .filter((entry) => ids.has(entry.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => entry.id);
  }
}

/**
 * Konami's official English card text switched from spelling out "Graveyard" (pre-~2020
 * cards) to the abbreviated "GY" (modern cards). Canonicalizing both to the same form lets
 * a search for either wording match cards printed with the other.
 */
function canonicalizeEffectText(text: string): string {
  return text.toLowerCase().replace(/\bgy\b/g, 'graveyard');
}

function inRange(value: number | null | undefined, min: number | undefined, max: number | undefined): boolean {
  if (min === undefined && max === undefined) return true;
  if (value === null || value === undefined) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

interface FilterableCard {
  type: string;
  race?: string | null;
  attribute?: string | null;
  archetype?: string | null;
  level?: number | null;
  atk?: number | null;
  def?: number | null;
  tags?: string[];
}

export function matchesAdvancedFilters(card: FilterableCard, filters: AdvancedCardSearchFilters): boolean {
  const normalized = normalizeAdvancedSearchFilters(filters);
  if (normalized.type && card.type !== normalized.type) return false;
  if (normalized.race && card.race !== normalized.race) return false;
  if (normalized.attribute && card.attribute !== normalized.attribute) return false;
  if (normalized.archetype && card.archetype !== normalized.archetype) return false;
  if (normalized.categoryTag && !card.tags?.includes(normalized.categoryTag)) return false;
  if (!inRange(card.level, normalized.levelMin, normalized.levelMax)) return false;
  if (!inRange(card.atk, normalized.atkMin, normalized.atkMax)) return false;
  if (!inRange(card.def, normalized.defMin, normalized.defMax)) return false;
  return true;
}
