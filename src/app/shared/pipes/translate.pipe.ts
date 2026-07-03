import { ChangeDetectorRef, Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../../services/i18n.service';

/**
 * Reactive translation pipe — re-evaluates when the active language changes.
 * Usage: `{{ 'search.placeholder' | translate }}` or `{{ 'key' | translate:{ name: 'Ash' } }}`
 */
@Pipe({
  name: 'translate',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  private readonly cdr = inject(ChangeDetectorRef);
  private lastLang = this.i18n.lang();

  transform(key: string, params?: Record<string, string>): string {
    const currentLang = this.i18n.lang();
    if (currentLang !== this.lastLang) {
      this.lastLang = currentLang;
      this.cdr.markForCheck();
    }
    return this.i18n.translate(key, params);
  }
}
