import { AdvancedCardSearchFilters, hasActiveAdvancedFilters, normalizeAdvancedSearchFilters } from './card-search-filters.model';

describe('hasActiveAdvancedFilters', () => {
  it('returns false for an empty filter set', () => {
    expect(hasActiveAdvancedFilters({})).toBeFalse();
  });

  it('returns true when a string field is set', () => {
    expect(hasActiveAdvancedFilters({ type: 'Effect Monster' })).toBeTrue();
  });

  it('returns true when a numeric range bound is set', () => {
    expect(hasActiveAdvancedFilters({ atkMin: 1000 })).toBeTrue();
  });

  it('ignores blank strings', () => {
    expect(hasActiveAdvancedFilters({ archetype: '   ' })).toBeFalse();
  });
});

describe('normalizeAdvancedSearchFilters', () => {
  it('trims string fields and drops blank ones', () => {
    const result = normalizeAdvancedSearchFilters({ type: ' Effect Monster ', archetype: '  ' });
    expect(result).toEqual({ type: 'Effect Monster' });
  });

  it('keeps valid numeric range bounds', () => {
    const result = normalizeAdvancedSearchFilters({ atkMin: 1000, atkMax: 2500 });
    expect(result).toEqual({ atkMin: 1000, atkMax: 2500 });
  });

  it('drops NaN and negative numeric bounds', () => {
    const filters: AdvancedCardSearchFilters = { levelMin: NaN, defMax: -5 };
    expect(normalizeAdvancedSearchFilters(filters)).toEqual({});
  });

  it('swaps an inverted min/max pair so min is never greater than max', () => {
    const result = normalizeAdvancedSearchFilters({ atkMin: 3000, atkMax: 1000 });
    expect(result).toEqual({ atkMin: 1000, atkMax: 3000 });
  });

  it('trims categoryTag and drops it when blank', () => {
    expect(normalizeAdvancedSearchFilters({ categoryTag: ' category_destroy ' })).toEqual({
      categoryTag: 'category_destroy',
    });
    expect(normalizeAdvancedSearchFilters({ categoryTag: '  ' })).toEqual({});
  });
});
