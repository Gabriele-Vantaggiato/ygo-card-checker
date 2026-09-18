import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

/**
 * Minimal login/signup/logout widget (daisyUI classes, matching the rest of the app).
 * Not wired into app-shell nav yet — app-shell.component.ts has unrelated in-progress
 * landing redesign edits; drop <app-auth-button /> wherever the nav lands once that
 * settles, to avoid clobbering that work.
 */
@Component({
  selector: 'app-auth-button',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (authService.isLoggedIn()) {
      <div class="flex items-center gap-2">
        <span class="text-sm opacity-70">{{ authService.currentUser?.email }}</span>
        <button class="btn btn-sm btn-ghost" (click)="signOut()">Logout</button>
      </div>
    } @else {
      <button class="btn btn-sm btn-primary" (click)="open.set(true)">Login</button>
    }

    @if (open()) {
      <div class="modal modal-open">
        <div class="modal-box max-w-sm">
          <h3 class="font-bold text-lg mb-4">{{ mode() === 'signup' ? 'Crea account' : 'Accedi' }}</h3>

          <button class="btn btn-outline w-full mb-3" (click)="signInWithGoogle()">Continua con Google</button>
          <div class="divider text-xs opacity-60">oppure</div>

          <input
            class="input input-bordered w-full mb-2"
            type="email"
            placeholder="Email"
            [(ngModel)]="email"
            name="email"
          />
          <input
            class="input input-bordered w-full mb-2"
            type="password"
            placeholder="Password"
            [(ngModel)]="password"
            name="password"
          />

          @if (errorMessage()) {
            <p class="text-error text-sm mb-2">{{ errorMessage() }}</p>
          }

          <button class="btn btn-primary w-full" [disabled]="submitting()" (click)="submit()">
            {{ mode() === 'signup' ? 'Registrati' : 'Accedi' }}
          </button>

          <button class="btn btn-link btn-sm mt-2" (click)="toggleMode()">
            {{ mode() === 'signup' ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati' }}
          </button>

          <div class="modal-action">
            <button class="btn btn-sm" (click)="close()">Chiudi</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AuthButtonComponent {
  protected readonly authService = inject(AuthService);

  protected readonly open = signal(false);
  protected readonly mode = signal<'login' | 'signup'>('login');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected email = '';
  protected password = '';

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
