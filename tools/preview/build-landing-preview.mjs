/** Build a self-contained review surface from the actual Angular template, CSS and motion code.
 * Usage: node tools/preview/build-landing-preview.mjs /absolute/output-directory
 * This is a visual landing preview, not a deployment or a copy of the application backend.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? project + '/.preview');
await mkdir(output, { recursive: true });
const rootId = 'ygo-mobile-preview';
const read = (file) => readFile(resolve(project, file), 'utf8');
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const context = {
  t: (it) => it,
  decks: { activeDecklist: () => ({ id: 'preview', name: 'Il tuo Deck Studio' }) },
  library: { documents: () => [] },
};
// Only repository-owned template expressions run here, with no I/O capabilities.
const evaluate = (expression) => runInNewContext(expression, context, { timeout: 100 });
const destinations = {
  '/decklist': 'lp-deck',
  '/search': 'lp-search',
  '/flow': 'lp-flow',
  '/overlay': 'lp-overlay',
  '/combo': 'lp-flow',
};
let template = await read('src/app/features/landing/pages/landing.page.html');
template = template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) =>
  escape(evaluate(expression.trim())),
);
template = template.replace(/<a\b[^>]*>/g, (tag) => {
  const route = tag.match(/routerLink="([^"]+)"/);
  if (!route) return tag;
  const query = tag.match(/\[queryParams\]="([^"]+)"/);
  const search = query ? '?' + new URLSearchParams(evaluate('(' + query[1] + ')')) : '';
  return tag
    .replace(
      route[0],
      `href="#${destinations[route[1]]}" data-preview-route="${escape(route[1] + search)}"`,
    )
    .replace(/\s*\[queryParams\]="[^"]+"/, '');
});
template = template.replace(
  /\[(attr\.)?([\w-]+)\]="([^"]*)"/g,
  (_, prefix, attr, expression) => `${attr}="${escape(evaluate(expression))}"`,
);
template = template.replace(/\s+#landing\b/, '');
template = template.replace(/src="\/assets\/landing\/(\d+)\.jpg"/g, 'data-card-image="$1"');
if (template.includes('{{') || /\[(?:attr|queryParams|alt)/.test(template))
  throw new Error('Unresolved Angular expressions in preview.');

const css = postcss.parse(
  (await read('src/styles/landing.css')) + '\n' + (await read('src/styles/landing-cinema.css')),
);
css.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map((selector) =>
    selector.startsWith('html:has(')
      ? `#${rootId} .lp-preview-scroll${selector.slice(4)}`
      : `#${rootId} ${selector}`,
  );
});
const motion = ts
  .transpileModule(await read('src/app/features/landing/utils/landing-motion.ts'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  })
  .outputText.replace(/^export /gm, '');
const assets = {};
for (const id of ['89631139', '46986414', '84013237']) {
  assets[id] =
    'data:image/jpeg;base64,' +
    (await readFile(resolve(project, `public/assets/landing/${id}.jpg`))).toString('base64');
}

const shellCss = `
#${rootId} { width:100%; color:#e9e4d8; font-family:'DM Sans',sans-serif; background:transparent; }
#${rootId} .lp-preview-device { position:relative; width:min(100%,390px); margin:0 auto; border:1px solid #45413a; border-radius:18px; overflow:hidden; background:#0c0d10; box-shadow:0 14px 48px #0002; }
#${rootId} .lp-preview-scroll { height:720px; overflow-y:auto; overflow-x:clip; scroll-behavior:smooth; overscroll-behavior:contain; scrollbar-width:none; position:relative; }
#${rootId} .lp-preview-scroll::-webkit-scrollbar { display:none; }
#${rootId} .lp-preview-header { box-sizing:border-box; height:64px; position:sticky; z-index:30; top:0; background:#111316; border-bottom:1px solid #303237; padding:10px 18px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
#${rootId} .lp-preview-brand { display:inline-flex; align-items:center; gap:9px; text-decoration:none; color:#d5b77a; font:600 15px 'Rajdhani',sans-serif; letter-spacing:.1em; }
#${rootId} .lp-preview-seal { font:28px Georgia,serif; }
#${rootId} .lp-preview-language { display:flex; align-items:center; gap:6px; font-size:10px; color:#d5b77a; letter-spacing:.12em; }
#${rootId} .lp-preview-nav { display:flex; align-items:center; height:68px; background:#191c20; border-top:1px solid #303237; gap:3px; padding:0 7px; }
#${rootId} .lp-preview-nav a { min-height:54px; flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; color:#b1aea4; text-decoration:none; font:400 9px 'DM Sans',sans-serif; }
#${rootId} .lp-preview-nav svg { width:19px; height:19px; }
#${rootId} .lp-preview-footer { padding:25px; background:#101215; color:#aaa394; font:400 10px/1.8 'DM Sans',sans-serif; text-align:center; }
#${rootId} .lp-preview-caption { margin:12px auto 0; max-width:390px; color:inherit; opacity:.75; text-align:center; font:400 11px/1.6 'DM Sans',sans-serif; }
#${rootId} :where(a,input,summary):focus-visible { outline:2px solid #d5b77a; outline-offset:4px; }
#${rootId} [data-motion='off'] { scroll-behavior:auto; }
@media (prefers-reduced-motion:reduce) { #${rootId} .lp-preview-scroll { scroll-behavior:auto; } }
`;

const fragment = `<div id="${rootId}">
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Cinzel:wght@400;500;600&family=Rajdhani:wght@500;600&display=swap');
${shellCss}
${css.toString()}
</style>
<div class="lp-preview-device">
<div class="lp-preview-scroll" aria-label="Preview mobile YGOCardChecker">
<header class="lp-preview-header"><a class="lp-preview-brand" href="#lp-title"><span class="lp-preview-seal" aria-hidden="true">✦</span>YGO CHECKER</a><span class="lp-preview-language">IT <span aria-hidden="true">⌄</span></span></header>
${template}
<footer class="lp-preview-footer">YGO Card Checker · Deck Studio<br>Progetto indipendente · Dati carte: YGOPRODeck</footer>
</div>
<nav class="lp-preview-nav" aria-label="Strumenti">
<a href="#lp-deck"><i data-lucide="layers" aria-hidden="true"></i>Decklist</a>
<a href="#lp-search"><i data-lucide="search" aria-hidden="true"></i>Ricerca</a>
<a href="#lp-overlay"><i data-lucide="scan" aria-hidden="true"></i>Overlay</a>
<a href="#lp-flow"><i data-lucide="git-merge" aria-hidden="true"></i>Combo</a>
<a href="#lp-flow"><i data-lucide="workflow" aria-hidden="true"></i>Flow Studio</a>
</nav>
</div>
<p class="lp-preview-caption" role="status">Preview mobile · Scorri per esplorare</p>
<script>
(() => {
const root = document.getElementById('${rootId}');
if (!root) return;
const viewport = root.querySelector('.lp-preview-scroll');
const page = root.querySelector('.duel-landing');
const assets = ${JSON.stringify(assets)};
root.querySelectorAll('[data-card-image]').forEach(img => { img.src = assets[img.dataset.cardImage]; });
${motion}
const controller = createLandingMotion(page, viewport);
root.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const target = root.querySelector(link.getAttribute('href'));
  if (!target) return;
  event.preventDefault();
  const top = target.id === 'lp-title' ? 0 : target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - 116;
  viewport.scrollTo({top, behavior: page.dataset.motion === 'off' ? 'instant' : 'smooth'});
  root.querySelector('.lp-preview-caption').textContent = link.dataset.previewRoute
    ? 'Preview della landing · Lo strumento si aprirà nell’app completa.'
    : 'Preview mobile · Scorri per esplorare';
});
window.addEventListener('pagehide', () => controller.destroy(), {once:true});
})();
</script>
</div>
`;
if (Buffer.byteLength(fragment) > 1_000_000) throw new Error('Inline preview is over 1 MB.');
// Parse the finished script to catch syntax errors before returning an interactive preview.
new (await import('node:vm')).Script(fragment.match(/<script>([\s\S]*?)<\/script>/)[1]);
await writeFile(resolve(output, 'ygo-landing-mobile.html'), fragment);
// Export also works offline, with the existing system fonts as a fallback.
const standalone =
  `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>YGOCardChecker · Cinema preview</title>
  <style>body{margin:0;background:#17191d;color:#e9e4d8}body>div{margin:auto}
  .review-tools{height:48px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;font:12px system-ui}
  .review-tools button{padding:6px 14px;border:1px solid #756342;border-radius:20px;background:transparent;color:#e9e4d8;cursor:pointer}
  .review-tools button[aria-pressed="true"]{background:#d5b77a;color:#101215}
  body #${rootId} .lp-preview-scroll{height:calc(100dvh - 118px)}
  #${rootId} .lp-preview-caption{display:none}
  #${rootId}.lp-preview-wide .lp-preview-device{width:100%;border-radius:0;border-inline:0}
  @media(max-width:420px){body #${rootId} .lp-preview-device{width:100%;border:0;border-radius:0}}
  </style></head><body>
  <div class="review-tools" role="group" aria-label="Formato della preview"><span>PREVIEW</span><button type="button" data-review="phone" aria-pressed="true">Telefono</button><button type="button" data-review="desktop" aria-pressed="false">Desktop</button></div>` +
  fragment +
  `<script>document.querySelectorAll('[data-review]').forEach(button=>button.addEventListener('click',()=>{
    document.getElementById('${rootId}').classList.toggle('lp-preview-wide',button.dataset.review==='desktop');
    document.querySelectorAll('[data-review]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  }));</script></body></html>`;
await writeFile(resolve(output, 'YGOCardChecker-Preview-Mobile.html'), standalone);
console.log(`Preview generated from source: ${Buffer.byteLength(fragment)} bytes`);
console.log(resolve(output, 'ygo-landing-mobile.html'));
