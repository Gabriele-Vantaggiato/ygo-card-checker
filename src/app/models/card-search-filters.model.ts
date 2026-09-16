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
