import { execFile, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dashboardPrompt, editPrompt, examplePrompt } from './deck-workspace.mjs';

const schema = fileURLToPath(new URL('./workspace-intent.schema.json', import.meta.url));

function codexOptions() {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  delete env.OPENAI_BASE_URL;
  return { cwd: tmpdir(), env, windowsHide: true };
}

export async function codexChatGptConnected(run = codex) {
  return /^logged in using chatgpt\s*$/im.test(await run(['login', 'status']));
}

export function startCodexLogin() {
  return spawn(process.env.INTENT_CODEX_BIN || 'codex', ['login'], {
    ...codexOptions(), stdio: 'ignore', timeout: 120000,
  });
}

function codex(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.INTENT_CODEX_BIN || 'codex', args, {
      ...codexOptions(), timeout: 45000, maxBuffer: 256000,
    }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(args[0] === 'login' ? stdout + '\n' + stderr : stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function runCodexJson(outputSchema, prompt, run = codex) {
  let auth;
  try { auth = await codexChatGptConnected(run); }
  catch { throw Error('Codex CLI non disponibile o accesso ChatGPT non attivo. Verifica con codex login status.'); }
  if (!auth) throw Error('È richiesto l’accesso a Codex con ChatGPT.');
  try {
    const output = await run([
      '-a', 'never', '--disable', 'shell_tool', '-c', 'mcp_servers={}', '-c', 'web_search="disabled"',
      '-c', 'model_provider="openai"', 'exec', '--ignore-user-config', '--skip-git-repo-check', '--ephemeral',
      '--sandbox', 'read-only', '--output-schema', outputSchema, '-',
    ], prompt);
    return JSON.parse(output);
  } catch { throw Error('Codex non ha restituito un piano valido. Verifica l’accesso e riprova.'); }
}

export async function interpretWorkspace(intent, run) {
  const result = await runCodexJson(schema, 'Classify this YGOCC layout request. dashboard = illustrated cards, probabilities or suggestions; table = alphabetical list with summary; compact = one column ordered by quantity; unsupported = other. Return only the view field. Do not call any tools. Request: ' + JSON.stringify(intent), run);
  const prompts = new Map([['dashboard', dashboardPrompt], ['table', examplePrompt], ['compact', editPrompt]]);
  if (!prompts.has(result?.view)) throw Error('La richiesta non corrisponde a una vista disponibile nel playground.');
  return prompts.get(result.view);
}
