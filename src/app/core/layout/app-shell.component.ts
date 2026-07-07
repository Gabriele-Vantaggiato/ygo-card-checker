import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';
import { FormatSelectorComponent } from '../../components/format-selector/format-selector.component';
import { DialogHostComponent } from '../../components/dialog-host/dialog-host.component';
import { ToastHostComponent } from '../../components/toast-host/toast-host.component';
import { I18nService } from '../../services/i18n.service';
import { FormatStore } from '../stores/format.store';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { NavIconComponent } from '../../shared/ui/nav-icon/nav-icon.component';
import { DuelFieldBackgroundComponent } from '../../shared/ui/duel-field-bg/duel-field-bg.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
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
    <app-duel-field-bg />
    <div class="app-shell-content">
      <header
        class="navbar bg-base-100/90 backdrop-blur-md border-b border-base-300/60 px-3 sm:px-4 sticky top-0 z-30 shadow-sm shadow-black/10 min-h-14 gap-2"
      >
        <div class="flex-1 min-w-0">
          <span class="app-brand whitespace-nowrap">
            <span class="md:hidden">{{ 'app.titleShort' | translate }}</span>
            <span class="hidden md:inline">{{ 'app.title' | translate }}</span>
          </span>
        </div>

        <nav class="hidden md:flex flex-none">
          <div role="tablist" class="tabs tabs-box tabs-sm bg-base-200/80 p-0.5 rounded-lg">
            <a
              role="tab"
              routerLink="/"
              routerLinkActive="tab-active"
              [routerLinkActiveOptions]="{ exact: true }"
              class="tab text-sm px-3"
            >
              {{ 'nav.search' | translate }}
            </a>
            <a role="tab" routerLink="/combo" routerLinkActive="tab-active" class="tab text-sm px-3">
              {{ 'nav.combo' | translate }}
            </a>
            <a role="tab" routerLink="/decklist" routerLinkActive="tab-active" class="tab text-sm px-3">
              {{ 'nav.decklist' | translate }}
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

      <div class="flex-1 pb-[4.75rem] md:pb-0">
        <router-outlet />
      </div>

      <nav
        class="mobile-tab-bar md:hidden"
        [attr.aria-label]="'nav.main' | translate"
      >
        <a
          routerLink="/"
          routerLinkActive="mobile-tab-active"
          [routerLinkActiveOptions]="{ exact: true }"
          class="mobile-tab"
        >
          <span class="mobile-tab-icon"><app-nav-icon name="search" /></span>
          <span class="mobile-tab-label">{{ 'nav.search' | translate }}</span>
        </a>
        <a routerLink="/combo" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon"><app-nav-icon name="combo" /></span>
          <span class="mobile-tab-label">{{ 'nav.combo' | translate }}</span>
        </a>
        <a routerLink="/decklist" routerLinkActive="mobile-tab-active" class="mobile-tab">
          <span class="mobile-tab-icon"><app-nav-icon name="decklist" /></span>
          <span class="mobile-tab-label">{{ 'nav.decklist' | translate }}</span>
        </a>
      </nav>

      <app-dialog-host />
      <app-toast-host />
    </div>
  `,
})
export class AppShellComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly formatStore = inject(FormatStore);
}
