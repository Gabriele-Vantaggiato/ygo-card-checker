import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CardBookmarksStore, DEFAULT_BOOKMARK_LIST_ID } from '../../core/stores/card-bookmarks.store';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

/** Bookmarked cards grouped in named lists; a bookmarked card can be added to the open deck in one click. */
@Component({
  selector: 'app-card-bookmarks-panel',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="rounded-lg border border-base-300/60 bg-base-200/30 min-w-0" [open]="open()" (toggle)="open.set($any($event.target).open)">
      <summary class="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center gap-2">
        <span aria-hidden="true">★</span>
        {{ 'bookmarks.title' | translate }}
        <span class="badge badge-ghost badge-sm tabular-nums">{{ store.bookmarkedIds().size }}</span>
      </summary>

      <div class="px-3 pb-3 space-y-2 min-w-0">
        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
          <select
            class="select select-bordered select-xs min-w-0 flex-1"
            [attr.aria-label]="'bookmarks.listLabel' | translate"
            [value]="store.activeListId()"
            (change)="store.setActiveList($any($event.target).value)"
          >
            @for (list of store.lists(); track list.id) {
              <option [value]="list.id" [selected]="list.id === store.activeListId()">{{ list.name }} ({{ list.cards.length }})</option>
            }
          </select>
          <button type="button" class="btn btn-ghost btn-xs" (click)="creating.set(!creating())">
            {{ 'bookmarks.newList' | translate }}
          </button>
          @if (store.activeListId() !== defaultId) {
            <button type="button" class="btn btn-ghost btn-xs text-error" (click)="store.deleteList(store.activeListId())">
              {{ 'bookmarks.deleteList' | translate }}
            </button>
          }
        </div>

        @if (creating()) {
          <form class="flex gap-1.5" (submit)="createList($event, nameInput.value); nameInput.value = ''">
            <input #nameInput type="text" maxlength="40" class="input input-bordered input-xs min-w-0 flex-1" [attr.aria-label]="'bookmarks.newListName' | translate" [placeholder]="'bookmarks.newListName' | translate" />
            <button type="submit" class="btn btn-primary btn-xs">{{ 'bookmarks.create' | translate }}</button>
          </form>
        }

        @if (store.activeList(); as list) {
          @if (list.cards.length === 0) {
            <p class="text-xs text-base-content/50 py-2">{{ 'bookmarks.empty' | translate }}</p>
          } @else {
            <ul class="max-h-52 overflow-y-auto overflow-x-hidden space-y-1">
              @for (card of list.cards; track card.id) {
                <li class="flex items-center gap-2 min-w-0 rounded-md px-1.5 py-1 hover:bg-base-200">
                  @if (card.imageUrlSmall) {
                    <img [src]="card.imageUrlSmall" alt="" class="w-6 h-9 object-cover rounded shrink-0" loading="lazy" />
                  }
                  <span class="min-w-0 flex-1 truncate text-sm" [title]="card.name">{{ card.name }}</span>
                  <button type="button" class="btn btn-outline btn-xs btn-square shrink-0" [attr.aria-label]="'decklist.editor.quickAdd' | translate" (click)="cardAdd.emit(card.id)">+</button>
                  <button type="button" class="btn btn-ghost btn-xs btn-square shrink-0" [attr.aria-label]="'bookmarks.remove' | translate" (click)="store.remove(card.id)">✕</button>
                </li>
              }
            </ul>
          }
        }
      </div>
    </details>
  `,
})
export class CardBookmarksPanelComponent {
  protected readonly store = inject(CardBookmarksStore);
  protected readonly defaultId = DEFAULT_BOOKMARK_LIST_ID;

  readonly cardAdd = output<number>();
  readonly open = signal(false);
  readonly creating = signal(false);

  createList(event: Event, name: string): void {
    event.preventDefault();
    if (this.store.createList(name)) this.creating.set(false);
  }
}
