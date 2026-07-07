import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, of, Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FavoriteCardRef } from '../models/community.model';
import { CardSearchFacade } from '../../../services/card-search.facade';
import { I18nService } from '../../../services/i18n.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-favorite-card-picker',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <label class="form-control">
        <span class="label-text text-xs">{{ 'profile.favoriteCard' | translate }}</span>
        <input
          class="input input-bordered input-sm"
          name="favoriteSearch"
          [(ngModel)]="query"
          (ngModelChange)="onQueryChange($event)"
          [placeholder]="'profile.favoriteCardPlaceholder' | translate"
        />
      </label>

      @if (selected(); as card) {
        <div class="flex items-center gap-2 rounded-lg border border-base-300/60 p-2">
          @if (card.imageUrlSmall) {
            <img class="h-12 w-8 object-cover rounded" [src]="card.imageUrlSmall" [alt]="card.name" />
          }
          <span class="text-sm flex-1 truncate">{{ card.name }}</span>
          <button type="button" class="btn btn-ghost btn-xs" (click)="clear()">
            {{ 'profile.favoriteCardClear' | translate }}
          </button>
        </div>
      }

      @if (results().length > 0) {
        <ul class="max-h-40 overflow-y-auto rounded-lg border border-base-300/60 divide-y divide-base-300/40">
          @for (card of results(); track card.id) {
            <li>
              <button
                type="button"
                class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-base-200/60 text-left"
                (click)="pick(card.id, card.name, card.card_images[0]?.image_url_small ?? null)"
              >
                @if (card.card_images[0]?.image_url_small; as thumb) {
                  <img class="h-10 w-7 object-cover rounded shrink-0" [src]="thumb" [alt]="" />
                }
                <span class="text-sm truncate">{{ card.name }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class FavoriteCardPickerComponent {
  private readonly search = inject(CardSearchFacade);
  private readonly i18n = inject(I18nService);
  private readonly query$ = new Subject<string>();

  readonly value = input<FavoriteCardRef | null>(null);
  readonly valueChange = output<FavoriteCardRef | null>();

  query = '';
  readonly selected = signal<FavoriteCardRef | null>(null);
  readonly results = signal<
    { id: number; name: string; card_images: { image_url_small: string }[] }[]
  >([]);

  constructor() {
    const initial = this.value();
    if (initial) {
      this.selected.set(initial);
    }

    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.trim().length < 2) {
            return of([]);
          }
          return this.search.searchAutocomplete$(q, this.i18n.lang());
        }),
        takeUntilDestroyed(),
      )
      .subscribe((cards) => this.results.set(cards));
  }

  onQueryChange(value: string): void {
    this.query$.next(value);
  }

  pick(id: number, name: string, imageUrlSmall: string | null): void {
    const ref: FavoriteCardRef = { id, name, imageUrlSmall };
    this.selected.set(ref);
    this.results.set([]);
    this.query = '';
    this.valueChange.emit(ref);
  }

  clear(): void {
    this.selected.set(null);
    this.valueChange.emit(null);
  }
}
