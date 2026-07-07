import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2 px-2 py-3" role="status" [attr.aria-label]="'search.loading' | translate">
      @for (row of rowIndices(); track row) {
        <div class="skeleton rounded-lg" [class]="rowClass()"></div>
      }
    </div>
  `,
})
export class LoadingSkeletonComponent {
  readonly rows = input(3);
  readonly rowClass = input('h-11 w-full');

  protected readonly rowIndices = computed(() =>
    Array.from({ length: Math.max(1, this.rows()) }, (_, index) => index),
  );
}
