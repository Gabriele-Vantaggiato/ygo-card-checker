# Intent Runtime · YGO Lab

Experimental local companion to YGOCardChecker. Reconstructed from the referenced conversation because its `/mnt/data/intent-runtime-ygo-mvp.zip` was not attached or available on this host. This is not that original ZIP.

## Start

Node 20+; zero additional runtime dependencies. From the repository root:

```sh
npm run intent:start
```

Open http://127.0.0.1:4173 on the same computer. Stop with Ctrl+C. `PORT` may override 4173. The runtime binds only to loopback. It does not require the Angular dev server or Supabase login. No deployment is configured.

1. Choose **Combo explorer**, then **Componi lo spazio**. Inspect Chimera → revive Beast → Scrap Dragon. Uncheck Beast in the graveyard, or enable negation, and run again: the Synchro is blocked.
2. Choose **Deck optimization**, then run. The editable 40-card Geargia sample increases Geargiarmor/Geargiarsenal from 4 to 6 total copies by replacing two Fiendish Chain. With 5 cards drawn, the exact probability of at least one designated starter changes from 42.71% to 57.71%. Select 6 cards for the HAT first-draw comparison. Export the proposed text list for the existing deck import flow.
3. Ask for both combo and Geargia optimization to compose all views from one plan. Expand the audit to inspect actual inputs and results.

## Real vs demo

Real: repository card name/passcode resolution, snapshot HAT pool/copy checks, hypergeometric math, text export, limited deterministic Scrap state transitions.

Demo: intent interpretation uses keyword rules by default; layout is selected from a safe vocabulary. Geargia roles/replacement priorities are explicit heuristics. The Scrap example is a limited scenario, not a duel engine. Negation is abstract, with no opponent card or chain semantics. The original hand containing both Chimera and Beast does **not** magically put Beast in the graveyard.

Optional real AI: set `AI_GATEWAY_API_KEY` and `INTENT_MODEL` (a supported provider/model ID) in the server environment, restart, select **AI reale**. The model chooses permitted tools and views; the server executes the calculations. Keys never go to the browser. The intent text is sent to the gateway only in AI mode. No automatic fallback to demo on provider failure. Live AI has not been tested without credentials; adapter tests use a mocked transport.

```powershell
$env:AI_GATEWAY_API_KEY = '<your key>'
$env:INTENT_MODEL = '<provider/model>'
npm run intent:start
```

Do not commit keys. This experimental local server has no multi-user authentication and must not be exposed publicly.

## Verify

```sh
npm run intent:test
npm run intent:check
npm run build
```

Catalog source: `src/assets/data/passcode-catalog.json`; HAT checks: `src/assets/data/card-knowledge/format-legality.json` (timestamp shown in UI). This is snapshot validation, not a current official ruling service. Existing `flows.json` is deliberately not executed: its natural-language effects require independent validation.

The lab does not read or overwrite saved deck state. Integration is through the repository catalog and compatible text deck input/output. It is not mounted inside the Angular shell and does not replace the existing Gemini coach, Supabase or combo services.

Sources: [Scrap Chimera official card text](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=8950&ope=2), [Vercel gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions).
## Assistente decklist

