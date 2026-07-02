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
      <header class="navbar bg-base-100 shadow-sm px-4 sticky top-0 z-30">
        <div class="flex-1 min-w-0">
          <span class="text-lg sm:text-xl font-bold truncate">{{ i18n.t('app.title') }}</span>
        </div>

        <nav class="flex-none">
          <ul class="menu menu-horizontal gap-1 px-1">
            <li>
              <a
                routerLink="/"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
                class="text-sm sm:text-base"
              >
                {{ i18n.t('nav.search') }}
              </a>
            </li>
            <li>
              <a routerLink="/decklist" routerLinkActive="active" class="text-sm sm:text-base">
                {{ i18n.t('nav.decklist') }}
              </a>
            </li>
          </ul>
        </nav>

        <div class="flex-none">
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
