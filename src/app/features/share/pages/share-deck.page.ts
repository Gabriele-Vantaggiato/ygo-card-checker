import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DecklistCard, DeckSection } from '../../../models/decklist.model';
import { AuthService } from '../../../services/auth.service';
import { DeckMessage, ProfileService, PublicDeck } from '../../../services/profile.service';
import { decklistToYdkeUrl } from '../../../services/ydke.service';

type ShareViewState = 'loading' | 'not-found' | 'found';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-share-deck-page',
  standalone: true,
  imports: [FormsModule],
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
          <div class="flex items-center gap-3 min-w-0">
            @if (coverImageUrl(); as coverUrl) {
              <img [src]="coverUrl" [alt]="d.name" class="w-14 rounded shrink-0" loading="lazy" />
            }
            <div class="space-y-0.5 min-w-0">
              <h1 class="page-title">{{ d.name }}</h1>
              <p class="page-subtitle">Shared deck · read-only{{ d.format ? ' · ' + d.format : '' }}</p>
            </div>
          </div>
        </header>

        <section class="space-y-2">
          <h2 class="section-title">YDKE</h2>
          <div class="flex items-center gap-2 min-w-0">
            <code class="flex-1 min-w-0 truncate rounded-lg border border-base-300/60 px-3 py-2 text-xs">{{
              ydkeUrl()
            }}</code>
            <button type="button" class="btn btn-sm shrink-0" (click)="copyYdke()">
              {{ copied() ? 'Copiato!' : 'Copia' }}
            </button>
          </div>
        </section>

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

        <section class="space-y-2">
          <h2 class="section-title">Commenti</h2>

          @if (comments().length === 0) {
            <p class="text-sm text-base-content/60">Nessun commento ancora.</p>
          } @else {
            <ul class="space-y-2">
              @for (comment of comments(); track comment.id) {
                <li class="rounded-lg border border-base-300/60 p-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium">{{ comment.authorUsername ?? 'Utente' }}</span>
                    <span class="text-xs text-base-content/60">{{ formatDate(comment.createdAt) }}</span>
                  </div>
                  <p class="text-sm mt-1 whitespace-pre-wrap break-words">{{ comment.body }}</p>
                </li>
              }
            </ul>
          }

          @if (authService.isLoggedIn()) {
            <div class="space-y-2 mt-2">
              <textarea
                class="textarea textarea-bordered w-full"
                placeholder="Scrivi un commento..."
                rows="2"
                [(ngModel)]="commentText"
                name="commentText"
              ></textarea>
              @if (commentError()) {
                <p class="text-error text-sm">{{ commentError() }}</p>
              }
              <button
                type="button"
                class="btn btn-sm btn-primary"
                [disabled]="posting()"
                (click)="submitComment(d.id)"
              >
                @if (posting()) {
                  <span class="loading loading-spinner loading-sm"></span>
                }
                Invia
              </button>
            </div>
          } @else {
            <p class="text-sm text-base-content/60 mt-2">Accedi per commentare.</p>
          }
        </section>
      }
    </main>
  `,
})
export class ShareDeckPage {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly profileService = inject(ProfileService);
  protected readonly authService = inject(AuthService);

  readonly state = signal<ShareViewState>('loading');
  readonly deck = signal<PublicDeck | null>(null);
  readonly comments = signal<DeckMessage[]>([]);

  readonly copied = signal(false);
  readonly posting = signal(false);
  readonly commentError = signal<string | null>(null);
  protected commentText = '';

  readonly mainCards = computed(() => this.cardsInSection('main'));
  readonly extraCards = computed(() => this.cardsInSection('extra'));
  readonly sideCards = computed(() => this.cardsInSection('side'));

  readonly coverImageUrl = computed(() => {
    const cardId = this.deck()?.coverCardIds?.[0];
    return cardId != null ? `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg` : null;
  });

  readonly ydkeUrl = computed(() => {
    const d = this.deck();
    return d ? decklistToYdkeUrl({ cards: d.cards }) : '';
  });

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

  private async loadDeck(id: string): Promise<void> {
    this.state.set('loading');
    this.deck.set(null);
    this.comments.set([]);

    const deck = await this.profileService.getPublicDeckById(id);
    if (!deck) {
      this.state.set('not-found');
      return;
    }

    this.deck.set(deck);
    this.state.set('found');

    try {
      this.comments.set(await this.profileService.listComments(deck.id));
    } catch {
      this.comments.set([]);
    }
  }

  protected async copyYdke(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.ydkeUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard API can throw/reject in some contexts (e.g. insecure origin, no permission) — fail silently.
    }
  }

  protected async submitComment(deckId: string): Promise<void> {
    const text = this.commentText.trim();
    if (!text) {
      return;
    }
    this.posting.set(true);
    this.commentError.set(null);
    try {
      await this.profileService.postComment(deckId, text);
      this.commentText = '';
      this.comments.set(await this.profileService.listComments(deckId));
    } catch (err) {
      this.commentError.set(err instanceof Error ? err.message : 'Errore sconosciuto.');
    } finally {
      this.posting.set(false);
    }
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  private cardsInSection(section: DeckSection): DecklistCard[] {
    const cards = this.deck()?.cards ?? [];
    return cards.filter((card) => (card.section ?? 'main') === section);
  }
}