Dal repository web, con Node.js 20 o superiore, avvia `node tools/intent-runtime/server.mjs`.
Questo laboratorio usa la libreria standard di Node e i dati già versionati nel repository.
Apri [l’assistente decklist](http://127.0.0.1:4173/decklist) sulla porta 4173.
La home del laboratorio resta disponibile allo stesso indirizzo, sul percorso `/`.

Invia «Mostra la decklist in due colonne, tema scuro, ordine alfabetico, con riepilogo.»
Per modificare la vista invia «Imposta una colonna, tema chiaro, ordine per quantità.»
Puoi chiudere e riaprire la pagina nello stesso browser per recuperare la vista, il prompt e il mazzo dell’ultimo invio riuscito.
Su schermi stretti le colonne si dispongono in verticale.

L’assistente interpreta una grammatica deterministica. Le varianti ammesse sono una colonna o due colonne, tema chiaro o scuro, ordine alfabetico o per quantità, con riepilogo o senza riepilogo. Il runtime autorizza la lettura della lista inviata tramite `deck.read` e produce un documento con blocchi di riepilogo e tabelle. La lista iniziale è l’esempio Geargia del repository. Puoi sostituirla con una lista testuale, usando i nomi inglesi del catalogo.
La modalità LLM del laboratorio precedente è separata da questa demo.

### Dashboard con immagini e dettatura

Premi **Prompt dashboard** e **Componi la pagina** oppure usa **Detta il prompt** in un browser compatibile per inviare direttamente la trascrizione.
Frase di prova: «Componi la dashboard con la decklist con immagini a sinistra, brick rate e consistency a destra e carte in sinergia sotto».
La dettatura può richiedere l’accesso al microfono e il servizio vocale del browser. La composizione resta deterministica e accetta anche il prompt scritto.

La consistency è la probabilità esatta di pescare almeno una delle carte chiave indicate, senza reinserimento. Il brick rate è il complemento. Scegli le carte del Main Deck che rappresentano il criterio e una mano di 5 o 6 carte. Il mazzo Geargia di esempio parte con Geargiarmor e Geargiarsenal.

I suggerimenti usano l’indice di co-occorrenza di YGOCC e omettono le carte già nella lista. La fonte registra carte giocate insieme. Le immagini usano le copie presenti nel repository, poi la cache in `tmp/intent-card-images` e YGOPRODeck quando serve. In assenza di un’immagine viene mostrato il nome.

### Decklist dell’account YGOCC

Avvia YGOCC dal repository con `npm ci` la prima volta e `npm start` per lo sviluppo. Lo stesso comando avvia anche Intent Runtime in modalità watch e Angular inoltra le richieste del playground. Apri [Intent Runtime](http://127.0.0.1:4200/intent-runtime) dal link nella pagina Decklist. Accedi con il normale accesso di YGOCC e apri **Decklist di partenza**.

Il selettore usa `DeckSyncService.load()` e mostra le decklist dell’utente corrente con almeno una carta. Seleziona le carte chiave direttamente dalla griglia del Main Deck e usa **Ricalcola**. La vista dell’account viene scartata quando si esce o si cambia mazzo.

Per usare un LLM, accedi a Codex CLI con ChatGPT e seleziona **Codex con ChatGPT** nel playground. Il server richiede quella modalità di login e invia solo il prompt. Il modello sceglie fra le tre viste supportate e il runtime valida la scelta prima di eseguire i calcoli. Se il binario non è nel PATH, imposta `INTENT_CODEX_BIN` con il percorso dell’eseguibile locale. Questa modalità usa i limiti del piano ChatGPT applicabile. La modalità deterministica resta predefinita e funziona senza credenziali.

## Intent Lab Angular · `/intent`

Avvia YGOCardChecker con `npm run start`. Il server Intent Runtime locale ascolta
su `127.0.0.1:4190` e Angular inoltra le richieste al planner tramite il proxy di
sviluppo. Il planner usa Codex CLI per impostazione predefinita. Esegui `codex login`
con il tuo account ChatGPT e verifica la sessione con `codex login status`.
Le richieste usano il piano ChatGPT, entro i relativi limiti. Puoi indicare il
percorso dell'eseguibile con `INTENT_CODEX_BIN` se Codex non è nel PATH.
Per usare AI Gateway, imposta esplicitamente `INTENT_PLANNER_PROVIDER=gateway`
insieme a `AI_GATEWAY_API_KEY` e `INTENT_MODEL`.
Il planner riceve il testo digitato e le impostazioni visive.
La simulazione usa la decklist selezionata in Angular e il workspace viene
salvato nella memoria locale del browser.

`npm run intent:test` esegue anche i test della simulazione e del planner.
