import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { LoadingSkeletonComponent } from '../../../shared/ui/loading-skeleton/loading-skeleton.component';

@Component({
  selector: 'app-auth-callback-page',
  standalone: true,
  imports: [TranslatePipe, LoadingSkeletonComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-main page-stack max-w-lg mx-auto text-center">
      @if (error()) {
        <p class="text-error text-sm">{{ error() }}</p>
        <a class="btn btn-primary btn-sm mt-4" routerLink="/">{{ 'auth.callback.back' | translate }}</a>
      } @else {
        <app-loading-skeleton [rows]="2" rowClass="h-8 w-48 mx-auto" />
        <p class="text-sm text-base-content/65 mt-4">{{ 'auth.callback.loading' | translate }}</p>
      }
    </main>
  `,
})
export class AuthCallbackPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.auth.handleAuthCallback();
      await this.router.navigateByUrl('/decklist');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Auth callback failed');
    }
  }
}
