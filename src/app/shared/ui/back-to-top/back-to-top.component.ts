import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-back-to-top',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <button type="button" class="back-to-top btn btn-circle" [attr.aria-label]="'ux.backTop' | translate" [title]="'ux.backTop' | translate" (click)="scrollTop()">↑</button>
    }
  `,
})
export class BackToTopComponent {
  readonly visible = signal(window.scrollY > 650);
  constructor() {
    const zone = inject(NgZone);
    const onScroll = (): void => {
      const next = window.scrollY > 650;
      if (next !== this.visible()) zone.run(() => this.visible.set(next));
    };
    zone.runOutsideAngular(() => window.addEventListener('scroll', onScroll, { passive: true }));
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', onScroll));
  }
  scrollTop(): void {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
