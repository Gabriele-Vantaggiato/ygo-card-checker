import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { YgoFormat } from '../../models/ygo-format.model';
import { I18nService } from '../../services/i18n.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-format-selector',
  standalone: true,
  imports: [FormsModule,
    TranslatePipe],
  template: `
    @if (compact()) {
      <label class="form-control w-full min-w-0">
        <span class="label py-0 pb-1.5">
          <span class="label-text text-xs font-semibold text-base-content/70">{{ 'format.label' | translate }}</span>
        </span>
        <select
          class="select select-bordered select-sm w-full"
          [ngModel]="selectedId()"
          (ngModelChange)="onSelect($event)"
        >
          @for (format of formats(); track format.id) {
            <option [ngValue]="format.id">{{ format.name[i18n.lang()] }}</option>
          }
        </select>
      </label>
    } @else {
      <label class="form-control w-full">
        <div class="label">
          <span class="label-text font-medium">{{ 'format.label' | translate }}</span>
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
    }
  `,
})
export class FormatSelectorComponent {
  readonly formats = input.required<YgoFormat[]>();
  readonly selectedId = input.required<string>();
  readonly compact = input(false);
  readonly selectedChange = output<string>();

  readonly selectedFormat = computed(() =>
    this.formats().find((f) => f.id === this.selectedId()),
  );

  constructor(protected readonly i18n: I18nService) {}

  onSelect(value: string): void {
    this.selectedChange.emit(value);
  }
}
