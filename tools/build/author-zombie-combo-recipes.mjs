import { mkdir, writeFile } from 'node:fs/promises';

// Authored procedures, grounded in the installed MDPro4 EN card text on 2026-11-02.
// The runtime matches section/copy prerequisites; it does not certify a whole duel.
const C = { master: 17259470, mezuki: 92826944, goblind: 25259669, goblin: 63665875,
  plague: 33420078, painter: 21620076, world: 4064256, foolish: 81439173, poly: 48130397,
  hades: 5309481, doom: 6021033, beelze: 34408491, skull: 59969392, chain: 34086406,
  dweller: 21044178, ark: 48739166, dragonecro: 8198620, druid: 24062258 };
const item = (card, caption, zone = 'field', join = 'arrow', action = 'none') => ({ card, caption, zone, join, action });
const step = (title, text, cards, flow = [], kind = 'action') => ({ title, text, cards, ...(flow.length ? { flow } : {}), kind });
const recipes = [];
function add(key, title, main, extra, startingCards, endCards, description, steps, endFlow, deck = {}) {
  // MDPro4 records the activation prompt before the selected cost and its resolution.
  for (const procedure of steps) {
    if (procedure.title === 'Stacca Goblin e manda Mezuki') procedure.flow.unshift(item(C.chain, 'Attiva Chain, stacca Goblin e manda Mezuki', 'field', 'none', 'activate'));
    if (procedure.title === 'Mezuki recupera Goblin') procedure.flow.unshift(item(C.mezuki, 'Attiva Mezuki dal Cimitero', 'graveyard', 'none', 'activate'));
    if (['Rievoca il Tuner','Rievoca Plaguespreader'].includes(procedure.title)) {
      const resolution = procedure.flow.filter(node => node.action !== 'return' && !(node.action === 'activate' && node.card === C.plague));
      procedure.flow = [item(C.plague,'Attiva dal Cimitero','graveyard','none','activate'),
        item(0,'Scegli una carta dalla mano da mettere in cima al Deck','deck','arrow','return'),...resolution];
    }
  }
  recipes.push({ key, main, extra, deck, guide: { id: key, title, description,
    startingCards, endCards, requiredCards: [...new Set([...Object.keys(main), ...Object.keys(extra)].map(Number))], playsAround: [],
    startFlow: startingCards.map((card, i) => item(card, card ? 'Carta iniziale' : 'Una carta aggiuntiva in mano', 'hand', i ? 'plus' : 'none')),
    endFlow: endFlow || endCards.map((card, i) => item(card, 'Campo finale della linea', 'field', i ? 'plus' : 'none')),
    steps } });
}
const openGoblind = (body) => step('Due mostri con una Normal Summon',
  'Evoca Normalmente Goblindbergh e attiva il suo effetto per Evocare Specialmente dalla mano il secondo mostro di Livello 4. Goblindbergh passa in Difesa. Questa è l’unica Evocazione Normale della linea.',
  [C.goblind, body], [item(C.goblind, 'Evocazione Normale', 'field', 'none', 'normal-summon'), item(C.goblind, 'Attiva l’effetto di Goblindbergh', 'field', 'arrow', 'activate'), item(body, 'Dalla mano', 'field', 'arrow', 'special-summon')], 'summon');
const openMaster = (body) => step('Invia il mostro e rievocalo',
  'Evoca Normalmente Zombie Master. Attiva il suo effetto una volta: manda il mostro Zombie dalla mano al Cimitero come costo, poi scegli quello stesso mostro come bersaglio ed Evocalo Specialmente. Il costo precede la scelta del bersaglio. Zombie Master deve restare scoperto fino alla risoluzione.',
  [C.master, body], [item(C.master, 'Evocazione Normale', 'field', 'none', 'normal-summon'), item(C.master, 'Attiva Zombie Master e paga il costo', 'field', 'arrow', 'activate'), item(body, 'Costo dalla mano', 'graveyard', 'arrow', 'send'), item(body, 'Bersaglio dopo il costo', 'field', 'arrow', 'special-summon')], 'effect');

