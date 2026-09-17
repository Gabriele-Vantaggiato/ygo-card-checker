export interface CardSearchFilters {
  type?: string;
  race?: string;
  attribute?: string;
  level?: string;
  atk?: string;
  def?: string;
  archetype?: string;
}
export const SEARCH_FILTER_KEYS = ['type','race','attribute','level','atk','def','archetype'] as const;
export function normalizeSearchFilters(filters: CardSearchFilters): CardSearchFilters {
  const result: CardSearchFilters = {};
  for (const key of SEARCH_FILTER_KEYS) {
    const value=filters[key]?.trim();
    if (!value) continue;
    if (['level','atk','def'].includes(key) && !/^\d+$/.test(value)) continue;
    result[key]=value;
  }
  return result;
}

export interface AdvancedCardSearchFilters {
  type?: string;
  race?: string;
  attribute?: string;
  archetype?: string;
  categoryTag?: string;
  levelMin?: number;
  levelMax?: number;
  atkMin?: number;
  atkMax?: number;
  defMin?: number;
  defMax?: number;
}

const ADVANCED_STRING_KEYS = ['type', 'race', 'attribute', 'archetype', 'categoryTag'] as const;
const ADVANCED_RANGE_PAIRS = [
  ['levelMin', 'levelMax'],
  ['atkMin', 'atkMax'],
  ['defMin', 'defMax'],
] as const;

export function normalizeAdvancedSearchFilters(filters: AdvancedCardSearchFilters): AdvancedCardSearchFilters {
  const result: AdvancedCardSearchFilters = {};
  for (const key of ADVANCED_STRING_KEYS) {
    const value = filters[key]?.trim();
    if (value) result[key] = value;
  }
  for (const [minKey, maxKey] of ADVANCED_RANGE_PAIRS) {
    let min = filters[minKey];
    let max = filters[maxKey];
    if (min !== undefined && (!Number.isFinite(min) || min < 0)) min = undefined;
    if (max !== undefined && (!Number.isFinite(max) || max < 0)) max = undefined;
    if (min !== undefined && max !== undefined && min > max) {
      [min, max] = [max, min];
    }
    if (min !== undefined) result[minKey] = min;
    if (max !== undefined) result[maxKey] = max;
  }
  return result;
}

export function hasActiveAdvancedFilters(filters: AdvancedCardSearchFilters): boolean {
  return Object.keys(normalizeAdvancedSearchFilters(filters)).length > 0;
}
