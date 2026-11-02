import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ComboDiagramCard } from './combo-sheet.model';

@Component({
  selector: 'app-combo-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-center gap-2 py-3">
      @for (item of items(); track $index) {
        @if ($index > 0 && item.join !== 'none') {
          <span class="text-xl text-base-content/50" [attr.aria-label]="item.join">{{ item.join === 'plus' ? '+' : item.join === 'or' ? '/' : '→' }}</span>
        }
        <div class="w-24 text-center shrink-0">
          @if (item.group) { <p class="text-xs font-semibold mb-1">{{ item.group }}</p> }
          @if (item.card) {
            <a routerLink="/search" [queryParams]="{cardId: item.card}" [attr.aria-label]="names()[item.card] || ('Carta ' + item.card)">
              <img [src]="'https://images.ygoprodeck.com/images/cards_small/' + item.card + '.jpg'" alt="" loading="lazy" class="w-16 h-24 object-contain mx-auto rounded bg-base-300" (error)="$any($event.target).style.visibility = 'hidden'" />
              <span class="block text-xs font-medium mt-1 line-clamp-2">{{ names()[item.card] || ('#' + item.card) }}</span>
            </a>
          } @else {
            <div class="w-16 h-24 mx-auto rounded border border-dashed border-base-content/30 grid place-items-center text-2xl">?</div>
          }
          @if (item.caption || item.action !== 'none') { <p class="text-xs mt-1 text-base-content/70 whitespace-pre-wrap">{{ item.caption || item.action }}</p> }
          @if (item.zone && item.zone !== 'none') { <span class="text-[10px] uppercase text-base-content/50">{{ item.zone }}</span> }
        </div>
      }
    </div>
  `,
})
export class ComboDiagramComponent {
  readonly items = input<ComboDiagramCard[]>([]);
  readonly names = input<Record<number, string>>({});
}
