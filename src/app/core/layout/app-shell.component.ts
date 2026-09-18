import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';
import { FormatSelectorComponent } from '../../components/format-selector/format-selector.component';
import { DialogHostComponent } from '../../components/dialog-host/dialog-host.component';
import { ToastHostComponent } from '../../components/toast-host/toast-host.component';
import { AuthButtonComponent } from '../../components/auth-button/auth-button.component';
import { I18nService } from '../../services/i18n.service';
import { FormatStore } from '../stores/format.store';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BackToTopComponent } from '../../shared/ui/back-to-top/back-to-top.component';
import { NavIconComponent, NavIconName } from '../../shared/ui/nav-icon/nav-icon.component';
import { DuelFieldBackgroundComponent } from '../../shared/ui/duel-field-bg/duel-field-bg.component';

interface ShellNavItem {
  path: string;
  labelKey: string;
  icon: NavIconName;
  exact?: boolean;
}

const SIDEBAR_EXPANDED_KEY = 'ygo.sidebar.expanded';

const SHELL_NAV: readonly ShellNavItem[] = [
  { path: '/decklist', labelKey: 'nav.decklist', icon: 'decklist' },
  { path: '/search', labelKey: 'nav.search', icon: 'search', exact: true },
  { path: '/overlay', labelKey: 'nav.overlay', icon: 'overlay' },
  { path: '/replay', labelKey: 'nav.replay', icon: 'replay' },
  { path: '/combo', labelKey: 'nav.combo', icon: 'combo' },
  { path: '/flow', labelKey: 'nav.flow', icon: 'flow' },
];

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
    AuthButtonComponent,
  ],
  template: `
    <div class="app-shell" [class.app-shell-sidebar-expanded]="sidebarExpanded()">
      <app-duel-field-bg />
      <a href="#main-content" class="skip-link">{{ 'studio.skip' | translate }}</a>

      <div class="app-shell-frame">
        <aside
          class="app-sidebar hidden lg:flex"
          [class.app-sidebar-expanded]="sidebarExpanded()"
          [attr.aria-label]="'nav.main' | translate"
        >
          <div class="app-sidebar-top">
            <a routerLink="/" class="app-sidebar-brand" [attr.title]="'app.title' | translate">
              <span class="brand-seal" aria-hidden="true">✦</span>
              @if (sidebarExpanded()) {
                <span class="app-sidebar-brand-text">{{ 'app.titleShort' | translate }}</span>
              }
            </a>
          </div>

          <nav class="app-sidebar-nav">
            @for (item of navItems; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive="app-sidebar-link-active"
                [routerLinkActiveOptions]="item.exact ? { exact: true } : { exact: false }"
                ariaCurrentWhenActive="page"
                class="app-sidebar-link"
                [attr.title]="sidebarExpanded() ? null : (item.labelKey | translate)"
              >
                <span class="app-sidebar-link-icon"><app-nav-icon [name]="item.icon" /></span>
                @if (sidebarExpanded()) {
                  <span class="app-sidebar-link-label">{{ item.labelKey | translate }}</span>
                }
              </a>
            }
          </nav>

          <div class="app-sidebar-footer">
            <button
              type="button"
              class="app-sidebar-toggle"
              (click)="toggleSidebar()"
              [attr.aria-expanded]="sidebarExpanded()"
              [attr.aria-label]="
                (sidebarExpanded() ? 'nav.collapseSidebar' : 'nav.expandSidebar') | translate
              "
              [attr.title]="
                (sidebarExpanded() ? 'nav.collapseSidebar' : 'nav.expandSidebar') | translate
              "
            >
              <svg
                class="h-4 w-4 transition-transform duration-200"
                [class.-scale-x-100]="!sidebarExpanded()"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
              @if (sidebarExpanded()) {
                <span>{{ 'nav.collapseSidebar' | translate }}</span>
              }
            </button>
          </div>
        </aside>

        <div class="app-shell-content">
          <header class="navbar studio-navbar">
            <div class="flex-1 min-w-0 lg:flex-none">
              <a routerLink="/" class="app-brand whitespace-nowrap lg:hidden">
                <span class="brand-seal" aria-hidden="true">✦</span>
                <span>{{ 'app.titleShort' | translate }}</span>
              </a>
            </div>

            <div class="flex-1 hidden lg:block" aria-hidden="true"></div>

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

            <div class="flex-none">
              <app-auth-button />
            </div>
          </header>

          <div
            id="main-content"
            tabindex="-1"
            class="flex-1 pb-[max(5.5rem,calc(4.75rem+env(safe-area-inset-bottom)))] lg:pb-0"
          >
            <router-outlet />
            <footer class="studio-footer">
              <span>{{ 'studio.footer' | translate }}</span>
              <span>{{ 'studio.fan' | translate }}</span>
            </footer>
          </div>
        </div>
      </div>

      <nav class="mobile-tab-bar lg:hidden" [attr.aria-label]="'nav.main' | translate">
        @for (item of navItems; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="mobile-tab-active"
            [routerLinkActiveOptions]="item.exact ? { exact: true } : { exact: false }"
            ariaCurrentWhenActive="page"
            class="mobile-tab"
            [attr.aria-label]="item.labelKey | translate"
          >
            <span class="mobile-tab-icon"><app-nav-icon [name]="item.icon" /></span>
            <span class="mobile-tab-label">{{ item.labelKey | translate }}</span>
          </a>
        }
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
  protected readonly navItems = SHELL_NAV;

  protected readonly sidebarExpanded = signal(readSidebarExpanded());

  protected toggleSidebar(): void {
    this.sidebarExpanded.update((open) => {
      const next = !open;
      try {
        localStorage.setItem(SIDEBAR_EXPANDED_KEY, next ? '1' : '0');
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }
}

function readSidebarExpanded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}