for (const [opener, open, title] of [[C.goblind, openGoblind, 'Goblindbergh'], [C.master, openMaster, 'Zombie Master']]) {
  add(`${opener}-goblin-chain-mezuki`, `${title} + Goblin Zombie → Chain e Goblin`,
    { [opener]: 1, [C.goblin]: 1, [C.mezuki]: 1 }, { [C.chain]: 1 }, [opener, C.goblin], [C.chain, C.goblin],
    'Apertura a due carte, Normal Summon disponibile. Mezuki deve essere ancora nel Deck. Lavalval Chain deve essere nell’Extra Deck. La linea si interrompe se i bersagli o gli effetti vengono negati.', [
      open(C.goblin),
      step('Evoca Lavalval Chain', 'Sovrapponi i due mostri di Livello 4 per Evocare Xyz Lavalval Chain. Entrambi diventano materiali.', [opener, C.goblin, C.chain], [item(opener, 'Livello 4', 'field', 'none'), item(C.goblin, 'Livello 4', 'field', 'plus'), item(C.chain, 'Xyz con 2 materiali', 'field', 'arrow', 'special-summon')], 'summon'),
      step('Stacca Goblin e manda Mezuki', 'Attiva l’effetto di Lavalval Chain: stacca Goblin Zombie come costo e scegli l’opzione che manda una carta dal Deck al Cimitero. Manda Mezuki. Goblin Zombie NON cerca: staccare un materiale Xyz non equivale a mandarlo dal campo al Cimitero.', [C.chain, C.goblin, C.mezuki], [item(C.goblin, 'Stacca come costo: nessuna ricerca', 'graveyard', 'none', 'send'), item(C.mezuki, 'Dal Deck al Cimitero', 'graveyard', 'arrow', 'send')], 'effect'),
      step('Mezuki recupera Goblin', 'Bandi Mezuki dal Cimitero come costo, scegli Goblin Zombie nel tuo Cimitero ed Evocalo Specialmente. Termini con Lavalval Chain con un materiale e Goblin Zombie sul campo.', [C.mezuki, C.goblin], [item(C.mezuki, 'Bandi come costo', 'banished', 'none', 'banish'), item(C.goblin, 'Ritorna sul campo', 'field', 'arrow', 'special-summon')], 'effect'),
    ], [item(C.chain, '1 materiale rimasto', 'field', 'none'), item(C.goblin, 'Rievocato da Mezuki', 'field', 'plus')], { [C.mezuki]: 1 });
}

for (const intermediate of [C.hades, C.doom]) {
  const label = intermediate === C.hades ? 'Ha Des' : 'Doomkaiser';
  add(`master-plague-${intermediate}-beelze`, `Zombie Master → ${label} → Beelze`,
    { [C.master]: 1, [C.plague]: 1 }, { [intermediate]: 1, [C.beelze]: 1 }, [C.master, C.plague, 0], [C.beelze],
    'Tre carte in mano: Zombie Master, Plaguespreader Zombie e una carta da mettere in cima al Deck. Normal Summon disponibile. Non richiede mostri nel Cimitero iniziale. Non usare due volte l’effetto dello stesso Zombie Master.', [
      openMaster(C.plague),
      step(`Prima Synchro: ${label}`, 'Usa Plaguespreader Zombie di Livello 2 e Zombie Master di Livello 4 per la Synchro di Livello 6. Il Tuner ha il nome richiesto e il non-Tuner è Zombie. Plaguespreader è stato rievocato da Zombie Master, quindi per ora va al Cimitero normalmente.', [C.plague, C.master, intermediate], [item(C.plague, 'Tuner Livello 2', 'graveyard', 'none', 'send'), item(C.master, 'Zombie Livello 4', 'graveyard', 'plus', 'send'), item(intermediate, 'Synchro Livello 6', 'field', 'arrow', 'special-summon')], 'summon'),
      step('Rievoca Plaguespreader', 'Attiva l’effetto di Plaguespreader dal Cimitero. Metti la terza carta della mano in cima al Deck come costo ed Evocalo Specialmente. Da ora sarà bandito quando lascia il campo. L’eventuale effetto di Doomkaiser sul Cimitero avversario non è necessario per questa linea.', [C.plague], [item(0, 'Terza carta in cima al Deck', 'deck', 'none', 'return'), item(C.plague, 'Rievocato dal proprio effetto', 'field', 'arrow', 'special-summon')], 'effect'),
      step('Seconda Synchro: Beelze', 'Usa Plaguespreader di Livello 2 e la Synchro di Livello 6 per Evocare Beelze. Plaguespreader è un Tuner OSCURITÀ, quindi soddisfa i materiali. Viene bandito; la prima Synchro va al Cimitero. Beelze è il campo finale di questa variante.', [C.plague, intermediate, C.beelze], [item(C.plague, 'Tuner OSCURITÀ: viene bandito', 'banished', 'none', 'banish'), item(intermediate, 'Non-Tuner Livello 6', 'graveyard', 'plus', 'send'), item(C.beelze, 'Synchro Livello 8', 'field', 'arrow', 'special-summon')], 'summon'),
    ]);
}

