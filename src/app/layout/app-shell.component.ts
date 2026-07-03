import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LanguageToggleComponent } from '../components/language-toggle/language-toggle.component';
import { DialogHostComponent } from '../components/dialog-host/dialog-host.component';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LanguageToggleComponent, DialogHostComponent],
  template: `
    <div class="min-h-screen bg-base-200 flex flex-col">
      <header
        class="navbar bg-base-100/95 backdrop-blur-md border-b border-base-300/60 px-3 sm:px-4 sticky top-0 z-30 shadow-sm min-h-14"
      >
        <div class="flex-1 min-w-0">
          <span class="font-bold tracking-tight text-primary text-sm sm:text-base md:text-lg whitespace-nowrap">
            <span class="md:hidden">{{ i18n.t('app.titleShort') }}</span>
            <span class="hidden md:inline">{{ i18n.t('app.title') }}</span>
          </span>
        </div>

        <nav class="hidden md:flex flex-none">
          <div role="tablist" class="tabs tabs-box tabs-sm bg-base-200/80 p-0.5 rounded-lg">
            <a
              role="tab"
              routerLink="/"
              routerLinkActive="tab-active"
              [routerLinkActiveOptions]="{ exact: true }"
              class="tab text-sm px-4"
            >
              {{ i18n.t('nav.search') }}
            </a>
            <a role="tab" routerLink="/combo" routerLinkActive="tab-active" class="tab text-sm px-4">
              {{ i18n.t('nav.combo') }}
            </a>
            <a role="tab" routerLink="/decklist" routerLinkActive="tab-active" class="tab text-sm px-4">
              {{ i18n.t('nav.decklist') }}
            </a>
          </div>
        </nav>

        <div class="flex-none pl-2">
          <app-language-toggle />
        </div>
      </header>

      <div class="flex-1 pb-[4.75rem] md:pb-0">
        <router-outlet />
      </div>

      <nav
        class="mobile-tab-bar md:hidden"
        [attr.aria-label]="i18n.t('nav.main')"
      >
        <a
          routerLink="/"
          routerLinkActive="mobile-tab-active"
          [routerLinkActiveOptions]="{ exact: true }"
          class="mobile-tab"
        >
          <span class="mobile-tab-icon" aria-hidden="true">⌕</span>
          <span class="mobile-tab-label">{{ i18n.t('nav.search') }}</span>
        </a>
        <a routerLink="/combo" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon" aria-hidden="true">⚡</span>
          <span class="mobile-tab-label">{{ i18n.t('nav.combo') }}</span>
        </a>
        <a routerLink="/decklist" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon" aria-hidden="true">▤</span>
          <span class="mobile-tab-label">{{ i18n.t('nav.decklist') }}</span>
        </a>
      </nav>

      <app-dialog-host />
    </div>
  `,
})
export class AppShellComponent {
  protected readonly i18n = inject(I18nService);
}
