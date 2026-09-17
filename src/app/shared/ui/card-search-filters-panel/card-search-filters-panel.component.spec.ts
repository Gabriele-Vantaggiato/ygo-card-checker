import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CardSearchFiltersPanelComponent } from './card-search-filters-panel.component';
import { AdvancedCardSearchFilters } from '../../../models/card-search-filters.model';

describe('CardSearchFiltersPanelComponent', () => {
  function setup(filters: AdvancedCardSearchFilters = {}) {
    TestBed.configureTestingModule({
      imports: [CardSearchFiltersPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(CardSearchFiltersPanelComponent);
    fixture.componentRef.setInput('filters', filters);
    fixture.detectChanges();
    return fixture;
  }

  it('emits an updated filter set when a string field changes', () => {
    const fixture = setup();
    const emitted: AdvancedCardSearchFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentInstance.setField('type', 'Effect Monster');

    expect(emitted).toEqual([{ type: 'Effect Monster' }]);
  });

  it('clears a string field when set to a blank value', () => {
    const fixture = setup({ type: 'Effect Monster', attribute: 'DARK' });
    const emitted: AdvancedCardSearchFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentInstance.setField('type', '');

    expect(emitted).toEqual([{ attribute: 'DARK' }]);
  });

  it('parses a numeric field and merges it with existing filters', () => {
    const fixture = setup({ attribute: 'DARK' });
    const emitted: AdvancedCardSearchFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentInstance.setField('atkMin', '1500');

    expect(emitted).toEqual([{ attribute: 'DARK', atkMin: 1500 }]);
  });

  it('clears a numeric field when set to a blank or non-numeric value', () => {
    const fixture = setup({ atkMin: 1500 });
    const emitted: AdvancedCardSearchFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentInstance.setField('atkMin', '');

    expect(emitted).toEqual([{}]);
  });

  it('emits an empty filter set on reset', () => {
    const fixture = setup({ type: 'Effect Monster', atkMin: 1500 });
    const emitted: AdvancedCardSearchFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentInstance.reset();

    expect(emitted).toEqual([{}]);
  });

  it('counts only the currently active filters', () => {
    const fixture = setup({ type: 'Effect Monster', atkMin: 1500, archetype: '  ' });
    expect(fixture.componentInstance.activeCount()).toBe(2);
  });

  it('sets categoryTag as a string field', () => {
    const fixture = setup();
    const emitted: AdvancedCardSearchFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentInstance.setField('categoryTag', 'category_special_summon');

    expect(emitted).toEqual([{ categoryTag: 'category_special_summon' }]);
  });

  it('renders an option for every known category tag', () => {
    const fixture = setup();
    const options = fixture.nativeElement.querySelectorAll('[data-testid="category-tag-select"] option');
    // +1 for the "any" placeholder option
    expect(options.length).toBe(fixture.componentInstance.searchCategoryTags.length + 1);
  });

  it('emits close on backdrop click', () => {
    const fixture = setup();
    const closed = jasmine.createSpy('closed');
    fixture.componentInstance.close.subscribe(closed);

    const backdrop = fixture.nativeElement.querySelector('[data-testid="filters-backdrop"]');
    backdrop.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits close on Escape', () => {
    const fixture = setup();
    const closed = jasmine.createSpy('closed');
    fixture.componentInstance.close.subscribe(closed);

    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits close from the close button', () => {
    const fixture = setup();
    const closed = jasmine.createSpy('closed');
    fixture.componentInstance.close.subscribe(closed);

    const button = fixture.nativeElement.querySelector('[data-testid="filters-close-button"]');
    button.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