for (const target of [C.hades, C.doom]) {
  add(`foolish-goblin-${target}`, `Foolish + Goblin Zombie → ${target === C.hades ? 'Ha Des' : 'Doomkaiser'} e ricerca`,
    { [C.foolish]: 1, [C.goblin]: 1, [C.plague]: 1, [C.mezuki]: 1 }, { [target]: 1 }, [C.foolish, C.goblin, 0], [target, C.mezuki],
    'Servono Foolish Burial, Goblin Zombie e una carta aggiuntiva in mano. Plaguespreader e almeno un Mezuki devono essere nel Deck. Normal Summon disponibile. Mezuki nel riepilogo finale è in mano, non sul campo.', [
      step('Prepara il Tuner', 'Attiva Foolish Burial e manda Plaguespreader Zombie dal Deck al Cimitero.', [C.foolish, C.plague], [item(C.foolish, 'Attiva', 'graveyard', 'none', 'activate'), item(C.plague, 'Dal Deck al Cimitero', 'graveyard', 'arrow', 'send')], 'effect'),
      step('Evoca Goblin Zombie', 'Evoca Normalmente Goblin Zombie. Non hai ancora usato il suo effetto di ricerca: richiede di essere mandato dal campo al Cimitero.', [C.goblin], [item(C.goblin, 'Normal Summon', 'field', 'none', 'normal-summon')], 'summon'),
      step('Rievoca il Tuner', 'Metti la carta aggiuntiva della mano in cima al Deck come costo per l’effetto di Plaguespreader. Evocalo Specialmente; sarà bandito quando lascia il campo.', [C.plague], [item(0, 'Carta aggiuntiva in cima', 'deck', 'none', 'return'), item(C.plague, 'Rievocazione', 'field', 'arrow', 'special-summon')], 'effect'),
      step('Synchro e innesco di Goblin', 'Usa il Tuner di Livello 2 e Goblin Zombie di Livello 4 per la Synchro Zombie di Livello 6. Plaguespreader viene bandito. Goblin Zombie va dal campo al Cimitero: il suo effetto di ricerca può quindi innescarsi.', [C.plague, C.goblin, target], [item(C.plague, 'Bandito dopo la rievocazione', 'banished', 'none', 'banish'), item(C.goblin, 'Dal campo al Cimitero', 'graveyard', 'plus', 'send'), item(target, 'Synchro', 'field', 'arrow', 'special-summon')], 'summon'),
      step('Cerca il seguito', 'Risolvi Goblin Zombie aggiungendo Mezuki dal Deck alla mano: è uno Zombie con DEF non superiore a 1200. Hai preparato una risorsa per il turno seguente, non una rievocazione immediata. Un’eventuale rievocazione di Doomkaiser dal Cimitero avversario dipende da un bersaglio valido e non è inclusa nel campo garantito dalla linea.', [C.goblin, C.mezuki], [item(C.goblin, 'Effetto dal Cimitero', 'graveyard', 'none', 'activate'), item(C.mezuki, 'Aggiunto alla mano', 'hand', 'arrow', 'search')], 'effect'),
    ], [item(target, 'Synchro sul campo', 'field', 'none'), item(C.mezuki, 'Risorsa per il seguito', 'hand', 'plus')], { [C.plague]: 1, [C.mezuki]: 1 });
}

add('goblind-goblin-dweller', 'Goblindbergh + Goblin Zombie → Abyss Dweller',
  { [C.goblind]: 1, [C.goblin]: 1 }, { [C.dweller]: 1 }, [C.goblind, C.goblin], [C.dweller],
  'Due carte, Normal Summon disponibile. Non richiede il Cimitero né Zombie World. Goblin Zombie non cerca quando viene sovrapposto o staccato da un Xyz.', [
    openGoblind(C.goblin),
    step('Prepara la risposta al Cimitero', 'Sovrapponi i due Livello 4 per Evocare Abyss Dweller con due materiali. Puoi staccare un materiale per impedire all’avversario di attivare effetti nel Cimitero per il resto di quel turno, rispettando il timing. Non ottieni il bonus ATK legato a un materiale ACQUA da questi materiali.', [C.goblind, C.goblin, C.dweller], [item(C.goblind, 'Livello 4', 'field', 'none'), item(C.goblin, 'Livello 4', 'field', 'plus'), item(C.dweller, 'Xyz con 2 materiali', 'field', 'arrow', 'special-summon')], 'summon'),
  ]);

