import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CardSearchComponent } from './card-search.component';
import { I18nService } from '../../services/i18n.service';
import { YgoCard } from '../../models/ygo-card.model';

describe('CardSearchComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [CardSearchComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: I18nService, useValue: { lang: signal('it'), translate: (key: string) => key } },
      ],
    });
    const fixture = TestBed.createComponent(CardSearchComponent);
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('suggestions', []);
    return fixture;
  }

  it('shows a "no results" message when a search/filter genuinely returns nothing', () => {
    const fixture = setup();
    fixture.componentRef.setInput('query', 'missing-card');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checker-search-empty')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('search.noResults');
  });

  it('shows a loading skeleton instead of "no results" while loading', () => {
    const fixture = setup();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checker-search-empty')).toBeNull();
  });

  it('renders whatever suggestions the parent provides, even with an empty query (default browse list)', () => {
    const fixture = setup();
    const card: YgoCard = { id: 1, name: 'Ash Blossom & Joyous Spring', type: 'Effect Monster', desc: '', card_images: [] };
    fixture.componentRef.setInput('suggestions', [card]);
    fixture.detectChanges();
    const results = fixture.nativeElement.querySelector('.checker-search-results');
    expect(results).not.toBeNull();
    expect(results.textContent).toContain('Ash Blossom & Joyous Spring');
  });

  it('forwards the toolbar search/queryChange/filtersToggle events', () => {
    const fixture = setup();
    fixture.detectChanges();
    const search = jasmine.createSpy('search');
    const queryChange = jasmine.createSpy('queryChange');
    const filtersToggle = jasmine.createSpy('filtersToggle');
    fixture.componentInstance.search.subscribe(search);
    fixture.componentInstance.queryChange.subscribe(queryChange);
    fixture.componentInstance.filtersToggle.subscribe(filtersToggle);

    fixture.nativeElement.querySelector('[data-testid="search-submit-button"]').click();
    fixture.nativeElement.querySelector('[data-testid="filters-toggle-button"]').click();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'dragon';
    input.dispatchEvent(new Event('input'));

    expect(search).toHaveBeenCalledTimes(1);
    expect(filtersToggle).toHaveBeenCalledTimes(1);
    expect(queryChange).toHaveBeenCalledOnceWith('dragon');
  });

  it('shows the active filter count badge on the filters button', () => {
    const fixture = setup();
    fixture.componentRef.setInput('filterCount', 3);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="filters-toggle-button"]').textContent).toContain('3');
  });

  it('selects a card when its row is clicked', () => {
    const fixture = setup();
    const card: YgoCard = { id: 1, name: 'Card', type: 'Normal Monster', desc: '', card_images: [] };
    const selected = jasmine.createSpy('selected');
    fixture.componentInstance.cardSelected.subscribe(selected);

    fixture.componentInstance.selectCard(card);

    expect(selected).toHaveBeenCalledOnceWith(card);
  });
});
