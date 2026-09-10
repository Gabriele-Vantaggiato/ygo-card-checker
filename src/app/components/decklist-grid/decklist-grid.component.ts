import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';
import { FormatStore } from '../../core/stores/format.store';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DecklistTileComponent } from './decklist-tile.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-grid',
  standalone: true,
  imports: [TranslatePipe, DecklistTileComponent, RouterLink],
  template: `
    <section class="library-page">
      <header class="duel-hero">
        <div class="duel-hero-copy">
          <p class="duel-eyebrow"><span class="duel-diamond" aria-hidden="true"></span> {{ 'studio.eyebrow' | translate }}</p>
          <h1>{{ 'studio.title' | translate }}<br><em>{{ 'studio.titleAccent' | translate }}</em></h1>
          <p class="duel-hero-description">{{ 'studio.description' | translate }}</p>
          <div class="flex flex-wrap gap-3 mt-6">
            <button type="button" class="btn btn-primary gap-3" (click)="createRequested.emit()"><span aria-hidden="true">＋</span>{{ 'decklist.create.button' | translate }}</button>
            <a routerLink="/search" class="btn btn-ghost gap-3">{{ 'studio.explore' | translate }} <span aria-hidden="true">↗</span></a>
          </div>
          <p class="duel-hero-note"><span aria-hidden="true">◇</span> {{ 'studio.localNote' | translate }}</p>
        </div>
        <div class="duel-hero-art" aria-hidden="true">
          <div class="duel-sigil"><span>✦</span></div>
          <div class="hero-card hero-card-left"><img src="https://images.ygoprodeck.com/images/cards/46986414.jpg" alt="" width="421" height="614" fetchpriority="low" (error)="hideBrokenArt($event)"></div>
          <div class="hero-card hero-card-right"><img src="https://images.ygoprodeck.com/images/cards/84013237.jpg" alt="" width="421" height="614" fetchpriority="low" (error)="hideBrokenArt($event)"></div>
          <div class="hero-card hero-card-center"><img src="https://images.ygoprodeck.com/images/cards/89631139.jpg" alt="" width="421" height="614" fetchpriority="low" (error)="hideBrokenArt($event)"></div>
          <span class="hero-art-caption">THE HEART OF THE CARDS</span>
        </div>
      </header>

      <div class="studio-tool-links">
        <a routerLink="/search" class="studio-tool-link"><span class="studio-tool-number">01</span><div><strong>{{ 'studio.searchTitle' | translate }}</strong><span>{{ 'studio.searchHint' | translate }}</span></div><span aria-hidden="true">↗</span></a>
        <a routerLink="/overlay" class="studio-tool-link"><span class="studio-tool-number">02</span><div><strong>{{ 'studio.overlayTitle' | translate }}</strong><span>{{ 'studio.overlayHint' | translate }}</span></div><span aria-hidden="true">↗</span></a>
        <a routerLink="/flow" class="studio-tool-link"><span class="studio-tool-number">03</span><div><strong>{{ 'studio.flowTitle' | translate }}</strong><span>{{ 'studio.flowHint' | translate }}</span></div><span aria-hidden="true">↗</span></a>
      </div>

      <section class="library-collection" aria-labelledby="collection-title">
        <div class="library-heading">
          <div><p class="duel-eyebrow">{{ 'studio.collectionEyebrow' | translate }}</p><h2 id="collection-title">{{ 'studio.collectionTitle' | translate }} <span class="library-count">{{ decklistStore.decklists().length }}</span></h2></div>
          <div class="library-controls">
            <label class="input library-filter"><span aria-hidden="true">⌕</span><input type="search" [value]="query()" (input)="query.set($any($event.target).value)" [placeholder]="'studio.filter' | translate" [attr.aria-label]="'studio.filter' | translate"></label>
            <select class="select" [value]="sort()" (change)="setSort($any($event.target).value)" [attr.aria-label]="'studio.sort' | translate"><option value="recent">{{ 'studio.recent' | translate }}</option><option value="name">{{ 'studio.name' | translate }}</option><option value="size">{{ 'studio.size' | translate }}</option></select>
          </div>
        </div>
        @if (decklistStore.decklists().length === 0) {
          <div class="library-empty">
            <div class="empty-deck-emblem" aria-hidden="true"><span>✦</span></div>
            <div><h3>{{ 'studio.emptyTitle' | translate }}</h3><p>{{ 'studio.emptyHint' | translate }}</p></div>
            <button type="button" class="btn btn-outline" (click)="createRequested.emit()">{{ 'studio.firstDeck' | translate }} <span aria-hidden="true">→</span></button>
          </div>
        } @else {
          <div class="library-grid">
            @for (deck of visibleDecks(); track deck.id) {
              <button type="button" class="deck-grid-item aspect-[4/5] rounded-xl transition-transform duration-200 hover:-translate-y-1" [class.deck-grid-item-active]="deck.id === decklistStore.activeDecklistId()" (click)="deckSelected.emit(deck.id)">
                <app-decklist-tile [deck]="deck" [cardCount]="decklistStore.totalCardsForDeck(deck.id)" [formatLabel]="selectedFormatLabel()" />
              </button>
            } @empty {
              <div class="library-no-results" role="status"><p>{{ 'studio.noDecks' | translate }}</p><button class="btn btn-ghost mt-2" type="button" (click)="query.set('')">{{ 'studio.clearFilter' | translate }}</button></div>
            }
            @if (!query().trim()) {
              <button type="button" class="deck-create-tile" (click)="createRequested.emit()"><span class="deck-create-icon" aria-hidden="true">＋</span><span>{{ 'decklist.grid.add' | translate }}</span></button>
            }
          </div>
        }
      </section>
    </section>
  `,
})
export class DecklistGridComponent {
  readonly deckSelected = output<string>();
  readonly createRequested = output<void>();
  protected readonly decklistStore = inject(DecklistStore);
  protected readonly formatStore = inject(FormatStore);
  protected readonly i18n = inject(I18nService);
  readonly query = signal('');
  readonly sort = signal<'recent' | 'name' | 'size'>('recent');
  readonly visibleDecks = computed(() => {
    const query = this.query().trim().toLocaleLowerCase(this.i18n.lang());
    return this.decklistStore.decklists().filter(deck => deck.name.toLocaleLowerCase(this.i18n.lang()).includes(query)).sort((a,b) => {
      if (this.sort() === 'name') return a.name.localeCompare(b.name, this.i18n.lang());
      if (this.sort() === 'size') return b.cards.reduce((n,c) => n+c.quantity,0) - a.cards.reduce((n,c) => n+c.quantity,0);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  });
  readonly selectedFormatLabel = computed(() => {
    const format = this.formatStore.selectedFormat();
    return format ? format.name[this.i18n.lang()] : '—';
  });
  setSort(value: string): void { if (value === 'recent' || value === 'name' || value === 'size') this.sort.set(value); }
  hideBrokenArt(event: Event): void { (event.target as HTMLImageElement).style.display = 'none'; }
}
