import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { demoPlan, execute, sample, source, validatePlan } from './kernel.mjs';
import { composeDeckWorkspace, dashboardPrompt, editPrompt, examplePrompt } from './deck-workspace.mjs';
import { cardImage } from './card-image.mjs';

export async function planWithAI(intent, fetcher=fetch) {
  if (!process.env.AI_GATEWAY_API_KEY || !process.env.INTENT_MODEL) throw Error('AI non configurata: imposta AI_GATEWAY_API_KEY e INTENT_MODEL sul server.');
  const response=await fetcher('https://ai-gateway.vercel.sh/v1/chat/completions', {method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${process.env.AI_GATEWAY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.INTENT_MODEL,messages:[{role:'system',content:'Return only JSON {"tools":["combo" and/or "optimize"],"views":["timeline","metrics","changes","audit"]}. Supported domain: combo = fixed Scrap Chimera/Beast/Dragon scenario; optimize = Geargia starter probability heuristic HAT. Select only relevant tools; timeline requires combo; metrics and changes require optimize; always include timeline for combo, metrics for optimize, audit. Unsupported intent: return {}. Never supply code, card effects or numbers.'},{role:'user',content:intent}],response_format:{type:'json_object'},max_tokens:500})});
  if (!response.ok) throw Error(`Gateway AI: HTTP ${response.status}. Nessun fallback simulato.`);
  const body=await response.json();
  return validatePlan(JSON.parse(body.choices?.[0]?.message?.content ?? '{}'));
}
export function createServer() {
  return http.createServer(async(req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
    try {
      if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(req.headers.host ?? '')) return send(403,{error:'Host non consentito.'});
      if (req.method==='GET' && req.url==='/api/status') return send(200,{aiAvailable:Boolean(process.env.AI_GATEWAY_API_KEY && process.env.INTENT_MODEL),sample,source,examplePrompt,editPrompt,dashboardPrompt,sampleStarters:'Geargiarmor, Geargiarsenal'});
      const image = req.method==='GET' && /^\/card-images\/(\d{1,8})\.jpg$/.exec(req.url);
      if (image) {
        let bytes;
        try { bytes = await cardImage(Number(image[1])); } catch { /* card name remains visible */ }
        if (!bytes) return send(404,{error:'Immagine non disponibile.'});
        res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});
        return res.end(bytes);
      }
      if (req.method==='POST' && ['/api/run','/api/workspace'].includes(req.url)) {
        if (req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) return send(403,{error:'Origin non consentita.'});
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'Richiesto JSON.'});
        let raw=''; for await(const part of req) {raw+=part; if(Buffer.byteLength(raw)>32000) return send(413,{error:'Richiesta troppo grande.'});}
        const input=JSON.parse(raw);
        if (req.url==='/api/workspace') {
          if (!input || typeof input.intent!=='string' || input.intent.length>2000) return send(400,{error:'Richiesta non valida.'});
          // The local lab grants read-only access to the submitted list.
          return send(200,composeDeckWorkspace(input.intent,input.deck,new Set(['deck.read','hand.analyze','deck.suggest']),{
            starters: input.starters, hand: input.hand
          }));
        }
        if (typeof input.intent!=='string' || !input.intent.trim() || input.intent.length>2000 || !['demo','ai'].includes(input.mode)) return send(400,{error:'Richiesta non valida.'});
        const start=performance.now(); const plan=input.mode==='ai'?await planWithAI(input.intent):demoPlan(input.intent);
        return send(200,{...execute(plan,input),mode:input.mode,elapsedMs:Math.round(performance.now()-start)});
      }
      const files={'/':'index.html','/decklist':'decklist.html','/app.js':'app.js','/workspace.js':'workspace.js','/style.css':'style.css','/workspace.css':'workspace.css'};
      if (req.method==='GET' && Object.hasOwn(files,req.url)) {
        const file=files[req.url];
        const ancestors = file === 'decklist.html' ? 'http://127.0.0.1:4200 http://localhost:4200' : "'none'";
        res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors ${ancestors}; base-uri 'none'`,'X-Content-Type-Options':'nosniff'});
        return res.end(await readFile(new URL(`./web/${file}`,import.meta.url)));
      }
      send(404,{error:'Non trovato.'});
    } catch(error) {send(400,{error:error instanceof SyntaxError?'JSON non valido.':error.message});}
  });
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) createServer().listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log('Intent Runtime: http://127.0.0.1:'+(process.env.PORT || 4173)));
