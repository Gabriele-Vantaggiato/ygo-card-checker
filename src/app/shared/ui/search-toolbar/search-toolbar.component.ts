import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-search-toolbar',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-toolbar.component.html',
})
export class SearchToolbarComponent {
  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('queryInput');

  readonly query = input.required<string>();
  readonly loading = input(false);
  readonly filtersOpen = input(false);
  readonly filterCount = input(0);

  readonly queryChange = output<string>();
  readonly search = output<void>();
  readonly filtersToggle = output<void>();

  focusInput(): void {
    const input = this.queryInput()?.nativeElement;
    input?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    input?.focus({ preventScroll: true });
  }

  onInput(event: Event): void {
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.queryChange.emit('');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.search.emit();
    }
  }
}
