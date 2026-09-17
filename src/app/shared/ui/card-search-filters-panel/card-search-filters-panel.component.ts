import { ChangeDetectionStrategy, Component, HostListener, computed, input, output } from '@angular/core';
import {
  AdvancedCardSearchFilters,
  hasActiveAdvancedFilters,
  normalizeAdvancedSearchFilters,
} from '../../../models/card-search-filters.model';
import { SEARCH_TYPES, SEARCH_RACES, SEARCH_ATTRIBUTES, SEARCH_CATEGORY_TAGS } from '../../../models/card-search-options';
import { TranslatePipe } from '../../pipes/translate.pipe';

type StringFilterKey = 'type' | 'race' | 'attribute' | 'archetype' | 'categoryTag';
type NumericFilterKey = 'levelMin' | 'levelMax' | 'atkMin' | 'atkMax' | 'defMin' | 'defMax';

const STRING_KEYS: readonly StringFilterKey[] = ['type', 'race', 'attribute', 'archetype', 'categoryTag'];
const NUMERIC_KEYS: readonly NumericFilterKey[] = ['levelMin', 'levelMax', 'atkMin', 'atkMax', 'defMin', 'defMax'];

@Component({
  selector: 'app-card-search-filters-panel',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-search-filters-panel.component.html',
})
export class CardSearchFiltersPanelComponent {
  readonly filters = input.required<AdvancedCardSearchFilters>();
  readonly filtersChange = output<AdvancedCardSearchFilters>();
  readonly close = output<void>();

  readonly searchTypes = SEARCH_TYPES;
  readonly searchRaces = SEARCH_RACES;
  readonly searchAttributes = SEARCH_ATTRIBUTES;
  readonly searchCategoryTags = SEARCH_CATEGORY_TAGS;

  readonly activeCount = computed(
    () => Object.keys(normalizeAdvancedSearchFilters(this.filters())).length,
  );
  readonly hasActive = computed(() => hasActiveAdvancedFilters(this.filters()));

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close.emit();
    }
  }

  setField(key: StringFilterKey | NumericFilterKey, rawValue: string): void {
    const current = this.filters();
    const next: AdvancedCardSearchFilters = { ...current };

    if ((STRING_KEYS as readonly string[]).includes(key)) {
      const trimmed = rawValue.trim();
      if (trimmed) {
        (next as Record<string, string>)[key] = trimmed;
      } else {
        delete (next as Record<string, unknown>)[key];
      }
    } else if ((NUMERIC_KEYS as readonly string[]).includes(key)) {
      const parsed = rawValue.trim() === '' ? NaN : Number(rawValue);
      if (Number.isFinite(parsed)) {
        (next as Record<string, number>)[key] = parsed;
      } else {
        delete (next as Record<string, unknown>)[key];
      }
    }

    this.filtersChange.emit(next);
  }

  reset(): void {
    this.filtersChange.emit({});
  }
}
