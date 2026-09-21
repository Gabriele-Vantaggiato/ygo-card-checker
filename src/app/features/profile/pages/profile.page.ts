import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FormatStore } from '../../../core/stores/format.store';
import { Decklist } from '../../../models/decklist.model';
import { AuthService } from '../../../services/auth.service';
import { DeckSyncService } from '../../../services/deck-sync.service';
import { Profile, ProfileService, PublicDeck } from '../../../services/profile.service';
import { decklistToYdkeUrl } from '../../../services/ydke.service';
import { AiProvider, AiProviderPreferencesService } from '../../../services/ai-provider-preferences.service';

/**
 * Profile page: view/edit own profile (username, avatar, friend code), publish
 * private synced decks (DeckSyncService) to the public profile, and manage
 * already-published decks (ProfileService/public_decks). Follows the native
 * <dialog>-free inline-edit + inline-error pattern used by auth-button.component.ts
 * (errorMessage signal + @if, loading loading-spinner, btn btn-primary/btn-outline/btn-ghost).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-profile-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="page-main page-stack max-w-3xl lg:max-w-4xl fade-in-panel">
      @if (!authService.isLoggedIn()) {
        <div class="empty-state py-16 text-center">
          <p class="empty-state-title">Accedi per vedere il tuo profilo</p>
        </div>
      } @else if (loading()) {
        <div class="flex items-center justify-center py-16">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else if (profile(); as p) {
        <header class="page-header">
          <div class="space-y-0.5 min-w-0">
            <h1 class="page-title">Il tuo profilo</h1>
          </div>
        </header>

        <!-- Profile header -->
        <section class="flex items-start gap-4 rounded-lg border border-base-300/60 p-4">
          @if (p.avatarCardId) {
            <img
              [src]="'https://images.ygoprodeck.com/images/cards_small/' + p.avatarCardId + '.jpg'"
              alt="Avatar"
              class="w-16 h-16 rounded-full object-cover shrink-0"
            />
          } @else {
            <div
              class="w-16 h-16 rounded-full bg-neutral text-neutral-content flex items-center justify-center text-xl font-bold shrink-0"
            >
              {{ p.username.charAt(0).toUpperCase() }}
            </div>
          }

          <div class="min-w-0 flex-1 space-y-2">
            <!-- Username -->
            @if (editingUsername()) {
              <div class="flex items-center gap-2 flex-wrap">
                <input
                  class="input input-bordered input-sm"
                  type="text"
                  [(ngModel)]="usernameDraft"
                  name="usernameDraft"
                />
                <button class="btn btn-sm btn-primary" [disabled]="savingUsername()" (click)="saveUsername()">
                  @if (savingUsername()) {
                    <span class="loading loading-spinner loading-xs"></span>
                  }
                  Salva
                </button>
                <button class="btn btn-sm btn-ghost" [disabled]="savingUsername()" (click)="cancelEditUsername()">
                  Annulla
                </button>
              </div>
              @if (usernameError()) {
                <p class="text-error text-sm">{{ usernameError() }}</p>
              }
            } @else {
              <div class="flex items-center gap-2">
                <span class="font-semibold text-lg">{{ p.username }}</span>
                <button class="btn btn-xs btn-ghost" (click)="startEditUsername(p)">Modifica</button>
              </div>
            }

            <!-- Friend code -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm text-base-content/60">Codice amico:</span>
              <code class="text-sm">{{ p.friendCode }}</code>
              <button class="btn btn-xs btn-outline" (click)="copyFriendCode(p)">
                {{ friendCodeCopied() ? 'Copiato!' : 'Copia' }}
              </button>
            </div>

            <p class="text-xs text-base-content/60">Membro dal {{ formatDate(p.createdAt) }}</p>

            <!-- Avatar card id -->
            <div class="flex items-center gap-2 flex-wrap pt-1">
              <span class="text-sm text-base-content/60">ID carta avatar:</span>
              <input
                class="input input-bordered input-sm w-28"
                type="number"
                [(ngModel)]="avatarCardIdDraft"
                name="avatarCardIdDraft"
              />
              <button class="btn btn-xs btn-outline" [disabled]="savingAvatar()" (click)="saveAvatar()">
                @if (savingAvatar()) {
                  <span class="loading loading-spinner loading-xs"></span>
                }
                Salva
              </button>
            </div>
            @if (avatarError()) {
              <p class="text-error text-sm">{{ avatarError() }}</p>
            }
          </div>
        </section>

        <section class="space-y-3 rounded-lg border border-base-300/60 p-4">
          <div>
            <h2 class="section-title">Modello decisionale</h2>
            <p class="text-sm text-base-content/60">Scegli dove eseguire l’assistenza. Le chiavi restano nel tuo browser e non vengono salvate su Vercel.</p>
          </div>
          <select class="select select-bordered w-full" [ngModel]="aiPreferences.preferences().provider" (ngModelChange)="setAiProvider($event)" name="aiProvider">
            <option value="local">Locale E5 + DB (senza chiavi)</option>
            <option value="openrouter">Qwen/DeepSeek tramite OpenRouter</option>
            <option value="gemini">Gemini con la mia chiave</option>
            <option value="ollama">Ollama locale</option>
          </select>
          @if (aiPreferences.preferences().provider === 'openrouter') {
            <input class="input input-bordered w-full" type="text" [ngModel]="aiPreferences.preferences().openRouterModel" (ngModelChange)="setAiModel($event)" placeholder="openrouter/free oppure slug Qwen/DeepSeek" name="aiModel" />
            <input class="input input-bordered w-full" type="password" [ngModel]="aiPreferences.preferences().openRouterApiKey" (ngModelChange)="setAiKey($event)" placeholder="Chiave OpenRouter personale" name="aiKey" autocomplete="off" />
          }
        </section>

        <!-- I tuoi deck -->
        <section class="space-y-2">
          <h2 class="section-title">I tuoi deck</h2>
          @if (ownDecklists().length === 0) {
            <p class="text-sm text-base-content/60">Nessun deck salvato.</p>
          } @else {
            <ul class="space-y-2">
              @for (deck of ownDecklists(); track deck.id) {
                <li class="flex items-center justify-between gap-3 rounded-lg border border-base-300/60 p-3">
                  <span class="font-medium truncate">{{ deck.name }}</span>
                  <button
                    class="btn btn-sm btn-primary shrink-0"
                    [disabled]="publishingDeckId() === deck.id"
                    (click)="publishDeck(deck)"
                  >
                    @if (publishingDeckId() === deck.id) {
                      <span class="loading loading-spinner loading-xs"></span>
                    }
                    Pubblica sul profilo
                  </button>
                </li>
              }
            </ul>
          }
          @if (publishError()) {
            <p class="text-error text-sm">{{ publishError() }}</p>
          }
        </section>

        <!-- Deck pubblicati -->
        <section class="space-y-2">
          <h2 class="section-title">Deck pubblicati</h2>
          @if (publicDecks().length === 0) {
            <p class="text-sm text-base-content/60">Nessun deck pubblicato.</p>
          } @else {
            <ul class="space-y-2">
              @for (deck of publicDecks(); track deck.id) {
                <li class="flex flex-col gap-2 rounded-lg border border-base-300/60 p-3">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium truncate">{{ deck.name }}</span>
                    <div class="flex items-center gap-1 shrink-0">
                      @for (cardId of deck.coverCardIds.slice(0, 3); track cardId) {
                        <img
                          [src]="'https://images.ygoprodeck.com/images/cards_small/' + cardId + '.jpg'"
                          alt=""
                          class="w-8 rounded"
                          loading="lazy"
                        />
                      }
                    </div>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <button class="btn btn-xs btn-outline" (click)="copyYdke(deck)">
                      {{ copiedYdkeDeckId() === deck.id ? 'Copiato!' : 'Copia codice YDKE' }}
                    </button>
                    <a class="btn btn-xs btn-outline" [routerLink]="['/d', deck.id]">Vedi pagina pubblica</a>
                    <button
                      class="btn btn-xs btn-ghost text-error"
                      [disabled]="unpublishingDeckId() === deck.id"
                      (click)="unpublishDeck(deck.id)"
                    >
                      @if (unpublishingDeckId() === deck.id) {
                        <span class="loading loading-spinner loading-xs"></span>
                      }
                      Rimuovi
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
          @if (unpublishError()) {
            <p class="text-error text-sm">{{ unpublishError() }}</p>
          }
        </section>
      }
    </main>
  `,
})
export class ProfilePage {
  protected readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly deckSyncService = inject(DeckSyncService);
  private readonly formatStore = inject(FormatStore);
  protected readonly aiPreferences = inject(AiProviderPreferencesService);

  protected readonly loading = signal(true);
  protected readonly profile = signal<Profile | null>(null);
  protected readonly ownDecklists = signal<Decklist[]>([]);
  protected readonly publicDecks = signal<PublicDeck[]>([]);

  protected readonly editingUsername = signal(false);
  protected usernameDraft = '';
  protected readonly savingUsername = signal(false);
  protected readonly usernameError = signal<string | null>(null);

  protected avatarCardIdDraft = '';
  protected readonly savingAvatar = signal(false);
  protected readonly avatarError = signal<string | null>(null);

  protected readonly friendCodeCopied = signal(false);
  protected readonly copiedYdkeDeckId = signal<string | null>(null);

  protected readonly publishingDeckId = signal<string | null>(null);
  protected readonly publishError = signal<string | null>(null);
  protected readonly unpublishingDeckId = signal<string | null>(null);
  protected readonly unpublishError = signal<string | null>(null);

  protected setAiProvider(provider: AiProvider): void { this.aiPreferences.update({ provider }); }
  protected setAiModel(openRouterModel: string): void { this.aiPreferences.update({ openRouterModel }); }
  protected setAiKey(openRouterApiKey: string): void { this.aiPreferences.update({ openRouterApiKey }); }

  constructor() {
    if (this.authService.isLoggedIn()) {
      void this.loadAll();
    }
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [profile, storage, publicDecks] = await Promise.all([
        this.profileService.getOwnProfile(),
        this.deckSyncService.load(),
        this.profileService.listOwnPublicDecks(),
      ]);
      this.profile.set(profile);
      this.ownDecklists.set(storage.decklists);
      this.publicDecks.set(publicDecks);
      this.avatarCardIdDraft = profile?.avatarCardId != null ? String(profile.avatarCardId) : '';
    } finally {
      this.loading.set(false);
    }
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  protected startEditUsername(profile: Profile): void {
    this.usernameDraft = profile.username;
    this.usernameError.set(null);
    this.editingUsername.set(true);
  }

  protected cancelEditUsername(): void {
    this.editingUsername.set(false);
    this.usernameError.set(null);
  }

  protected async saveUsername(): Promise<void> {
    this.savingUsername.set(true);
    this.usernameError.set(null);
    try {
      await this.profileService.updateUsername(this.usernameDraft);
      const current = this.profile();
      if (current) {
        this.profile.set({ ...current, username: this.usernameDraft.trim() });
      }
      this.editingUsername.set(false);
    } catch (error) {
      this.usernameError.set(error instanceof Error ? error.message : 'Errore sconosciuto.');
    } finally {
      this.savingUsername.set(false);
    }
  }

  protected async copyFriendCode(profile: Profile): Promise<void> {
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      this.friendCodeCopied.set(true);
      setTimeout(() => this.friendCodeCopied.set(false), 1500);
    } catch {
      // Clipboard API unavailable or denied — nothing more we can do here.
    }
  }

  protected async saveAvatar(): Promise<void> {
    this.savingAvatar.set(true);
    this.avatarError.set(null);
    try {
      const parsed = Number(this.avatarCardIdDraft);
      const cardId = this.avatarCardIdDraft.trim() && !Number.isNaN(parsed) ? parsed : null;
      await this.profileService.updateAvatarCardId(cardId);
      const current = this.profile();
      if (current) {
        this.profile.set({ ...current, avatarCardId: cardId });
      }
    } catch (error) {
      this.avatarError.set(error instanceof Error ? error.message : 'Errore sconosciuto.');
    } finally {
      this.savingAvatar.set(false);
    }
  }

  protected async publishDeck(deck: Decklist): Promise<void> {
    this.publishingDeckId.set(deck.id);
    this.publishError.set(null);
    try {
      await this.profileService.publishDeck({
        sourceDeckId: deck.id,
        name: deck.name,
        cards: deck.cards,
        format: this.formatStore.formatId(),
      });
      this.publicDecks.set(await this.profileService.listOwnPublicDecks());
    } catch (error) {
      this.publishError.set(error instanceof Error ? error.message : 'Errore sconosciuto.');
    } finally {
      this.publishingDeckId.set(null);
    }
  }

  protected async copyYdke(deck: PublicDeck): Promise<void> {
    try {
      await navigator.clipboard.writeText(decklistToYdkeUrl({ cards: deck.cards }));
      this.copiedYdkeDeckId.set(deck.id);
      setTimeout(() => this.copiedYdkeDeckId.set(null), 1500);
    } catch {
      // Clipboard API unavailable or denied — nothing more we can do here.
    }
  }

  protected async unpublishDeck(publicDeckId: string): Promise<void> {
    this.unpublishingDeckId.set(publicDeckId);
    this.unpublishError.set(null);
    try {
      await this.profileService.unpublishDeck(publicDeckId);
      this.publicDecks.set(await this.profileService.listOwnPublicDecks());
    } catch (error) {
      this.unpublishError.set(error instanceof Error ? error.message : 'Errore sconosciuto.');
    } finally {
      this.unpublishingDeckId.set(null);
    }
  }
}
