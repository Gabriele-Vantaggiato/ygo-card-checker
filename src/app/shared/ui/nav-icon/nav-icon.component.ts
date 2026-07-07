import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type NavIconName = 'search' | 'combo' | 'decklist' | 'community';

@Component({
  selector: 'app-nav-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="nav-icon"
      [class]="sizeClass()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('search') {
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        }
        @case ('combo') {
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        }
        @case ('decklist') {
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h10M7 12h6" />
        }
        @case ('community') {
          <circle cx="9" cy="8" r="3.5" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 19c0-2.5 2.7-4.5 6-4.5s6 2 6 4.5M14 19c0-1.8 1.6-3.2 3.5-3.2.9 0 1.7.3 2.5.8" />
        }
      }
    </svg>
  `,
})
export class NavIconComponent {
  readonly name = input.required<NavIconName>();
  readonly sizeClass = input('h-5 w-5');
}
