import { Component, inject } from '@angular/core';
import { I18nService, Lang } from '../../services/i18n.service';

@Component({
  selector: 'app-language-toggle',
  standalone: true,
  template: `
    <div class="join">
      @for (option of options; track option) {
        <button
          type="button"
          class="btn btn-sm join-item"
          [class.btn-primary]="i18n.lang() === option"
          [class.btn-ghost]="i18n.lang() !== option"
          (click)="setLang(option)"
        >
          {{ i18n.t('lang.' + option) }}
        </button>
      }
    </div>
  `,
})
export class LanguageToggleComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly options: Lang[] = ['it', 'en'];

  setLang(lang: Lang): void {
    this.i18n.setLang(lang);
  }
}
