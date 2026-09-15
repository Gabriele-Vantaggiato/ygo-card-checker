/**
 * Starts Gemini local proxy + `ng serve` together (Windows-friendly).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function run(command, args, name) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  child.on('exit', (code, signal) => {
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
kids.push(run(isWin ? 'npx.cmd' : 'npx', ['ng', 'serve', '--proxy-config', 'proxy.conf.json'], 'ng-serve'));
