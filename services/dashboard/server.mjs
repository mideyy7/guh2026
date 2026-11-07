// HIVE dashboard server: a READ-ONLY observer (hack.md §4 rule 3).
// It reads actor beliefs from each store, ground truth from the simulator and delivery records from
// the proxy, and it can change outage settings and scenario controls. It never relays peer messages,
// never chooses task winners and never issues assignments.
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, send, readJson, postJson, loadParams, isMain } from '../lib/http.mjs';
import { islands } from '../../world/links.mjs';
import { DISTRICTS, HQ_CELL } from '../../world/gazetteer.mjs';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

async function getJson(url, timeoutMs = 1500) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    let body = text; try { body = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, body };
  } catch (e) { return { ok: false, status: 0, error: e.cause?.code || e.name }; }
}
async function sendJson(method, url, body, timeoutMs = 5000) {
  if (method === 'POST') return postJson(url, body ?? {}, timeoutMs);
  try {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(timeoutMs) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
  } catch (e) { return { ok: false, status: 0, error: e.cause?.code || e.name }; }
}

export async function startDashboard(env = process.env) {
  const params = await loadParams();
  const ACTORS = (env.ACTORS || [...params.actors.drones, ...params.actors.teams].join(',')).split(',').filter(Boolean);
  const PORT = Number(env.PORT || params.ports.dashboard);
  const SIM = env.SIM_URL || `http://sim:${params.ports.sim}`;
  const PROXY = env.PROXY_URL || `http://proxy:${params.ports.proxy}`;
  const HQ = env.HQ_URL || `http://hq:${params.ports.hq}`;
  const storeUrls = env.STORE_URLS ? JSON.parse(env.STORE_URLS) : {};
  const storeUrl = (id) => storeUrls[id] || (env.STORE_URL_TEMPLATE || `http://store-{id}:${params.ports.store}`).replace('{id}', id);
  const STALE_MS = Number(env.STALE_MS || 3000);

  // Last good observation per actor, so a dead store shows as stale instead of vanishing.
  const cache = Object.fromEntries(ACTORS.map((id) => [id, { last_ok: null, version: null, view: null, conflicts: null }]));

  async function pollActor(id) {
    const [st, h] = await Promise.all([getJson(`${storeUrl(id)}/state`, 1200), getJson(`${storeUrl(id)}/health`, 1200)]);
    const c = cache[id];
    const now = Date.now();
    if (st.ok) { c.last_ok = now; c.version = st.body.version; c.view = st.body.state?.view ?? null; }
    if (h.ok) c.conflicts = h.body.conflicts;
    return {
      actor_id: id,
      role: params.actors.drones.includes(id) ? 'drone' : 'team',
      reachable: st.ok,
      stale: !c.last_ok || now - c.last_ok > STALE_MS,
      polled_at: now, last_ok: c.last_ok,
      version: c.version, conflicts: c.conflicts,
      view: c.view,
    };
  }
  const pollAll = () => Promise.all(ACTORS.map(pollActor));

  function convergence(actors) {
    const digests = Object.fromEntries(actors.map((a) => [a.actor_id, a.view?.digest ?? null]));
    const counts = {};
    for (const d of Object.values(digests)) if (d) counts[d] = (counts[d] || 0) + 1;
    const majority = Object.entries(counts).sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
    const all = Object.values(digests);
    return {
      converged: all.length > 0 && all.every((d) => d && d === all[0]),
      majority, digests,
      diverged: Object.entries(digests).filter(([, d]) => d !== majority).map(([id]) => id),
      stale: actors.filter((a) => a.stale).map((a) => a.actor_id),
    };
  }

  const proxyPass = (method, path) => async (req, res, url) => {
    const body = method === 'GET' ? undefined : await readJson(req);
    const target = `${PROXY}${path}${url.search || ''}`;
    const r = method === 'GET' ? await getJson(target, 3000) : await sendJson(method, target, body);
    send(res, r.ok ? 200 : r.status || 502, r.ok ? r.body : { error: r.error || r.body?.error || `proxy HTTP ${r.status}` });
  };
  const simPass = (method, path) => async (req, res, url) => {
    const body = method === 'GET' ? undefined : await readJson(req);
    const target = `${SIM}${path}${url.search || ''}`;
    const r = method === 'GET' ? await getJson(target, 3000) : await sendJson(method, target, body);
    send(res, r.ok ? 200 : r.status || 502, r.ok ? r.body : { error: r.error || r.body?.error || `sim HTTP ${r.status}` });
  };

  const routes = {
    'GET /api/health': (req, res) => send(res, 200, { ok: true, actors: ACTORS, sim: SIM, proxy: PROXY }),
    'GET /api/config': (req, res) => send(res, 200, {
      actors: ACTORS, grid: params.grid, hq_cell: HQ_CELL, tick_ms: params.tick_ms, gossip_ms: params.gossip_ms,
      islands: params.islands, districts: DISTRICTS.map((d) => ({ name: d.name, x: d.x, y: d.y, landmark: d.landmark, flood: d.flood })),
    }),
    'GET /api/actors': async (req, res) => send(res, 200, await pollAll()),
    'GET /api/convergence': async (req, res) => send(res, 200, convergence(await pollAll())),
    // One call for the UI: everything it renders, gathered in parallel.
    'GET /api/snapshot': async (req, res, url) => {
      const since = Number(url.searchParams.get('log_since') || 0);
      const evSince = Number(url.searchParams.get('events_since') || 0);
      const [actors, world, metrics, links, log, events] = await Promise.all([
        pollAll(), getJson(`${SIM}/world`), getJson(`${SIM}/metrics`), getJson(`${PROXY}/links`), getJson(`${PROXY}/log?since=${since}&limit=2000`), getJson(`${SIM}/events?since=${evSince}`),
      ]);
      send(res, 200, {
        at: Date.now(), actors, convergence: convergence(actors),
        world: world.ok ? world.body : null, metrics: metrics.ok ? metrics.body : null,
        links: links.ok ? links.body : null, log: log.ok ? log.body : [], events: events.ok ? events.body : [],
        errors: { sim: world.ok ? null : world.error || world.status, proxy: links.ok ? null : links.error || links.status },
      });
    },
    // Simulator (ground truth + scenario controls).
    'GET /api/sim/world': simPass('GET', '/world'),
    'GET /api/sim/metrics': simPass('GET', '/metrics'),
    'GET /api/sim/status': simPass('GET', '/status'),
    'GET /api/sim/events': simPass('GET', '/events'),
    'POST /api/sim/control/reset': simPass('POST', '/control/reset'),
    'POST /api/sim/control/start': simPass('POST', '/control/start'),
    'POST /api/sim/control/pause': simPass('POST', '/control/pause'),
    'POST /api/sim/control/step': simPass('POST', '/control/step'),
    'POST /api/sim/control/speed': simPass('POST', '/control/speed'),
    'POST /api/sim/control/inject': simPass('POST', '/control/inject'),
    // Proxy (outage settings + delivery records).
    'GET /api/proxy/links': proxyPass('GET', '/links'),
    'PUT /api/proxy/links': proxyPass('PUT', '/links'),
    'POST /api/proxy/preset': proxyPass('POST', '/links/preset'),
    'POST /api/proxy/toggle': proxyPass('POST', '/links/toggle'),
    'GET /api/proxy/log': proxyPass('GET', '/log'),
    // Full reset: scenario, every actor's store, and links back to all-up.
    'POST /api/reset': async (req, res) => {
      const { seed } = await readJson(req);
      const sim = await postJson(`${SIM}/control/reset`, seed === undefined ? {} : { seed });
      const stores = await Promise.all(ACTORS.map((id) => postJson(`${storeUrl(id)}/reset`, {})));
      const proxy = await postJson(`${PROXY}/reset`, {});
      const hq = await postJson(`${HQ}/reset`, {}, 2000); // HQ only runs in the central baselines; absence is fine
      const failed = [!sim.ok && 'sim', !proxy.ok && 'proxy', ...stores.map((s, i) => !s.ok && `store-${ACTORS[i]}`)].filter(Boolean);
      send(res, failed.length ? 502 : 200, { ok: !failed.length, failed, seed: sim.body?.seed, hq_reset: hq.ok });
    },
    'GET /api/hq/state': async (req, res) => { const r = await getJson(`${HQ}/state`, 1500); send(res, r.ok ? 200 : 502, r.ok ? r.body : { error: 'hq not running (only used by the central baselines)' }); },
    'GET /api/islands': async (req, res) => {
      const l = await getJson(`${PROXY}/links`);
      send(res, l.ok ? 200 : 502, l.ok ? { islands: islands(l.body.allowed) } : { error: 'proxy unreachable' });
    },
  };

  // Static UI.
  const staticHandler = (req, res, url) => {
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '') p = '/index.html';
    const file = join(PUBLIC, p);
    if (!file.startsWith(PUBLIC) || !existsSync(file)) return send(res, 404, { error: 'not found' });
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  };
  for (const f of ['/', '/index.html', '/app.js', '/style.css']) routes[`GET ${f}`] = staticHandler;

  const server = await serve(PORT, routes, env.QUIET ? null : `dashboard on :${PORT} (${ACTORS.length} actors)`);
  return { server, port: server.address().port, close: () => server.close() };
}

if (isMain(import.meta.url)) startDashboard();
