import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchToolbarComponent } from './search-toolbar.component';

describe('SearchToolbarComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [SearchToolbarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(SearchToolbarComponent);
    fixture.componentRef.setInput('query', '');
    fixture.detectChanges();
    return fixture;
  }

  it('emits queryChange on input', () => {
    const fixture = setup();
    const change = jasmine.createSpy('change');
    fixture.componentInstance.queryChange.subscribe(change);

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'dragon';
    input.dispatchEvent(new Event('input'));

    expect(change).toHaveBeenCalledOnceWith('dragon');
  });

  it('emits search on Enter and clears the query on Escape', () => {
    const fixture = setup();
    const search = jasmine.createSpy('search');
    const change = jasmine.createSpy('change');
    fixture.componentInstance.search.subscribe(search);
    fixture.componentInstance.queryChange.subscribe(change);

    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(search).toHaveBeenCalledTimes(1);

    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(change).toHaveBeenCalledOnceWith('');
  });

  it('emits search when the search button is clicked', () => {
    const fixture = setup();
    const search = jasmine.createSpy('search');
    fixture.componentInstance.search.subscribe(search);

    fixture.nativeElement.querySelector('[data-testid="search-submit-button"]').click();

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('emits filtersToggle when the filters button is clicked and shows the active filter count', () => {
    const fixture = setup();
    fixture.componentRef.setInput('filterCount', 2);
    fixture.detectChanges();
    const toggle = jasmine.createSpy('toggle');
    fixture.componentInstance.filtersToggle.subscribe(toggle);

    const button = fixture.nativeElement.querySelector('[data-testid="filters-toggle-button"]');
    button.click();

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(button.textContent).toContain('2');
  });

  it('focuses and scrolls the query input via focusInput()', () => {
    const fixture = setup();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    spyOn(input, 'focus');
    spyOn(input, 'scrollIntoView');

    fixture.componentInstance.focusInput();

    expect(input.focus).toHaveBeenCalled();
    expect(input.scrollIntoView).toHaveBeenCalled();
  });

  it('hides the filter count badge when there are no active filters', () => {
    const fixture = setup();
    fixture.componentRef.setInput('filterCount', 0);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="filters-toggle-button"]');
    expect(button.querySelector('.badge')).toBeNull();
  });
});
