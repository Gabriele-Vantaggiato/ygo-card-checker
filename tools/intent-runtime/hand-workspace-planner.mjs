const kinds = ['metrics', 'opening-hand', 'starter-chart', 'frequency-chart', 'combinations', 'decklist'];
const themes = ['duel', 'midnight', 'parchment'];
const scales = ['compact', 'normal', 'large'];

const registry = {
  'workspace.compose': 'Changes columns (1–3), theme, scale, or panel order and visibility.',
  'hand.simulate': 'Sets the sample count (integer from 1 to 100000).',
};
const grants = {
  create: new Set(Object.keys(registry)),
  modify: new Set(Object.keys(registry)),
};

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value, allowed) {
  return record(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validLayout(layout) {
  return keys(layout, ['columns', 'theme', 'scale', 'panels']) &&
    [1, 2, 3].includes(layout.columns) && themes.includes(layout.theme) &&
    scales.includes(layout.scale) && Array.isArray(layout.panels) &&
    layout.panels.length === kinds.length &&
    layout.panels.every((panel) => keys(panel, ['kind', 'visible']) &&
      kinds.includes(panel.kind) && typeof panel.visible === 'boolean') &&
    new Set(layout.panels.map(({ kind }) => kind)).size === kinds.length;
}

export function validPlanRequest(input) {
  return keys(input, ['intent', 'operation', 'layout']) &&
    Object.hasOwn(grants, input.operation) && typeof input.operation === 'string' &&
    typeof input.intent === 'string' && !!input.intent.trim() &&
    input.intent.length <= 2000 && validLayout(input.layout);
}

export function applyWorkspacePlan(plan, { operation, layout }) {
  if (!keys(plan, ['actions']) || !Array.isArray(plan.actions) || plan.actions.length > 2) {
    throw new Error('Il modello ha restituito un piano non valido.');
  }
  const result = { ...layout, samples: null };
  const seen = new Set();
  for (const action of plan.actions) {
    if (!record(action) || !grants[operation].has(action.capability) || seen.has(action.capability)) {
      throw new Error('Il piano richiede una capability non autorizzata o ripetuta.');
    }
    seen.add(action.capability);
    if (action.capability === 'workspace.compose') {
      if (!keys(action, ['capability', 'layout']) || !validLayout(action.layout)) {
        throw new Error('Il modello ha restituito un layout non valido.');
      }
      Object.assign(result, action.layout);
    }
    if (action.capability === 'hand.simulate') {
      if (!keys(action, ['capability', 'samples']) ||
          !Number.isInteger(action.samples) || action.samples < 1 || action.samples > 100000) {
        throw new Error('Il modello ha restituito un numero di simulazioni non valido.');
      }
      result.samples = action.samples;
    }
  }
  if (operation === 'modify' && !seen.size) {
    throw new Error('La richiesta non corrisponde a una modifica disponibile.');
  }
  return result;
}

export async function planHandWorkspace(input, { key, model, fetcher = fetch }) {
  const response = await fetcher('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: [
            'You plan a Yu-Gi-Oh opening-hand dashboard. Return JSON { "actions": [] }.',
            'Available capabilities: ' + JSON.stringify(registry),
            'For composition emit { "capability": "workspace.compose", "layout": { "columns": 2, "theme": "duel", "scale": "normal", "panels": [] } }.',
            'Include each panel kind exactly once as { "kind": "...", "visible": true }. Kinds: ' + kinds.join(', '),
            'Themes: ' + themes.join(', ') + '. Scales: ' + scales.join(', ') + '.',
            'For simulation emit { "capability": "hand.simulate", "samples": 10000 } only if the user requests a sample count.',
            'Preserve settings the user did not request to modify. Use no action for unsupported requests. Never generate code or simulation results.',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(input) },
      ],
    }),
  });
  if (!response.ok) throw new Error('Gateway AI non disponibile (HTTP ' + response.status + ').');
  const body = await response.json();
  let plan;
  try {
    plan = JSON.parse(body.choices?.[0]?.message?.content ?? '');
  } catch {
    throw new Error('Il modello ha restituito un piano non valido.');
  }
  return applyWorkspacePlan(plan, input);
}
