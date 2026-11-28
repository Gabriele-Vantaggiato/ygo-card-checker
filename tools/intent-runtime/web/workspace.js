const get = id => document.getElementById(id);
const storageKey = 'ygocc.deck-workspace.v1';
const request = get('request');
const deck = get('source-deck');
const submit = get('compose');

function element(tag, value) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
}

const renderers = {
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
    section.append(element('h3', block.title), renderers[block.type](block));
    return section;
  });
  document.documentElement.dataset.theme = view.layout.theme;
  get('view-title').textContent = view.title;
  get('blocks').dataset.columns = view.layout.columns;
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
  const input = { intent: request.value, deck: deck.value };
  try {
    const view = await json('/api/workspace', input);
    render(view);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ input, view }));
      get('save-status').textContent = 'Pagina salvata in questo browser.';
    } catch {
      get('save-status').textContent = 'Il browser non ha consentito il salvataggio.';
    }
  } catch (error) {
    get('error').textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

try {
  const status = await json('/api/status');
  deck.value = status.sample;
  request.placeholder = status.examplePrompt;
  for (const [id, prompt] of [['example', status.examplePrompt], ['variation', status.editPrompt]]) {
    const button = get(id);
    button.disabled = false;
    button.onclick = () => { request.value = prompt; request.focus(); };
  }
  submit.disabled = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.view?.version === 1) {
      render(saved.view);
      deck.value = saved.input.deck;
      request.value = saved.input.intent;
      get('save-status').textContent = 'Pagina ripristinata.';
    }
  } catch {
    get('save-status').textContent = 'Impossibile recuperare la pagina salvata.';
  }
} catch {
  get('error').textContent = 'Impossibile raggiungere Intent Runtime.';
}
