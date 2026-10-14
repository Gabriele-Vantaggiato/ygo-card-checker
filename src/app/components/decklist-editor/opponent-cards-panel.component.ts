import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { I18nService } from '../../services/i18n.service';
import { ReplayLineMemoryService } from '../../services/replay-line-memory.service';
import { YgoApiService } from '../../services/ygo-api.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';

interface OpponentCardRow {
  cardId: number;
  games: number;
  name: string;
  imageUrlSmall: string | null;
}

/** Cards that showed up in opponent decks across the recorded replays, ready to be sided against. */
@Component({
  selector: 'app-opponent-cards-panel',
  standalone: true,
  imports: [TranslatePipe, DuelPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-panel panelClass="overflow-hidden flex flex-col">
      <div class="duel-panel-header flex flex-wrap items-center justify-between gap-2 normal-case tracking-normal">
        <span>{{ 'opponent.title' | translate }}</span>
      </div>
      <div class="p-3 sm:p-4 space-y-2 min-w-0">
        @if (rows().length === 0) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'opponent.empty' | translate }}</p>
        } @else {
          <p class="text-xs text-base-content/50">{{ 'opponent.hint' | translate: { games: '' + gamesRecorded() } }}</p>
          <ul class="max-h-60 overflow-y-auto overflow-x-hidden space-y-1">
            @for (row of rows(); track row.cardId) {
              <li class="flex items-center gap-2 min-w-0 rounded-md px-1.5 py-1 hover:bg-base-200">
                @if (row.imageUrlSmall) {
                  <img [src]="row.imageUrlSmall" alt="" class="w-6 h-9 object-cover rounded shrink-0" loading="lazy" />
                }
                <span class="min-w-0 flex-1 truncate text-sm" [title]="row.name">{{ row.name }}</span>
                <span class="badge badge-ghost badge-xs shrink-0">{{ 'opponent.times' | translate: { games: '' + row.games } }}</span>
                <button type="button" class="btn btn-outline btn-xs btn-square shrink-0" [attr.aria-label]="'opponent.addSide' | translate" (click)="cardAdd.emit(row.cardId)">+</button>
              </li>
            }
          </ul>
        }
      </div>
    </app-duel-panel>
  `,
})
export class OpponentCardsPanelComponent {
  private readonly memory = inject(ReplayLineMemoryService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  readonly cardAdd = output<number>();
  readonly rows = signal<OpponentCardRow[]>([]);
  readonly gamesRecorded = computed(() => this.memory.opponentGamesRecorded());

  constructor() {
    effect(() => {
      this.memory.historyEntries();
      const stats = this.memory.opponentCardStats(15);
      if (stats.length === 0) {
        this.rows.set([]);
        return;
      }
      this.ygoApi
        .getCardsByIds$(stats.map((s) => s.cardId), this.i18n.lang())
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((cards) => {
          const byId = new Map(cards.map((card) => [card.id, card]));
          this.rows.set(
            stats.flatMap((stat) => {
              const card = byId.get(stat.cardId);
              return card
                ? [{ cardId: stat.cardId, games: stat.games, name: card.name, imageUrlSmall: card.card_images[0]?.image_url_small ?? null }]
                : [];
            }),
          );
        });
    });
  }
}
