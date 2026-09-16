import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecklistCard } from '../../models/decklist.model';
import { LineEvidence } from '../../models/duel-line.model';
import { splitDeckIntoYdkeSections } from '../../services/ydke.service';
import { deckKey } from '../../utils/replay-lines';
import { ReplayLineMemoryService } from '../../services/replay-line-memory.service';
import { PasscodeCatalogService } from '../../services/passcode-catalog.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';

/** Surfaces what the replay engine already knows about this exact deck (main+extra), so
 *  uploading more replays for it feels worthwhile instead of a black box. */
@Component({
  selector: 'app-deck-replay-panel',
  standalone: true,
  imports: [TranslatePipe, DuelPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-panel panelClass="overflow-hidden flex flex-col">
      <div class="duel-panel-header flex flex-wrap items-center justify-between gap-2 normal-case tracking-normal">
        <span>{{ 'decklist.replays.title' | translate }}</span>
        @if (stats().games > 0) {
          <span class="badge badge-primary badge-xs font-normal">{{ stats().games }}</span>
        }
      </div>

      <div class="p-3 sm:p-4 space-y-3">
        @if (stats().games === 0) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'decklist.replays.empty' | translate }}</p>
        } @else {
          <dl class="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <dt class="text-[10px] uppercase tracking-wide text-base-content/45">{{ 'decklist.replays.wins' | translate }}</dt>
              <dd class="font-semibold text-success">{{ stats().wins }}</dd>
            </div>
            <div>
              <dt class="text-[10px] uppercase tracking-wide text-base-content/45">{{ 'decklist.replays.losses' | translate }}</dt>
              <dd class="font-semibold text-error">{{ stats().losses }}</dd>
            </div>
            <div>
              <dt class="text-[10px] uppercase tracking-wide text-base-content/45">{{ 'decklist.replays.unknown' | translate }}</dt>
              <dd class="font-semibold text-base-content/60">{{ stats().unknown }}</dd>
            </div>
          </dl>

          @if (topLines().length) {
            <div class="space-y-1.5">
              <p class="text-xs font-semibold text-base-content/70">{{ 'decklist.replays.topLines' | translate }}</p>
              <ul class="space-y-1.5">
                @for (line of topLines(); track $index) {
                  <li class="rounded-lg border border-base-300/40 bg-base-100/60 px-2.5 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs truncate">{{ lineLabel(line) }}</span>
                      <span class="badge badge-ghost badge-xs shrink-0 tabular-nums">
                        {{ 'decklist.replays.lineStat' | translate: { games: '' + line.games, pct: percent(line.winRate) } }}
                      </span>
                    </div>
                  </li>
                }
              </ul>
            </div>
          }

          <p class="text-[11px] text-base-content/50 leading-relaxed">{{ 'decklist.replays.hint' | translate }}</p>
        }
      </div>
    </app-duel-panel>
  `,
})
export class DeckReplayPanelComponent {
  readonly cards = input.required<readonly DecklistCard[]>();

  private readonly memory = inject(ReplayLineMemoryService);
  private readonly catalog = inject(PasscodeCatalogService);

  constructor() {
    void this.catalog.ensureLoaded$().subscribe();
  }

  private readonly key = computed(() => deckKey(splitDeckIntoYdkeSections(this.cards())));
  protected readonly stats = computed(() => this.memory.deckStats(this.key()));
  protected readonly topLines = computed(() =>
    this.memory.evidence(this.key()).filter((line) => line.games >= 2).slice(0, 3),
  );

  protected lineLabel(line: LineEvidence): string {
    return line.actions.map((a) => this.catalog.get(a.cardId)?.n ?? `#${a.cardId}`).join(' → ');
  }

  protected percent(rate: number | null): string {
    return rate == null ? '—' : `${Math.round(rate * 100)}%`;
  }
}
