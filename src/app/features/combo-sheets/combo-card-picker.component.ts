import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { PasscodeCatalogService } from '../../services/passcode-catalog.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-combo-card-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mt-2">
      <label class="text-xs block">{{ label() }}
        <input type="search" class="input input-sm w-full mt-1" [value]="query()" (input)="query.set($any($event.target).value)" [placeholder]="italian() ? 'Cerca per nome inglese o passcode…' : 'Search English name or passcode…'" />
      </label>
      @if (query().trim().length >= 2) {
        <div class="border border-base-300 rounded-lg mt-1 max-h-48 overflow-y-auto">
          @for (card of results(); track card.i) {
            <button type="button" class="block w-full text-left text-xs p-2 hover:bg-base-200 border-b border-base-300" (click)="picked.emit(card.i)">+ {{ card.n }}</button>
          } @empty { <p class="text-xs p-2 text-base-content/60">{{ italian() ? 'Nessun risultato nel catalogo locale.' : 'No matches in the local catalog.' }}</p> }
        </div>
      }
    </div>
  `,
})
export class ComboCardPickerComponent {
  readonly label = input('Aggiungi carta');
  readonly picked = output<number>();
  readonly query = signal('');
  private readonly catalog = toSignal(inject(PasscodeCatalogService).ensureLoaded$());
  private readonly i18n = inject(I18nService);
  readonly italian = computed(() => this.i18n.lang() === 'it');
  readonly results = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (query.length < 2) return [];
    return [...(this.catalog()?.values() ?? [])].filter(c => c.n.toLowerCase().includes(query) || String(c.i) === query).slice(0, 12);
  });
}
