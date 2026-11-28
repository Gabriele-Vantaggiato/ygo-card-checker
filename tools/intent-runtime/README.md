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
