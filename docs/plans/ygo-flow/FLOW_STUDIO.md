# Flow Studio

## Percorsi disponibili

- **I tuoi Flow**: archivio locale ricercabile per nome, carta e mazzo; quattro modelli modificabili; duplicazione; rimozione annullabile; import/export dell'intero archivio.
- **Costruisci**: builder esistente con nodi, carte, note, condizioni e collegamenti. Esportazione JSON, Base64, PNG e del mazzo associato in `.ydk`.
- **Allenati**: percorso a diramazioni isolato dal canvas in modifica, suggerimenti nascosti, scelta del punto di partenza, ritorno al passo precedente e autovalutazione. Diario delle ultime 100 sessioni esportabile.
- **Prova una mano**: 5/6 carte, seed ripetibile, composizione limitata alle copie realmente presenti, Extra Deck e carte bandite, movimenti manuali e annullamento delle ultime 50 mosse.
- **Analizza**: ruoli modificabili, probabilità ipergeometriche esatte, riferimento persistente per confrontare versioni nello stesso formato e con la stessa mano, campione ripetibile di 100 mani e replay degli esempi senza starter.

Home e Deck Studio collegano direttamente ai nuovi percorsi.

## Semantica e conservazione dei dati

Il documento v2 conserva ID, contesto del mazzo/formato, seed, dimensione della mano e dati delle carte relativi al suo YDKE. Cambiare il mazzo originale non altera lo snapshot studiato. Il documento v1 resta importabile. Le personalizzazioni dei ruoli sopravvivono al ripristino e a un caricamento API fallito; l'analisi si blocca se mancano carte.

Archivio e diario rimangono sul dispositivo. Nessun account o sincronizzazione cloud implicita. Un archivio illeggibile non viene sovrascritto; in caso di quota esaurita le nuove modifiche restano esportabili. Le copie importate ricevono nuovi ID.

La lettura della mano classifica risorse per ruolo: starter, extender, hand trap, interazione e non assegnato. Una mano senza starter non è automaticamente ingiocabile. Le tracce suggerite non sono combo convalidate; costi, condizioni, timing ed effetti alternativi richiedono verifica manuale. Starter diversi non vengono concatenati automaticamente. I bersagli suggeriti per il mazzo escludono carte assenti e carte presenti soltanto nel Side Deck. Il tavolo non applica le regole del gioco e il campione non stima la percentuale di vittoria.

## Dati e build

`prestart` e `prebuild` generano `public/assets/data/effect-scripts/study.json` dai dati versionati, escludendo il testo Lua. Il catalogo conserva tutti i 14.422 record di partenza; l'ispettore avanzato continua a poter caricare i dati completi. Non viene aggiunta una dipendenza runtime.

## Verifica

La build Angular di produzione passa. Rimane l'avviso sulla soglia iniziale di 500 kB (inferiore al limite bloccante di 1 MB).

107 test Jasmine/Karma passati, inclusi regressioni su:

- snapshot indipendenti dal mazzo modificato, ripristino offline e ruoli personalizzati;
- caricamenti parziali rifiutati e recupero tramite retry;
- conservazione delle copie, composizione atomica e annullamento mosse;
- seed ripetibili, calcolo esatto delle probabilità e replay del campione;
- archivio multiplo, copie immutabili, quota e archivio illeggibile;
- classificazione prudente delle mani e bersagli limitati a Main/Extra;
- compatibilità dei documenti e dei quattro modelli a diramazioni.

## Stato della consegna

Modifiche e build disponibili localmente. La scrittura remota è stata rifiutata dall’integrazione GitHub (`Resource not accessible by integration`, HTTP 403); Vercel nega l’accesso al progetto (HTTP 403). Non è stata pubblicata una nuova versione del sito.

La verifica visiva interattiva su desktop/mobile resta da completare: il browser remoto non può aprire l’anteprima locale e i permessi impediscono di creare l’anteprima Vercel. I test automatizzati sopra riportati sono stati realmente eseguiti in Chromium tramite Karma.
