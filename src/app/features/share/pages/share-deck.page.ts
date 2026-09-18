import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { supabase } from '../../../core/supabase-client';
import { DecklistCard, DeckSection } from '../../../models/decklist.model';

interface SharedDeck {
  name: string;
  cards: DecklistCard[];
  updatedAt: string;
}

type ShareViewState = 'loading' | 'not-found' | 'found';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-share-deck-page',
  standalone: true,
  imports: [],
  template: `
    <main class="page-main page-stack max-w-3xl lg:max-w-4xl fade-in-panel">
      @if (state() === 'loading') {
        <div class="flex items-center justify-center py-16">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else if (state() === 'not-found') {
        <div class="empty-state py-16 text-center">
          <p class="empty-state-title">Deck not found or no longer shared</p>
          <p class="empty-state-hint text-sm text-base-content/60">
            This link may be invalid, or the deck is no longer publicly shared.
          </p>
        </div>
      } @else if (deck(); as d) {
        <header class="page-header">
          <div class="space-y-0.5 min-w-0">
            <h1 class="page-title">{{ d.name }}</h1>
            <p class="page-subtitle">Shared deck · read-only</p>
          </div>
        </header>

        @if (mainCards().length > 0) {
          <section class="space-y-2">
            <h2 class="section-title">Main Deck</h2>
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              @for (card of mainCards(); track card.id) {
                <li class="flex items-center gap-3 rounded-lg border border-base-300/60 p-2 min-w-0">
                  @if (card.imageUrlSmall) {
                    <img [src]="card.imageUrlSmall" [alt]="card.name" class="w-12 rounded shrink-0" loading="lazy" />
                  }
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{{ card.name }}</p>
                    <p class="text-xs text-base-content/60">x{{ card.quantity }}</p>
                  </div>
                </li>
              }
            </ul>
          </section>
        }

        @if (extraCards().length > 0) {
          <section class="space-y-2">
            <h2 class="section-title">Extra Deck</h2>
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              @for (card of extraCards(); track card.id) {
                <li class="flex items-center gap-3 rounded-lg border border-base-300/60 p-2 min-w-0">
                  @if (card.imageUrlSmall) {
                    <img [src]="card.imageUrlSmall" [alt]="card.name" class="w-12 rounded shrink-0" loading="lazy" />
                  }
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{{ card.name }}</p>
                    <p class="text-xs text-base-content/60">x{{ card.quantity }}</p>
                  </div>
                </li>
              }
            </ul>
          </section>
        }

        @if (sideCards().length > 0) {
          <section class="space-y-2">
            <h2 class="section-title">Side Deck</h2>
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              @for (card of sideCards(); track card.id) {
                <li class="flex items-center gap-3 rounded-lg border border-base-300/60 p-2 min-w-0">
                  @if (card.imageUrlSmall) {
                    <img [src]="card.imageUrlSmall" [alt]="card.name" class="w-12 rounded shrink-0" loading="lazy" />
                  }
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{{ card.name }}</p>
                    <p class="text-xs text-base-content/60">x{{ card.quantity }}</p>
                  </div>
                </li>
              }
            </ul>
          </section>
        }
      }
    </main>
  `,
})
export class ShareDeckPage {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<ShareViewState>('loading');
  readonly deck = signal<SharedDeck | null>(null);

  readonly mainCards = computed(() => this.cardsInSection('main'));
  readonly extraCards = computed(() => this.cardsInSection('extra'));
  readonly sideCards = computed(() => this.cardsInSection('side'));

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const slug = params.get('slug');
      if (!slug) {
        this.deck.set(null);
        this.state.set('not-found');
        return;
      }
      void this.loadDeck(slug);
    });
  }

  private async loadDeck(slug: string): Promise<void> {
    this.state.set('loading');
    this.deck.set(null);

    const { data, error } = await supabase
      .from('decks')
      .select('name, cards, updated_at')
      .eq('share_slug', slug)
      .eq('is_public', true)
      .single();

    if (error || !data) {
      this.state.set('not-found');
      return;
    }

    this.deck.set({
      name: data.name,
      cards: (data.cards ?? []) as DecklistCard[],
      updatedAt: data.updated_at,
    });
    this.state.set('found');
  }

  private cardsInSection(section: DeckSection): DecklistCard[] {
    const cards = this.deck()?.cards ?? [];
    return cards.filter((card) => (card.section ?? 'main') === section);
  }
}
