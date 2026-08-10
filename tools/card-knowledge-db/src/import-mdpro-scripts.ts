import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './database';

const DEFAULT_ZIP = 'C:\\Games\\MDPro3\\Data\\script.zip';
const CACHE_DIR = join(REPO_ROOT, 'tools', 'card-knowledge-db', 'mdpro-scripts');
const MARKER = join(CACHE_DIR, '.extracted');

function resolveZipPath(): string | null {
  const fromEnv = process.env['MDPRO_SCRIPT_ZIP']?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  if (existsSync(DEFAULT_ZIP)) {
    return DEFAULT_ZIP;
  }
  return null;
}

function extractAll(zipPath: string): number {
  mkdirSync(CACHE_DIR, { recursive: true });
  const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = '${zipPath.replace(/'/g, "''")}'
$out = '${CACHE_DIR.replace(/'/g, "''")}'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$z = [IO.Compression.ZipFile]::OpenRead($zip)
$count = 0
foreach ($e in $z.Entries) {
  if ($e.FullName -notmatch '^script/c\\d+\\.lua$') { continue }
  $name = [IO.Path]::GetFileName($e.FullName)
  $dest = Join-Path $out $name
  $sr = New-Object IO.StreamReader($e.Open())
  $text = $sr.ReadToEnd()
  $sr.Close()
  [IO.File]::WriteAllText($dest, $text)
  $count++
}
$z.Dispose()
Write-Output $count
`;
  const result = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'MDPro extract failed');
  }
  const count = Number((result.stdout || '').trim().split(/\r?\n/).pop());
  writeFileSync(MARKER, new Date().toISOString(), 'utf8');
  return Number.isFinite(count) ? count : readdirSync(CACHE_DIR).filter((f) => f.endsWith('.lua')).length;
}

async function main(): Promise<void> {
  const zipPath = resolveZipPath();
  if (!zipPath) {
    console.warn(`MDPro script.zip not found. Set MDPRO_SCRIPT_ZIP or install at ${DEFAULT_ZIP}`);
    process.exit(0);
  }

  const existing = existsSync(CACHE_DIR)
    ? readdirSync(CACHE_DIR).filter((f) => f.endsWith('.lua')).length
    : 0;

  if (existsSync(MARKER) && existing > 1000) {
    console.log(`MDPro cache already present (${existing} lua files) at ${CACHE_DIR}`);
  } else {
    console.log(`Extracting MDPro scripts from ${zipPath}…`);
    const count = extractAll(zipPath);
    console.log(`Extracted ${count} lua files → ${CACHE_DIR}`);
  }

  console.log('Rebuilding effect scripts with MDPro lua…');
  const build = spawnSync('npm', ['run', 'db:effect-scripts'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
