const get = id => document.getElementById(id);
const storageKey = 'ygocc.deck-workspace.v1';
const request = get('request');
const deck = get('source-deck');
const submit = get('compose');
const starters = get('starters');
const hand = get('hand-size');
const parentOrigins = new Set(['http://127.0.0.1:4200', 'http://localhost:4200']);
let sourceDeck = null;
let sourceChanged = 0;
let defaults;
let sourceReceived = false;

function applySource() {
  if (!defaults) return;
  deck.value = sourceDeck?.text ?? defaults.sample;
  deck.readOnly = Boolean(sourceDeck);
  starters.value = sourceDeck ? '' : defaults.sampleStarters;
  get('deck-source-status').textContent = sourceDeck ? `Dall’account YGOCC · ${sourceDeck.name}` : '';
  get('view-title').textContent = 'Anteprima';
  get('blocks').replaceChildren(element('p', 'Invia un prompt per vedere il risultato qui.'));
  get('save-status').textContent = '';
  get('error').textContent = '';
}

window.addEventListener('message', event => {
  if (window.parent === window || event.source !== window.parent || !parentOrigins.has(event.origin)) return;
  if (event.data?.type !== 'ygocc:deck-source') return;
  const incoming = event.data.deck;
  if (incoming !== null && (typeof incoming?.text !== 'string' || typeof incoming?.name !== 'string')) return;
  const firstSource = !sourceReceived;
  sourceReceived = true;
  if (!firstSource && incoming?.text === sourceDeck?.text && incoming?.name === sourceDeck?.name) return;
  sourceDeck = incoming;
  sourceChanged++;
  applySource();
});

function element(tag, value) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
}

const renderers = {
  notice() { return element('div'); },
  cards(block) {
    const content = element('div');
    for (const group of block.groups) {
      if (group.title) content.append(element('h4', group.title));
      const grid = element('ul');
      grid.className = 'card-grid';
      for (const card of group.cards) {
        const tile = element('li');
        const image = element('img');
        image.loading = 'lazy';
        image.alt = '';
        image.addEventListener('error', () => { image.hidden = true; });
        image.src = `/card-images/${card.id}.jpg`;
        tile.append(image, element('strong', card.quantity ? `${card.quantity}× ${card.name}` : card.name));
        if (card.partner) tile.append(element('small', `Trovata con ${card.partner}`));
        grid.append(tile);
      }
      content.append(group.cards.length ? grid : element('p', 'Nessuna corrispondenza nell’indice locale.'));
    }
    return content;
  },
  metrics(block) {
    const list = element('dl');
    for (const {label, value} of block.items) list.append(element('dt', label), element('dd', value));
    return list;
  },
  table(block) {
    const table = element('table');
    const heading = table.createTHead().insertRow();
    for (const column of block.columns) {
      const cell = element('th', column);
      cell.scope = 'col';
      heading.append(cell);
    }
    const body = table.createTBody();
    for (const row of block.rows) {
      const entry = body.insertRow();
      for (const value of row) entry.insertCell().textContent = value;
    }
    return table;
  }
};

function render(view) {
  const blocks = view.blocks.map(block => {
    const section = element('section');
    section.className = 'view-block';
    section.dataset.slot = block.slot ?? '';
    section.append(element('h3', block.title));
    if (block.note) section.append(element('p', block.note));
    section.append(renderers[block.type](block));
    return section;
  });
  document.documentElement.dataset.theme = view.layout.theme;
  get('view-title').textContent = sourceDeck?.name ?? view.title;
  get('blocks').dataset.columns = view.layout.columns;
  get('blocks').dataset.variant = view.layout.variant ?? '';
  get('blocks').replaceChildren(...blocks);
}

async function json(url, body) {
  const response = await fetch(url, body && {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}

get('workspace-form').addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  get('error').textContent = '';
  const input = { intent: request.value, deck: deck.value, starters: starters.value, hand: Number(hand.value) };
  const revision = sourceChanged;
  try {
    const view = await json('/api/workspace', input);
    if (revision !== sourceChanged) return;
    render(view);
    if (sourceDeck) {
      get('save-status').textContent = 'Vista composta dalla decklist dell’account.';
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ input, view }));
      get('save-status').textContent = 'Pagina salvata in questo browser.';
    } catch {
      get('save-status').textContent = 'Il browser non ha consentito il salvataggio.';
    }
  } catch (error) {
    if (revision === sourceChanged) get('error').textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

try {
  const status = await json('/api/status');
  defaults = status;
  deck.value = status.sample;
  starters.value = status.sampleStarters;
  deck.addEventListener('input', () => {
    if (deck.value !== status.sample && starters.value === status.sampleStarters) starters.value = '';
  });
  request.placeholder = status.dashboardPrompt;
  for (const [id, prompt] of [['dashboard', status.dashboardPrompt], ['example', status.examplePrompt], ['variation', status.editPrompt]]) {
    const button = get(id);
    button.disabled = false;
    button.onclick = () => {
      request.value = prompt;
      if (id === 'dashboard') get('analysis-options').open = true;
      request.focus();
    };
  }
  submit.disabled = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!sourceReceived && saved?.view?.version === 1) {
      render(saved.view);
      deck.value = saved.input.deck;
      request.value = saved.input.intent;
      starters.value = saved.input.starters ?? (deck.value === status.sample ? status.sampleStarters : '');
      hand.value = saved.input.hand ?? 5;
      get('save-status').textContent = 'Pagina ripristinata.';
    }
  } catch {
    get('save-status').textContent = 'Impossibile recuperare la pagina salvata.';
  }
  if (sourceReceived) applySource();
} catch {
  get('error').textContent = 'Impossibile raggiungere Intent Runtime.';
}

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const dictate = get('dictate');
const voiceStatus = get('voice-status');
if (Recognition) {
  const recognition = new Recognition();
  recognition.lang = 'it-IT';
  dictate.hidden = false;
  dictate.onclick = () => {
    try {
      recognition.start();
      dictate.disabled = true;
      voiceStatus.textContent = 'In ascolto. La dettatura può usare il servizio vocale del browser.';
    } catch {
      voiceStatus.textContent = 'Microfono non disponibile. Puoi scrivere il prompt.';
    }
  };
  recognition.onresult = event => {
    request.value = event.results[0][0].transcript;
    voiceStatus.textContent = 'Prompt trascritto. Puoi correggerlo e riprovare.';
    if (!submit.disabled) get('workspace-form').requestSubmit();
    else request.focus();
  };
  recognition.onerror = () => {
    voiceStatus.textContent = 'Dettatura non riuscita. Controlla il microfono o scrivi il prompt.';
  };
  recognition.onend = () => { dictate.disabled = false; };
} else {
  voiceStatus.textContent = 'Dettatura del browser non disponibile. Puoi usare il prompt scritto.';
}
