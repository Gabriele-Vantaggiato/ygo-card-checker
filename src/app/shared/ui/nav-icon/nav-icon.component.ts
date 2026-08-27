import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type NavIconName = 'search' | 'combo' | 'decklist' | 'tournament';

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
        @case ('tournament') {
          <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
          <path d="M18 2H6v7a6 6 0 0012 0V2z" />
        }
      }
    </svg>
  `,
})
export class NavIconComponent {
  readonly name = input.required<NavIconName>();
  readonly sizeClass = input('h-5 w-5');
}
