import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { YgoFormat } from '../../models/ygo-format.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-format-selector',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label class="form-control w-full">
      <div class="label">
        <span class="label-text font-medium">{{ i18n.t('format.label') }}</span>
      </div>
      @if (formats().length > 0) {
        <select
          class="select select-bordered w-full"
          [ngModel]="selectedId()"
          (ngModelChange)="onSelect($event)"
        >
          @for (format of formats(); track format.id) {
            <option [ngValue]="format.id">{{ format.name[i18n.lang()] }}</option>
          }
        </select>
        @if (selectedFormat(); as format) {
          <div class="label">
            <span class="label-text-alt text-base-content/70 whitespace-normal break-words">
              {{ format.description[i18n.lang()] }}
            </span>
          </div>
        }
      }
    </label>
  `,
})
export class FormatSelectorComponent {
  readonly formats = input.required<YgoFormat[]>();
  readonly selectedId = input.required<string>();
  readonly selectedChange = output<string>();

  constructor(protected readonly i18n: I18nService) {}

  selectedFormat(): YgoFormat | undefined {
    return this.formats().find((f) => f.id === this.selectedId());
  }

  onSelect(value: string): void {
    this.selectedChange.emit(value);
  }
}
