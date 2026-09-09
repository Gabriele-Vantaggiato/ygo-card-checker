import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';
import { FormatSelectorComponent } from '../../components/format-selector/format-selector.component';
import { DialogHostComponent } from '../../components/dialog-host/dialog-host.component';
import { ToastHostComponent } from '../../components/toast-host/toast-host.component';
import { I18nService } from '../../services/i18n.service';
import { FormatStore } from '../stores/format.store';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BackToTopComponent } from '../../shared/ui/back-to-top/back-to-top.component';
import { NavIconComponent } from '../../shared/ui/nav-icon/nav-icon.component';
import { DuelFieldBackgroundComponent } from '../../shared/ui/duel-field-bg/duel-field-bg.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    BackToTopComponent,
    RouterLink,
    RouterLinkActive,
    LanguageToggleComponent,
    FormatSelectorComponent,
    DialogHostComponent,
    ToastHostComponent,
    TranslatePipe,
    NavIconComponent,
    DuelFieldBackgroundComponent,
  ],
  template: `
    <div class="app-shell">
      <app-duel-field-bg />
      <a href="#main-content" class="skip-link">{{ 'studio.skip' | translate }}</a>
      <div class="app-shell-content">
        <header
          class="navbar studio-navbar"
        >
          <div class="flex-1 min-w-0">
            <a routerLink="/decklist" class="app-brand whitespace-nowrap"><span class="brand-seal" aria-hidden="true">✦</span>
              <span class="lg:hidden">{{ 'app.titleShort' | translate }}</span>
              <span class="hidden lg:inline">{{ 'app.title' | translate }}</span>
            </a>
          </div>

          <nav class="hidden lg:flex flex-none" [attr.aria-label]="'nav.main' | translate">
            <div  class="tabs tabs-box tabs-sm bg-base-200/80 p-0.5 rounded-lg">
              <a ariaCurrentWhenActive="page" routerLink="/decklist" routerLinkActive="tab-active" class="tab text-sm px-3">
                {{ 'nav.decklist' | translate }}
              </a>
              <a
                ariaCurrentWhenActive="page"
                routerLink="/"
                routerLinkActive="tab-active"
                [routerLinkActiveOptions]="{ exact: true }"
                class="tab text-sm px-3"
              >
                {{ 'nav.search' | translate }}
              </a>
              <a ariaCurrentWhenActive="page" routerLink="/overlay" routerLinkActive="tab-active" class="tab text-sm px-3">
                {{ 'nav.overlay' | translate }}
              </a>
              <a ariaCurrentWhenActive="page" routerLink="/combo" routerLinkActive="tab-active" class="tab text-sm px-3">
                {{ 'nav.combo' | translate }}
              </a>
              <a ariaCurrentWhenActive="page" routerLink="/flow" routerLinkActive="tab-active" class="tab text-sm px-3">
                {{ 'nav.flow' | translate }}
              </a>
            </div>
          </nav>

          <div class="hidden sm:block w-36 lg:w-44 shrink-0">
            <app-format-selector
              [inline]="true"
              [showLabel]="false"
              [formats]="formatStore.formats()"
              [selectedId]="formatStore.formatId()"
              (selectedChange)="formatStore.setFormatId($event)"
            />
          </div>

          <div class="flex-none">
            <app-language-toggle />
          </div>
        </header>

        <div id="main-content" tabindex="-1" class="flex-1 pb-[max(5.5rem,calc(4.75rem+env(safe-area-inset-bottom)))] lg:pb-0">
          <router-outlet />
          <footer class="studio-footer"><span>{{ 'studio.footer' | translate }}</span><span>{{ 'studio.fan' | translate }}</span></footer>
        </div>
      </div>

      <nav class="mobile-tab-bar lg:hidden" [attr.aria-label]="'nav.main' | translate">
        <a routerLink="/decklist" ariaCurrentWhenActive="page" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon"><app-nav-icon name="decklist" /></span>
          <span class="mobile-tab-label">{{ 'nav.decklist' | translate }}</span>
        </a>
        <a
          routerLink="/"
          ariaCurrentWhenActive="page" routerLinkActive="mobile-tab-active"
          [routerLinkActiveOptions]="{ exact: true }"
          class="mobile-tab"
        >
          <span class="mobile-tab-icon"><app-nav-icon name="search" /></span>
          <span class="mobile-tab-label">{{ 'nav.search' | translate }}</span>
        </a>
        <a routerLink="/overlay" ariaCurrentWhenActive="page" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon"><app-nav-icon name="overlay" /></span>
          <span class="mobile-tab-label">{{ 'nav.overlay' | translate }}</span>
        </a>
        <a routerLink="/combo" ariaCurrentWhenActive="page" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon"><app-nav-icon name="combo" /></span>
          <span class="mobile-tab-label">{{ 'nav.combo' | translate }}</span>
        </a>
        <a routerLink="/flow" ariaCurrentWhenActive="page" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon"><app-nav-icon name="flow" /></span>
          <span class="mobile-tab-label">{{ 'nav.flow' | translate }}</span>
        </a>
      </nav>

      <app-back-to-top />
      <app-dialog-host />
      <app-toast-host />
    </div>
  `,
})
export class AppShellComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly formatStore = inject(FormatStore);
}
