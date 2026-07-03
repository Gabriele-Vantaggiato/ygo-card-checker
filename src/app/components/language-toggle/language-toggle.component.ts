import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService, Lang } from '../../services/i18n.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-language-toggle',
  standalone: true,
  imports: [TranslatePipe],
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
          {{ 'lang.' + option | translate }}
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
