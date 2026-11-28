/**
 * Starts the local services and Angular together (Windows-friendly).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let stopping = false;

function run(command, args, name, onOutput) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: onOutput ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    shell: false,
    windowsHide: true,
    env: process.env,
  });
  if (onOutput) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      onOutput(data);
    });
  }
  child.on('error', (error) => {
    console.error(`[${name}] could not start: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (signal) {
      console.log(`[${name}] killed (${signal})`);
    } else if (code) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

const kids = [];
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const k of kids) {
    try {
      k.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

kids.push(run(process.execPath, ['tools/gemini-dev-proxy.mjs'], 'gemini-proxy'));
let runtimeReady = false;
let runtimeOutput = '';
const runtimeDeadline = setTimeout(() => {
  console.error('[intent-runtime] non pronto sulla porta 4190. Controlla gli errori di avvio sopra.');
  shutdown(1);
}, 15000);
kids.push(run(process.execPath, ['--watch', 'tools/intent-runtime/server.mjs', '4190'], 'intent-runtime', (data) => {
  if (runtimeReady) return;
  runtimeOutput = (runtimeOutput + data).slice(-1000);
  if (!runtimeOutput.includes('Intent Runtime: http://127.0.0.1:4190')) return;
  runtimeReady = true;
  clearTimeout(runtimeDeadline);
  kids.push(run(process.execPath, [
    path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
    'serve', '--host', '127.0.0.1', '--proxy-config', 'proxy.conf.json',
  ], 'ng-serve'));
}));
