import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../features/auth/services/auth.service';
import { AuthStore } from '../../features/auth/stores/auth.store';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-auth-menu',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.isAuthenticated()) {
      <div class="dropdown dropdown-end">
        <button
          type="button"
          tabindex="0"
          class="btn btn-ghost btn-sm btn-circle avatar placeholder"
          [attr.aria-label]="'auth.menu.account' | translate"
        >
          @if (store.avatarUrl(); as avatar) {
            <div class="w-8 rounded-full">
              <img [src]="avatar" [alt]="store.displayLabel() ?? ''" />
            </div>
          } @else {
            <div class="bg-primary/20 text-primary w-8 rounded-full flex items-center justify-center text-xs font-bold">
              {{ initials() }}
            </div>
          }
        </button>
        <ul
          tabindex="0"
          class="dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-2 shadow-lg border border-base-300 mt-2"
        >
          <li class="menu-title text-xs truncate px-2">{{ store.displayLabel() }}</li>
          <li>
            <a routerLink="/profile">{{ 'profile.open' | translate }}</a>
          </li>
          <li>
            <button type="button" class="text-error" [disabled]="store.loading()" (click)="signOut()">
              {{ 'auth.signOut' | translate }}
            </button>
          </li>
        </ul>
      </div>
    } @else if (auth.enabled()) {
      <div class="dropdown dropdown-end">
        <button type="button" tabindex="0" class="btn btn-outline btn-sm" [disabled]="store.loading()">
          {{ 'auth.signIn' | translate }}
        </button>
        <ul
          tabindex="0"
          class="dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-2 shadow-lg border border-base-300 mt-2"
        >
          <li>
            <button type="button" (click)="signIn('google')">{{ 'auth.provider.google' | translate }}</button>
          </li>
          <li>
            <button type="button" (click)="signIn('discord')">{{ 'auth.provider.discord' | translate }}</button>
          </li>
          <li>
            <a routerLink="/profile">{{ 'profile.setupLocal' | translate }}</a>
          </li>
        </ul>
      </div>
    } @else {
      <a routerLink="/profile" class="btn btn-outline btn-sm">{{ 'profile.open' | translate }}</a>
    }
  `,
})
export class AuthMenuComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(AuthStore);

  initials(): string {
    const label = this.store.displayLabel() ?? '?';
    return label.trim().charAt(0).toUpperCase();
  }

  signIn(provider: 'google' | 'discord'): void {
    void this.auth.signInWithProvider(provider);
  }

  signOut(): void {
    void this.auth.signOut().then(() => this.router.navigateByUrl('/'));
  }
}
