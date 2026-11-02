# Coach MDPro4 · Test Hand

Il sito legge mazzo YDKE, mano e giocate dal registratore Test Hand di **MDPro4 1.0.6 per Windows**. Un overlay trasparente mostra la prossima azione senza eseguire clic nel gioco. Le linee disponibili dipendono dai modelli del catalogo; non è ancora un risolutore universale per qualsiasi mazzo. Negazioni, catene e decisioni dell’avversario non sono simulate.

## Avvio locale

Servono Node.js e Python 64 bit. Dalla directory del progetto:

```powershell
py -m venv tools/mdpro-coach/.venv
tools/mdpro-coach/.venv/Scripts/python.exe -m pip install -r tools/mdpro-coach/requirements.txt
npm run mdpro:coach
```

Apri il sito su `http://127.0.0.1:4201/overlay`, premi **Avvia coach automatico Test Hand**, quindi scegli un mazzo salvato in MDPro4 e avvia Test Hand. Il percorso predefinito è `C:/Games/MDPro4`; per cambiarlo usa `npm run mdpro:coach -- --game=C:/altro/percorso`.

Per usare il sito pubblicato, aggiungi il suo indirizzo esatto all’avvio del tool:

```powershell
npm run mdpro:coach -- --origins=https://INDIRIZZO-DEL-SITO
```

Il browser potrebbe richiedere l’accesso alla rete locale. Il tool resta in ascolto solo su `127.0.0.1:4718`; gli altri siti non possono leggerlo. `--origins` aggiunge indirizzi consentiti e mantiene quelli locali necessari all’overlay. La sola pubblicazione del sito non installa né avvia questo componente sul PC.

## Comportamento e limiti

- Il mazzo viene associato all’avvio della registrazione; selezionare un altro mazzo nell’editor non cambia la decklist della partita già in corso.
- Le azioni comprendono attivazione, costi e risoluzioni esplicite. Una deviazione può indicare una variante valida: non dimostra un errore del giocatore.
- Il raggiungimento del campo obiettivo in due letture conserva una scheda **osservata, da verificare**. Non certifica una vittoria o una combo ottimale.
- Nomi e schede sono gestiti dal sito. Il riconoscimento visivo della posizione della carta richiede due rilevamenti concordi; se non la riconosce, resta il suggerimento testuale.
- Solo Test Hand 1.0.6 è stato provato. La lettura del registro completo delle azioni avversarie e la pianificazione generale per nuovi deck restano da implementare.
- Chiudi il terminale con Ctrl+C per fermare il collegamento e l’overlay; MDPro4 resta aperto.

## Verifica

```powershell
node --test tools/mdpro-coach/bridge.test.mjs
```

L’osservatore legge il registratore della versione installata tramite Frida, senza invocare azioni del duello o modificare i file del gioco. I riferimenti di progetto sono le [API Frida](https://frida.re/docs/functions/) e l’approccio a osservazione, stabilizzazione e suggerimenti illustrato da [pjchess](https://www.reverse.dev/pjchess).
