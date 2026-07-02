import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LanguageToggleComponent } from '../components/language-toggle/language-toggle.component';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LanguageToggleComponent],
  template: `
    <div class="min-h-screen bg-base-200 flex flex-col">
      <header class="navbar bg-base-100/95 backdrop-blur-md border-b border-base-300/60 px-3 sm:px-4 sticky top-0 z-30 shadow-sm">
        <div class="flex-1 min-w-0 gap-2">
          <span class="text-base sm:text-lg font-bold truncate tracking-tight text-primary">
            {{ i18n.t('app.title') }}
          </span>
        </div>

        <nav class="flex-none">
          <div role="tablist" class="tabs tabs-box tabs-sm sm:tabs-md bg-base-200/80 p-0.5">
            <a
              role="tab"
              routerLink="/"
              routerLinkActive="tab-active"
              [routerLinkActiveOptions]="{ exact: true }"
              class="tab text-xs sm:text-sm"
            >
              {{ i18n.t('nav.search') }}
            </a>
            <a role="tab" routerLink="/combo" routerLinkActive="tab-active" class="tab text-xs sm:text-sm">
              {{ i18n.t('nav.combo') }}
            </a>
            <a role="tab" routerLink="/decklist" routerLinkActive="tab-active" class="tab text-xs sm:text-sm">
              {{ i18n.t('nav.decklist') }}
            </a>
          </div>
        </nav>

        <div class="flex-none pl-2">
          <app-language-toggle />
        </div>
      </header>

      <router-outlet />
    </div>
  `,
})
export class AppShellComponent {
  protected readonly i18n = inject(I18nService);
}
