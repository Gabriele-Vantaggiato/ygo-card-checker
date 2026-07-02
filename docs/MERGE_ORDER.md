# Ordine merge verso `main`

I branch feature usano il prefisso numerico `NN-` subito dopo `refactor/` per indicare la **sequenza di merge** su `main`.

## Convenzione

```
refactor/<NN>-<slug-breve>
```

- `NN` = numero a due cifre (`01`, `02`, …)
- Merge su `main` **in ordine crescente**
- Ogni branch parte dal branch precedente già mergiato (o da `main` se è il primo)

## Coda attuale

| Ordine | Branch | Base merge | Contenuto |
|--------|--------|------------|-----------|
| 01 | `refactor/related-combo` | `main` | Knowledge DB, combo, YDKE import/export, suggestion deck, completa mazzo |
| 02 | `refactor/02-decklist-ux` | `01` | UX/UI decklist, tema, componenti condivisi, polish modali |

> **Nota:** `refactor/related-combo` è il branch `01` creato prima dell’introduzione della numerazione. I prossimi branch useranno sempre `refactor/NN-slug`.

## Workflow

```bash
# Dopo merge di 01 su main
git checkout main && git pull
git merge refactor/related-combo
git push origin main

# Poi merge di 02
git merge refactor/02-decklist-ux
git push origin main
```

## Deploy (Vercel)

L'app carica i suggerimenti da `src/assets/data/card-knowledge/*.json` via HTTP (`assets/data/...`).

- **SQLite** (`data/card-knowledge/cards.db`) resta locale e gitignored.
- **JSON export** (~50 MB) sono **versionati** e inclusi nel bundle Angular su ogni deploy.

Dopo aver rigenerato il DB:

```bash
npm run db:build
git add src/assets/data/card-knowledge/*.json
git commit -m "chore(data): aggiorna knowledge index"
git push origin main
```


Non in coda sequenziale — già mergiati o sostituiti:

- `refactor/decklist-management`
- `refactor/ai-card-knowledge-db`
- `refactor/desktop-layout-two-columns`
