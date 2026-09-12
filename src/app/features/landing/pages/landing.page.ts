import { DecklistStore } from '../../decklist/stores/decklist.store';
import { FlowLibraryService } from '../../ygo-flow/services/flow-library.service';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../../services/i18n.service';
@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <main class="showcase" [class.motion-paused]="paused()">
    <section class="home-lab-entry">
      <div><span class="lab-eyebrow">FLOW STUDIO / {{ t('PRONTO PER IL PROSSIMO TEST?', 'READY FOR THE NEXT TEST?') }}</span><strong>{{ decks.activeDecklist().name || t('Il tuo prossimo piano di gioco', 'Your next game plan') }}</strong><p>{{ t('Prova una mano, prepara una linea e allenati sulle alternative.', 'Test a hand, prepare a line and practice the alternatives.') }}</p></div>
      <div class="lab-actions"><a routerLink="/flow" [queryParams]="{ deckId: decks.activeDecklistId(), section: 'hands' }" class="lab-btn lab-btn-primary">{{ t('Prova una mano', 'Test a hand') }} ↗</a><a routerLink="/flow" class="lab-btn">{{ t('I tuoi Flow', 'Your Flows') }} · {{ library.documents().length }}</a></div>
    </section>
    <section class="showcase-hero">
      <div class="showcase-copy">
        <span class="duel-eyebrow">YGO CHECKER · DUELIST WORKSPACE</span>
        <h1>
          {{ t('Il prossimo duello', 'Your next duel') }}<br /><em>{{
            t('inizia qui.', 'starts here.')
          }}</em>
        </h1>
        <p>
          {{
            t(
              'Dalle prime 40 carte al piano perfetto. Costruisci il tuo mazzo, scopri gli effetti e prepara ogni possibile strada verso la vittoria.',
              'From your first 40 cards to your game plan. Build your deck, explore effects and prepare every path to victory.'
            )
          }}
        </p>
        <div class="flex flex-wrap gap-3">
          <a routerLink="/decklist" class="btn btn-primary btn-lg"
            >{{ t('Entra nel Deck Studio', 'Enter Deck Studio') }} ↗</a
          ><a href="#explore" class="btn btn-outline btn-lg"
            >{{ t('Scopri gli strumenti', 'Explore the tools') }} ↓</a
          >
        </div>
        <button
          class="showcase-motion"
          (click)="paused.set(!paused())"
          [attr.aria-pressed]="paused()"
        >
          {{
            paused()
              ? t('Riprendi animazioni', 'Resume animations')
              : t('Pausa animazioni', 'Pause animations')
          }}</button
        ><span class="showcase-caption">{{
          t('Decklist · Ricerca carte · Overlay · Flow', 'Decklists · Card search · Overlay · Flow')
        }}</span>
      </div>
      <div class="showcase-art" aria-hidden="true">
        <div class="showcase-orbit"></div>
        <div class="showcase-orbit orbit-inner"></div>
        <img
          class="showcase-card card-left"
          src="https://images.ygoprodeck.com/images/cards/46986414.jpg"
          alt=""
        /><img
          class="showcase-card card-right"
          src="https://images.ygoprodeck.com/images/cards/84013237.jpg"
          alt=""
        /><img
          class="showcase-card card-front"
          src="https://images.ygoprodeck.com/images/cards/89631139.jpg"
          alt=""
        /><span class="showcase-seal">PREPARE. BUILD. DUEL.</span>
      </div>
    </section>
    <div class="showcase-ribbon" aria-hidden="true">
      <div>
        DECK BUILDING <b>✦</b> CARD DISCOVERY <b>✦</b> COMBO PATHS <b>✦</b> LIVE OVERLAY
        <b>✦</b> DECK BUILDING <b>✦</b> CARD DISCOVERY <b>✦</b> COMBO PATHS <b>✦</b> LIVE OVERLAY
        <b>✦</b>
      </div>
    </div>
    <section class="showcase-explore" id="explore">
      <div class="showcase-section-title">
        <span class="duel-eyebrow">01 / {{ t('IL TUO ARSENALE', 'YOUR TOOLKIT') }}</span>
        <h2>
          {{ t('Un laboratorio. Infinite possibilità.', 'One workspace. Endless possibilities.') }}
        </h2>
        <p>
          {{
            t(
              'Scegli uno strumento per vedere come può aiutarti.',
              'Choose a tool to see what you can do.'
            )
          }}
        </p>
      </div>
      <div class="showcase-tabs" role="tablist" aria-label="Strumenti">
        @for (tool of tools; track tool.path; let i = $index) {
          <button
            role="tab"
            [attr.aria-selected]="slide() === i"
            [attr.id]="'tool-tab-' + i"
            aria-controls="tool-preview"
            [class.active]="slide() === i"
            (click)="slide.set(i)"
          >
            <span>0{{ i + 1 }}</span
            >{{ tool.name }}
          </button>
        }
      </div>
      <div
        class="showcase-preview"
        role="tabpanel"
        id="tool-preview"
        [attr.aria-labelledby]="'tool-tab-' + slide()"
      >
        @for (tool of tools; track tool.path; let i = $index) {
          @if (slide() === i) {
            <div class="showcase-slide">
              <div class="showcase-demo" aria-hidden="true">
                <span class="duel-eyebrow">{{
                  t('ANTEPRIMA ILLUSTRATIVA', 'ILLUSTRATIVE PREVIEW')
                }}</span>
                @switch (i) {
                  @case (0) {
                    <div class="demo-deck-title">MY NEXT DECK <span>MAIN / EXTRA / SIDE</span></div>
                    <div class="demo-deck-grid">
                      @for (id of demoCards; track $index) {
                        <img
                          [src]="'https://images.ygoprodeck.com/images/cards/' + id + '.jpg'"
                          alt=""
                          loading="lazy"
                        />
                      }
                    </div>
                  }
                  @case (1) {
                    <div class="demo-search">⌕ Blue-Eyes White Dragon</div>
                    <div class="demo-search-result">
                      <img
                        src="https://images.ygoprodeck.com/images/cards/89631139.jpg"
                        alt=""
                        loading="lazy"
                      />
                      <div>
                        <span>LIGHT / DRAGON</span>
                        <h3>Blue-Eyes<br />White Dragon</h3>
                        <p>ATK 3000 / DEF 2500</p>
                        <div class="demo-lines"></div>
                      </div>
                    </div>
                  }
                  @case (2) {
                    <div class="demo-overlay">
                      <img
                        src="https://images.ygoprodeck.com/images/cards/46986414.jpg"
                        alt=""
                        loading="lazy"
                      />
                      <div class="demo-scan"></div>
                      <span>SCAN → CARD DETAILS</span>
                    </div>
                  }
                  @case (3) {
                    <div class="demo-tree">
                      <div>STARTER</div>
                      <i>↓</i>
                      <div class="decision">
                        {{ t('RISPOSTA AVVERSARIA?', 'OPPONENT RESPONSE?') }}
                      </div>
                      <div class="demo-tree-branches">
                        <span
                          >↙ {{ t('SÌ', 'YES') }}<b>{{ t('ALTERNATIVA', 'ALTERNATIVE') }}</b></span
                        ><span
                          >{{ t('NO', 'NO') }} ↘<b>{{
                            t('LINEA PRINCIPALE', 'MAIN LINE')
                          }}</b></span
                        >
                      </div>
                      <div class="demo-outcome">
                        {{ t('IL TUO CAMPO FINALE', 'YOUR END BOARD') }}
                      </div>
                    </div>
                  }
                }
              </div>
              <div class="showcase-description">
                <span class="duel-eyebrow">{{ tool.name }}</span>
                <h3>{{ t(tool.title, tool.titleEn) }}</h3>
                <p>{{ t(tool.copy, tool.copyEn) }}</p>
                <a [routerLink]="tool.path" class="btn btn-primary"
                  >{{ t('Apri', 'Open') }} {{ tool.name }} ↗</a
                ><small>{{ t(tool.note, tool.noteEn) }}</small>
              </div>
            </div>
          }
        }
      </div>
      <div class="showcase-slide-controls">
        <button
          class="btn btn-sm btn-ghost"
          (click)="slide.set((slide() + 3) % 4)"
          aria-label="Anteprima precedente"
        >
          ←</button
        ><span>0{{ slide() + 1 }} / 04</span
        ><button
          class="btn btn-sm btn-ghost"
          (click)="slide.set((slide() + 1) % 4)"
          aria-label="Anteprima successiva"
        >
          →
        </button>
      </div>
    </section>
    <section class="showcase-start">
      <div>
        <span class="duel-eyebrow"
          >02 / {{ t('LA TUA PRIMA SESSIONE', 'YOUR FIRST SESSION') }}</span
        >
        <h2>{{ t('Tre mosse per cominciare.', 'Three moves to get started.') }}</h2>
      </div>
      <div class="showcase-steps">
        <a routerLink="/decklist"
          ><span>01</span>
          <h3>{{ t('Porta il tuo mazzo', 'Bring your deck') }}</h3>
          <p>
            {{
              t(
                'Crea una decklist o importa una lista di carte o un codice YDKE.',
                'Create a decklist or import a card list or YDKE code.'
              )
            }}
          </p>
          <b>Deck Studio ↗</b></a
        ><a routerLink="/search"
          ><span>02</span>
          <h3>{{ t('Conosci ogni carta', 'Know every card') }}</h3>
          <p>
            {{
              t(
                'Cerca per nome e apri i dettagli per leggere effetti e informazioni.',
                'Search by name and open the details to read effects and card information.'
              )
            }}
          </p>
          <b>{{ t('Ricerca carte', 'Card search') }} ↗</b></a
        ><a routerLink="/flow"
          ><span>03</span>
          <h3>{{ t('Disegna il tuo piano', 'Map your game plan') }}</h3>
          <p>
            {{
              t(
                'Collega azioni, decisioni e alternative. Esplora il tuo albero un ramo alla volta.',
                'Connect actions, decisions and alternatives. Explore your tree one branch at a time.'
              )
            }}
          </p>
          <b>Flow Builder ↗</b></a
        >
      </div>
    </section>
    <section class="showcase-faq">
      <h2>{{ t('Prima di entrare nell’arena.', 'Before entering the arena.') }}</h2>
      <details>
        <summary>{{ t('Dove vengono salvati i miei lavori?', 'Where is my work saved?') }}</summary>
        <p>
          {{
            t(
              'Decklist e Flow vengono conservati localmente nel browser. Esporta una copia per trasferirli o proteggerli dalla cancellazione dei dati del browser.',
              'Decklists and Flow are stored locally in your browser. Export a copy to transfer them or keep a backup if browser data is cleared.'
            )
          }}
        </p>
      </details>
      <details>
        <summary>
          {{ t('Il Flow controlla le regole del gioco?', 'Does Flow validate game rules?') }}
        </summary>
        <p>
          {{
            t(
              'Il Flow è un editor del tuo piano di gioco. Puoi descrivere condizioni e risposte, ma devi verificare la legalità delle sequenze e i suggerimenti del Wizard.',
              'Flow is an editor for your game plan. Describe conditions and responses, but verify sequence legality and Wizard suggestions yourself.'
            )
          }}
        </p>
      </details>
      <details>
        <summary>{{ t('Come funziona l’Overlay?', 'How does Overlay work?') }}</summary>
        <p>
          {{
            t(
              'Puoi analizzare un’immagine o, nei browser compatibili, una cattura dello schermo. Il riconoscimento può richiedere una correzione manuale.',
              'Analyze an image or, in supported browsers, a screen capture. Recognition may require manual correction.'
            )
          }}
        </p>
      </details>
    </section>
    <section class="showcase-final">
      <span class="duel-eyebrow">IT’S TIME TO DUEL</span>
      <h2>{{ t('Dai forma alla prossima mossa.', 'Shape your next move.') }}</h2>
      <a routerLink="/decklist" class="btn btn-primary btn-lg"
        >{{ t('Inizia a costruire', 'Start building') }} ↗</a
      >
    </section>
  </main>`,
})
export class LandingPage {
  readonly decks = inject(DecklistStore);
  readonly library = inject(FlowLibraryService);
  readonly i18n = inject(I18nService);
  readonly slide = signal(0);
  readonly paused = signal(false);
  t(it: string, en: string): string {
    return this.i18n.lang() === 'it' ? it : en;
  }
  readonly demoCards = [89631139, 46986414, 84013237, 46986414, 89631139, 84013237];
  readonly tools = [
    {
      name: 'Deck Studio',
      path: '/decklist',
      title: 'La tua strategia, carta per carta.',
      titleEn: 'Your strategy, card by card.',
      copy: 'Organizza Main, Extra e Side Deck. Cerca carte, modifica le copie e importa o esporta le tue liste.',
      copyEn:
        'Organize Main, Extra and Side Deck. Search cards, adjust copies and import or export your lists.',
      note: 'Parti da zero o porta un mazzo che conosci già.',
      noteEn: 'Start from scratch or bring a deck you already know.',
    },
    {
      name: 'Card Search',
      path: '/search',
      title: 'Ogni effetto, a portata di mano.',
      titleEn: 'Every effect, within reach.',
      copy: 'Trova le carte per nome, consulta il testo e le caratteristiche, poi aggiungile alla tua decklist.',
      copyEn: 'Find cards by name, inspect their text and stats, then add them to your decklist.',
      note: 'Un punto di partenza anche se non hai ancora un mazzo.',
      noteEn: 'A starting point even if you do not have a deck yet.',
    },
    {
      name: 'Overlay',
      path: '/overlay',
      title: 'Dall’immagine alla carta.',
      titleEn: 'From image to card.',
      copy: 'Carica uno screenshot o cattura una finestra compatibile per cercare le carte riconosciute nell’immagine.',
      copyEn:
        'Upload a screenshot or capture a supported window to search for cards recognized in the image.',
      note: 'Con risultati consultabili e ricerca manuale di supporto.',
      noteEn: 'With browsable results and manual search for corrections.',
    },
    {
      name: 'Flow Builder',
      path: '/flow',
      title: 'Prepara anche il piano B. E il C.',
      titleEn: 'Prepare plan B. And plan C.',
      copy: 'Costruisci alberi di gioco con passaggi, condizioni e percorsi alternativi. Riordina, richiudi i rami e prova una linea alla volta.',
      copyEn:
        'Build game trees with steps, conditions and alternative paths. Arrange them, collapse branches and try one line at a time.',
      note: 'Usalo anche senza carte, partendo da un esempio guidato.',
      noteEn: 'Use it without cards, starting from an illustrated example.',
    },
  ];
}