add('master-mezuki-ark', 'Zombie Master + Mezuki → Number 101',
  { [C.master]: 1, [C.mezuki]: 1 }, { [C.ark]: 1 }, [C.master, C.mezuki], [C.ark],
  'Due carte, Normal Summon disponibile. Number 101 richiede due mostri di Livello 4: Zombie Master e Mezuki soddisfano i materiali. Il suo effetto di rimozione richiede un bersaglio avversario valido e non è un risultato automatico.', [
    openMaster(C.mezuki),
    step('Evoca Number 101', 'Sovrapponi Zombie Master e Mezuki per l’Evocazione Xyz di Number 101: Silent Honor ARK. Mezuki è sotto l’Xyz come materiale: non è ancora nel Cimitero e non puoi attivarne l’effetto dal Cimitero.', [C.master, C.mezuki, C.ark], [item(C.master, 'Mostro con Effetto Livello 4', 'field', 'none'), item(C.mezuki, 'Mostro con Effetto Livello 4', 'field', 'plus'), item(C.ark, 'Xyz con 2 materiali', 'field', 'arrow', 'special-summon')], 'summon'),
  ]);

add('world-goblind-master-painter-skull', 'Zombie World + Pain Painter → Archfiend Zombie-Skull',
  { [C.world]: 1, [C.goblind]: 1, [C.master]: 1, [C.painter]: 1 }, { [C.skull]: 1 }, [C.world, C.goblind, C.master, C.painter], [C.skull],
  'Linea a quattro carte. Zombie World deve restare attiva. Archfiend Zombie-Skull richiede Plaguespreader Zombie e almeno due non-Tuner Zombie: un singolo non-Tuner non basta. Normal Summon disponibile.', [
    step('Attiva Zombie World', 'Attiva Zombie World prima di usare gli effetti successivi: i mostri sul campo e nei Cimiteri diventano Zombie. Goblindbergh deve essere Zombie per il passaggio di Pain Painter.', [C.world], [item(C.world, 'Deve restare attiva', 'field', 'none', 'activate')], 'effect'),
    openGoblind(C.master),
    step('Zombie Master rievoca Pain Painter', 'Con Zombie Master manda Pain Painter dalla mano al Cimitero come costo, poi scegli lo stesso Pain Painter come bersaglio e rievocalo. È uno Zombie di Livello 2. Zombie Master deve restare scoperto.', [C.master, C.painter], [item(C.painter, 'Costo dalla mano', 'graveyard', 'none', 'send'), item(C.painter, 'Rievocato', 'field', 'arrow', 'special-summon')], 'effect'),
    step('Porta i due non-Tuner a Livello 2', 'Pain Painter sul campo assume il nome Plaguespreader Zombie. Usa il suo effetto su Goblindbergh e Zombie Master, entrambi Zombie grazie a Zombie World: diventano di Livello 2. Possono essere usati come materiali Synchro soltanto per un mostro Zombie.', [C.painter, C.goblind, C.master], [item(C.painter, 'Nome: Plaguespreader Zombie', 'field', 'none', 'activate'), item(C.goblind, 'Zombie Livello 2', 'field', 'plus'), item(C.master, 'Zombie Livello 2', 'field', 'plus')], 'effect'),
    step('Synchro con tre materiali', 'Usa Pain Painter (Tuner Livello 2 con il nome richiesto) e i due non-Tuner Zombie di Livello 2 per Evocare Archfiend Zombie-Skull, Livello 6. Il suo Tipo originale è Zombie, quindi rispetta anche la restrizione di Pain Painter.', [C.painter, C.goblind, C.master, C.skull], [item(C.painter, 'Tuner Livello 2', 'graveyard', 'none', 'send'), item(C.goblind, 'Non-Tuner Zombie Livello 2', 'graveyard', 'plus', 'send'), item(C.master, 'Non-Tuner Zombie Livello 2', 'graveyard', 'plus', 'send'), item(C.skull, 'Synchro Zombie Livello 6', 'field', 'arrow', 'special-summon')], 'summon'),
  ]);

