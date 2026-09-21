# Modelli aperti per le funzioni AI

La SPA usa il database e le regole locali per filtrare le carte. Le chiamate generative passano, quando configurate, da `/api/openrouter`, una Edge Function Vercel che mantiene la chiave fuori dal browser.

Ogni utente sceglie il provider nella pagina Profilo. Per OpenRouter inserisce la propria chiave e il modello (`openrouter/free` seleziona automaticamente un modello gratuito disponibile, oppure uno slug Qwen/DeepSeek). La chiave viene inviata solo per la richiesta e non è configurata su Vercel.

Il provider viene usato in AutoComplete, analisi del deck e interpretazione della richiesta di completamento. Se non è disponibile o restituisce JSON non valido, l'app ricade su Gemini BYOK o sulle regole locali. Related Card continua a usare DB, legalità e ranking E5 locale: il modello generativo non può inventare carte fuori dal catalogo filtrato.

“Gratis” dipende dalla disponibilità e dai limiti del provider; non è una quota garantita né illimitata.
