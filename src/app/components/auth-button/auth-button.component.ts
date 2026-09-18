import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * Login/signup/logout widget. The dialog follows the same pattern as
 * add-to-decklist-dialog.component.ts: a native <dialog> driven imperatively via
 * showModal()/close() (not a plain `<div class="modal modal-open">`, which renders
 * without daisyUI's backdrop/centering in this app's daisyUI 5 setup) with the
 * shared `duel-modal` box styling for visual consistency with the rest of the app.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-auth-button',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    @if (authService.isLoggedIn()) {
      <div class="flex items-center gap-2">
        <a routerLink="/profile" class="btn btn-sm btn-ghost">Profilo</a>
        <span class="text-sm text-base-content/70 max-w-[10rem] truncate hidden sm:inline">{{ authService.currentUser?.email }}</span>
        <button class="btn btn-sm btn-ghost" (click)="signOut()">Logout</button>
      </div>
    } @else {
      <button class="btn btn-sm btn-primary" (click)="open.set(true)">Login</button>
    }

    <dialog #dialogEl class="modal p-0 border-0 bg-transparent shadow-none" (close)="onNativeClose()">
      <div class="modal-box duel-modal max-w-sm">
        <h3 class="font-display text-lg font-bold mb-4">
          {{ mode() === 'signup' ? 'Crea account' : 'Accedi' }}
        </h3>

        <button type="button" class="btn btn-outline w-full mb-3 gap-2" (click)="signInWithGoogle()">
          <svg viewBox="0 0 48 48" class="w-4 h-4" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.02l7.73 6c4.51-4.18 7.09-10.36 7.09-17.49z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.75-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.92 7.52 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.92-2.14 15.89-5.82l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continua con Google
        </button>
        <div class="divider text-xs text-base-content/50 my-2">oppure</div>

        <div class="space-y-2">
          <input
            class="input input-bordered w-full"
            type="email"
            placeholder="Email"
            [(ngModel)]="email"
            name="email"
          />
          <input
            class="input input-bordered w-full"
            type="password"
            placeholder="Password"
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
          {{ mode() === 'signup' ? 'Registrati' : 'Accedi' }}
        </button>

        <button type="button" class="btn btn-link btn-sm w-full mt-1" (click)="toggleMode()">
          {{ mode() === 'signup' ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati' }}
        </button>

        <div class="modal-action mt-2">
          <button type="button" class="btn btn-sm btn-ghost" (click)="close()">Chiudi</button>
        </div>
      </div>
    </dialog>
  `,
})
export class AuthButtonComponent {
  protected readonly authService = inject(AuthService);
  private readonly dialogEl = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  protected readonly open = signal(false);
  protected readonly mode = signal<'login' | 'signup'>('login');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected email = '';
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

  /** Fires when the user dismisses the native <dialog> itself (Esc key, backdrop click). */
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
    if (!this.email || !this.password) {
      this.errorMessage.set('Email e password sono obbligatorie.');
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    const result =
      this.mode() === 'signup'
        ? await this.authService.signUpWithPassword(this.email, this.password)
        : await this.authService.signInWithPassword(this.email, this.password);

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
