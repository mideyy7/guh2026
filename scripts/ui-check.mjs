// Headless browser check of the live mission studio (no dependencies: Chrome + Node 24's WebSocket).
// Opens each view, reports every JavaScript error, prints live state, and saves screenshots.
//
//   node scripts/ui-check.mjs                         # http://localhost:8000
//   node scripts/ui-check.mjs --url file://$PWD/mockup/index.html --name mockup
//   node scripts/ui-check.mjs --actions               # also clicks BLACKOUT, restore, add text
//
// Screenshots: tests/ui/shots/<name>-<view>.png (git-ignored). Exit code 1 if any JS error occurred.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('url', 'http://localhost:8000/');
const NAME = arg('name', 'live');
const ACTIONS = process.argv.includes('--actions');
const W = Number(arg('width', 1440)), H = Number(arg('height', 1000));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + Math.floor(Math.random() * 500);
const SHOTS = join(ROOT, 'tests/ui/shots');
const PROFILE = join(ROOT, '.ui-check-profile');
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0;
const pending = new Map(), errors = [], warnings = [];
function cdp(method, params = {}) { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pending.set(i, { res, rej, method })); }
async function evaluate(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
async function shot(view) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); const f = join(SHOTS, `${NAME}-${view}.png`); writeFileSync(f, Buffer.from(r.data, 'base64')); return f.replace(ROOT + '/', ''); }

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} if (!target) await sleep(200); }
  if (!target) throw new Error('Chrome did not start (set CHROME=/path/to/chrome)');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(`${p.method}: ${msg.error.message}`)) : p.res(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; errors.push(`${d.exception?.description?.split('\n').slice(0, 2).join(' | ') || d.text} (${d.url?.split('/').pop() || ''}:${d.lineNumber})`); }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) (msg.params.type === 'error' ? errors : warnings).push('console: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/favicon/.test(msg.params.entry.url || '')) errors.push(`log: ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
  });
  await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: URL_ });
  await sleep(9000); // map tiles, 3D buildings and a few live syncs
  const out = { url: URL_, screenshots: [] };
  out.screenshots.push(await shot('mission'));
  const isLive = await evaluate('typeof LIVE !== "undefined"');
  if (isLive) out.state = await evaluate(`({tick, actors: actors.length, pairs: pairs.length, linksUp: Object.values(links).filter(Boolean).length, tasks: tasks.length, statuses: tasks.reduce((m,t)=>(m[t.status]=(m[t.status]||0)+1,m),{}), groups: components().length, mapReady: !!missionMap?.ready, mapMarkers: document.querySelectorAll('.geo-marker').length, online: LIVE.online, rescued, score, events: events.length})`);
  for (const v of ['network', 'insights']) { await evaluate(`setView('${v}')`); await sleep(1500); out.screenshots.push(await shot(v)); }
  await evaluate(`setView('benchmark')`); await sleep(1500); out.screenshots.push(await shot('benchmark'));
  if (isLive) { await evaluate(`HiveSwarm.setTab('workflows'); setView('network')`); await sleep(1200); out.screenshots.push(await shot('workflows')); }
  await evaluate(`setView('operations')`); await sleep(800);
  await evaluate(`document.getElementById('mission-details').click()`); await sleep(800); out.screenshots.push(await shot('details'));
  await evaluate(`document.getElementById('mission-details-dialog').close()`);
  if (ACTIONS && isLive) {
    await evaluate(`blackout()`); await sleep(3500);
    out.afterBlackout = await evaluate(`({groups: components().length, labels: [...new Set(actors.map(a=>groupLabel(a.id)))], linksUp: Object.values(links).filter(Boolean).length, phase})`);
    out.screenshots.push(await shot('blackout'));
    await evaluate(`HiveSwarm.setTab('coordination'); setView('network')`); await sleep(1500); out.screenshots.push(await shot('blackout-network'));
    await evaluate(`setView('operations'); injectIncident()`); await sleep(3000);
    out.afterInject = await evaluate(`({tasks: tasks.length, selected: selectedTask})`);
    await evaluate(`restoreAll()`); await sleep(3500);
    out.afterRestore = await evaluate(`({groups: components().length, linksUp: Object.values(links).filter(Boolean).length, phase})`);
    for (const q of ['Which actors are isolated?', 'Who owns this rescue?', 'Give me a mission briefing.']) await evaluate(`HiveStudio.ask(${JSON.stringify(q)})`);
    out.analystAnswers = await evaluate(`[...document.querySelectorAll('.analyst-answer .answer-title')].slice(-3).map(e=>e.textContent)`);
    await evaluate(`document.querySelector('[data-actor]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(600); out.screenshots.push(await shot('actor-detail'));
  }
  out.errors = errors; out.warnings = warnings.slice(0, 10);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = errors.length ? 1 : 0;
} catch (e) {
  console.error('ui-check failed:', e.message.split('\n').slice(0, 3).join(' | '));
  console.error('JS errors before the failure:', JSON.stringify(errors, null, 2));
  try { console.error('state:', JSON.stringify(await evaluate('typeof LIVE!=="undefined" ? ({online: LIVE.online, config: !!LIVE.config, actors: actors.length, tick, errors: LIVE.errors}) : "no LIVE"'))); } catch {}
  process.exitCode = 2;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(300);
  rmSync(PROFILE, { recursive: true, force: true });
}
