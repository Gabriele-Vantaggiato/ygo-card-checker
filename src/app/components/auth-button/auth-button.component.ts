import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

/**
 * Profile / auth control: desktop avatar dropdown, mobile circle link.
 * Login dialog uses native <dialog> + `duel-modal` (same pattern as add-to-decklist).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-auth-button',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    @if (loggedIn()) {
      <!-- Desktop: avatar dropdown -->
      <div class="dropdown dropdown-end hidden lg:block">
        <button
          type="button"
          tabindex="0"
          class="btn btn-ghost btn-circle profile-avatar"
          [attr.aria-label]="'auth.profileMenu' | translate"
        >
          @if (avatarUrl(); as url) {
            <img [src]="url" alt="" class="profile-avatar-img" width="36" height="36" />
          } @else {
            <span class="profile-avatar-initial" aria-hidden="true">{{ initials() }}</span>
          }
        </button>
        <ul
          tabindex="0"
          class="dropdown-content menu bg-base-100 rounded-box z-50 mt-2 w-56 border border-base-300/80 p-2 shadow-lg shadow-black/40"
        >
          <li class="menu-title px-3 py-1">
            <span class="truncate text-xs font-normal normal-case tracking-normal text-base-content/60">
              {{ email() }}
            </span>
          </li>
          <li>
            <a routerLink="/profile">{{ 'auth.profile' | translate }}</a>
          </li>
          <li>
            <button type="button" (click)="signOut()">{{ 'auth.logout' | translate }}</button>
          </li>
        </ul>
      </div>

      <!-- Mobile: circle → profile -->
      <a
        routerLink="/profile"
        class="btn btn-ghost btn-circle profile-avatar lg:hidden"
        [attr.aria-label]="'auth.profile' | translate"
      >
        @if (avatarUrl(); as url) {
          <img [src]="url" alt="" class="profile-avatar-img" width="36" height="36" />
        } @else {
          <span class="profile-avatar-initial" aria-hidden="true">{{ initials() }}</span>
        }
      </a>
    } @else {
      <button
        type="button"
        class="btn btn-ghost btn-circle profile-avatar"
        [attr.aria-label]="'auth.login' | translate"
        (click)="open.set(true)"
      >
        <svg
          class="h-5 w-5 text-base-content/70"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 19.5c1.8-3.2 4-4.5 6.5-4.5s4.7 1.3 6.5 4.5" />
        </svg>
      </button>
    }

    <dialog #dialogEl class="modal p-0 border-0 bg-transparent shadow-none" (close)="onNativeClose()">
      <div class="modal-box duel-modal max-w-sm">
        <h3 class="font-display text-lg font-bold mb-4">
          {{ (mode() === 'signup' ? 'auth.signupTitle' : 'auth.loginTitle') | translate }}
        </h3>

        <button type="button" class="btn btn-outline w-full mb-3 gap-2" (click)="signInWithGoogle()">
          <svg viewBox="0 0 48 48" class="w-4 h-4" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.02l7.73 6c4.51-4.18 7.09-10.36 7.09-17.49z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.75-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.92 7.52 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.92-2.14 15.89-5.82l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          {{ 'auth.continueGoogle' | translate }}
        </button>
        <div class="divider text-xs text-base-content/50 my-2">{{ 'auth.or' | translate }}</div>

        <div class="space-y-2">
          <input
            class="input input-bordered w-full"
            type="email"
            [placeholder]="'auth.email' | translate"
            [(ngModel)]="emailInput"
            name="email"
          />
          <input
            class="input input-bordered w-full"
            type="password"
            [placeholder]="'auth.password' | translate"
            [(ngModel)]="password"
            name="password"
          />
        </div>

        @if (errorMessage()) {
          <p class="text-error text-sm mt-2">{{ errorMessage() }}</p>
        }

        <button
          type="button"
          class="btn btn-primary w-full mt-3"
          [disabled]="submitting()"
          (click)="submit()"
        >
          @if (submitting()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          {{ (mode() === 'signup' ? 'auth.signup' : 'auth.login') | translate }}
        </button>

        <button type="button" class="btn btn-link btn-sm w-full mt-1" (click)="toggleMode()">
          {{ (mode() === 'signup' ? 'auth.hasAccount' : 'auth.needAccount') | translate }}
        </button>

        <div class="modal-action mt-2">
          <button type="button" class="btn btn-sm btn-ghost" (click)="close()">
            {{ 'common.close' | translate }}
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class AuthButtonComponent {
  protected readonly authService = inject(AuthService);
  private readonly dialogEl = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  private readonly session = toSignal(this.authService.session$, { initialValue: null });

  protected readonly loggedIn = computed(() => this.session() !== null);
  protected readonly email = computed(() => this.session()?.user?.email ?? '');
  protected readonly initials = computed(() => {
    const value = this.email();
    return value ? value.charAt(0).toUpperCase() : '?';
  });
  protected readonly avatarUrl = computed(() => {
    const meta = this.session()?.user?.user_metadata as Record<string, unknown> | undefined;
    const url = meta?.['avatar_url'] ?? meta?.['picture'];
    return typeof url === 'string' && url.length > 0 ? url : null;
  });

  protected readonly open = signal(false);
  protected readonly mode = signal<'login' | 'signup'>('login');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected emailInput = '';
  protected password = '';

  constructor() {
    effect(() => {
      const dialog = this.dialogEl()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (this.open() && !dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  protected onNativeClose(): void {
    this.open.set(false);
    this.errorMessage.set(null);
  }

  protected toggleMode(): void {
    this.mode.set(this.mode() === 'login' ? 'signup' : 'login');
    this.errorMessage.set(null);
  }

  protected close(): void {
    this.open.set(false);
    this.errorMessage.set(null);
  }

  protected async submit(): Promise<void> {
    if (!this.emailInput || !this.password) {
      this.errorMessage.set('Email e password sono obbligatorie.');
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    const result =
      this.mode() === 'signup'
        ? await this.authService.signUpWithPassword(this.emailInput, this.password)
        : await this.authService.signInWithPassword(this.emailInput, this.password);

    this.submitting.set(false);
    if (result.ok) {
      this.close();
    } else {
      this.errorMessage.set(result.errorMessage ?? 'Errore sconosciuto.');
    }
  }

  protected async signInWithGoogle(): Promise<void> {
    const result = await this.authService.signInWithGoogle();
    if (!result.ok) {
      this.errorMessage.set(result.errorMessage ?? 'Errore Google login.');
    }
  }

  protected async signOut(): Promise<void> {
    await this.authService.signOut();
  }
}
