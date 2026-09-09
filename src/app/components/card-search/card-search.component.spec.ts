import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CardSearchComponent } from './card-search.component';
import { I18nService } from '../../services/i18n.service';
import { YgoCard } from '../../models/ygo-card.model';

describe('CardSearchComponent feedback and keyboard', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [CardSearchComponent],
      providers: [{ provide: I18nService, useValue: { lang: signal('it'), translate: (key: string) => key } }],
    });
    const fixture = TestBed.createComponent(CardSearchComponent);
    fixture.componentRef.setInput('query', 'missing-card');
    fixture.componentRef.setInput('suggestions', []);
    return fixture;
  }

  it('renders empty results after a search returns no matches', () => {
    const fixture = setup();
    fixture.componentInstance.openResults();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.checker-search-empty').length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('search.noResults');
  });

  it('does not show a results list for queries shorter than two characters', () => {
    const fixture = setup();
    fixture.componentRef.setInput('query', 'x');
    fixture.componentInstance.openResults();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checker-search-results')).toBeNull();
  });

  it('does not select stale results while loading, then opens the first completed result', () => {
    const fixture = setup();
    const card: YgoCard = { id: 1, name: 'Card', type: 'Normal Monster', desc: '', card_images: [] };
    fixture.componentRef.setInput('suggestions', [card]);
    fixture.componentRef.setInput('loading', true);
    const selected = jasmine.createSpy('selected');
    fixture.componentInstance.cardSelected.subscribe(selected);
    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(selected).not.toHaveBeenCalled();
    fixture.componentRef.setInput('loading', false);
    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(selected).toHaveBeenCalledOnceWith(card);
  });

  it('clears the query with Escape', () => {
    const fixture = setup();
    const change = jasmine.createSpy('change');
    fixture.componentInstance.queryChange.subscribe(change);
    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(change).toHaveBeenCalledOnceWith('');
  });
});