add('world-superpoly-dragonecro', 'Situazionale: Zombie World + Super Polymerization',
  { [C.world]: 1, [C.poly]: 1 }, { [C.dragonecro]: 1 }, [C.world, C.poly, 0], [C.dragonecro],
  'LINEA CONDIZIONALE: richiede già due mostri scoperti sul campo utilizzabili come Materiali da Fusione, propri o avversari. La sola mano iniziale non li fornisce. Serve inoltre una carta da scartare. Non presumere che un mostro immune agli effetti diventi Zombie.', [
    step('Verifica i materiali sul campo', 'Con Zombie World attiva, verifica che i due mostri sul campo siano effettivamente Zombie e utilizzabili per la Fusione. Super Polymerization non bersaglia. Non usare materiali non idonei e non presumere la presenza di mostri avversari.', [C.world], [item(C.world, 'Effetto attivo', 'field', 'none'), item(0, 'Materiale Zombie già sul campo', 'field', 'plus'), item(0, 'Secondo materiale Zombie', 'field', 'plus')], 'note'),
    step('Scarta e attiva Super Polymerization', 'Scarta la carta aggiuntiva come costo e attiva Super Polymerization. Nessun giocatore può attivare carte o effetti in risposta alla sua attivazione. Controlla comunque restrizioni e immunità applicabili.', [C.poly], [item(0, 'Scarta come costo', 'graveyard', 'none', 'discard'), item(C.poly, 'Attiva Fusione', 'field', 'arrow', 'activate')], 'effect'),
    step('Evoca Dragonecro', 'Usa i due Zombie sul campo come materiali per Evocare tramite Fusione Dragonecro Nethersoul Dragon. Questa scheda non presuppone un attacco né la creazione di un Token.', [C.dragonecro], [item(C.dragonecro, 'Fusione: 2 mostri Zombie', 'field', 'none', 'special-summon')], 'summon'),
  ]);

add('foolish-goblin-plague-hades', 'Goblin Zombie + Foolish Burial → Ha Des e ricerca',
  { [C.goblin]: 1, [C.foolish]: 1, [C.plague]: 1, [C.master]: 1 }, { [C.hades]: 1 }, [C.goblin,C.foolish,0], [C.hades,C.master],
  'Normal Summon disponibile. Richiede Goblin Zombie, Foolish Burial e una carta da mettere in cima al Deck. Plaguespreader Zombie e uno Zombie Master devono essere ancora nel Deck. La ricerca non è un mostro aggiuntivo sul campo.', [
    step('Evoca Goblin Zombie','Evoca Normalmente Goblin Zombie, Livello 4. Conserva una carta in mano per il costo di Plaguespreader Zombie.',[C.goblin],[item(C.goblin,'Evocazione Normale','field','none','normal-summon')],'summon'),
    step('Foolish Burial prepara il Tuner','Attiva Foolish Burial e manda Plaguespreader Zombie dal Deck al Cimitero. Non mandare Mezuki per questa variante.',[C.foolish,C.plague],[item(C.foolish,'Attiva e manda Plaguespreader','field','none','activate'),item(C.plague,'Dal Deck al Cimitero','graveyard','arrow','send')],'effect'),
    step('Rievoca Plaguespreader','Attiva Plaguespreader Zombie nel Cimitero: metti una carta dalla mano in cima al Deck come costo. Puoi usare Mind Pollutant o un’altra carta non necessaria alla linea. Alla risoluzione Evoca Specialmente Plaguespreader Zombie. Sarà bandito quando lascia il campo.',[C.plague],[item(C.plague,'Attiva dal Cimitero','graveyard','none','activate'),item(C.plague,'Tuner Livello 2','field','arrow','special-summon')],'effect'),
    step('Synchro di Livello 6','Usa Plaguespreader Zombie, Tuner Livello 2, e Goblin Zombie, non-Tuner Zombie Livello 4, per Evocare Revived King Ha Des. Plaguespreader viene bandito; Goblin Zombie va al Cimitero.',[C.plague,C.goblin,C.hades],[item(C.hades,'Synchro con i due Zombie','field','none','special-summon')],'summon'),
    step('Ricerca di Goblin Zombie','Attiva l’effetto di Goblin Zombie mandato dal campo al Cimitero. Aggiungi Zombie Master dal Deck alla mano: ha 0 DEF e rispetta il limite di 1200 DEF. Questa ricerca non fornisce una seconda Normal Summon.',[C.goblin,C.master],[item(C.goblin,'Attiva la ricerca','graveyard','none','activate'),item(C.master,'Risorsa per i turni successivi','hand','arrow','search')],'effect'),
  ],[item(C.hades,'Synchro sul campo','field','none'),item(C.master,'Cercato, ancora in mano','hand','plus')],{ [C.plague]: 1,[C.master]: 1 });

const destination = new URL('../../src/assets/data/combo-sheets/deck-recipes.json', import.meta.url);
await mkdir(new URL('.', destination), { recursive: true });
await writeFile(destination, JSON.stringify(recipes, null, 2) + '\n');
console.log(`Authored ${recipes.length} Zombie combo recipes.`);
