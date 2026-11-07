// HIVE chaos proxy (contract C3). Every peer-to-peer message goes through here, so a cut link
// really fails. /send is fire-and-forget (D6): it answers 202/503 at once and delivers later.
import { serve, send, readJson, postJson, loadParams, isMain } from '../lib/http.mjs';
import { preset, islands, PRESETS } from '../../world/links.mjs';
import { makeRng } from '../../world/rng.mjs';

export async function startProxy(env = process.env) {
  const params = await loadParams();
  const ACTORS = (env.ACTORS || [...params.actors.drones, ...params.actors.teams].join(',')).split(',').filter(Boolean);
  const NODES = [...ACTORS, 'hq'];
  const PORT = Number(env.PORT || params.ports.proxy);
  const TARGET = env.TARGET_TEMPLATE || 'http://n8n-{to}:5678/webhook/{path}';
  const HQ_URL = env.HQ_URL || `http://hq:${params.ports.hq}`;
  const FLAP_MS = Number(env.FLAP_MS || params.tick_ms * 5);
  const LOG_MAX = Number(env.LOG_MAX || 50000);

  const st = {
    allowed: preset('all-up', ACTORS, params), preset: 'all-up', presetOpts: {},
    delay_ms: 0, drop_rate: 0, duplicate_rate: 0, reorder: false,
    log: [], n: 0, msg: 0, rng: makeRng(Number(env.SEED || 1)), flapTimer: null, phase: 0,
    counts: { refused: 0, queued: 0, dropped: 0, delivered: 0, failed: 0 },
  };

  const record = (e) => {
    const entry = { n: ++st.n, ts: Date.now(), ...e };
    st.log.push(entry); st.counts[e.status] = (st.counts[e.status] || 0) + 1;
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
    return entry;
  };
  const known = (x) => NODES.includes(x);
  const up = (a, b) => !!st.allowed[a]?.[b];

  function applyPreset(name, opts = {}) {
    clearInterval(st.flapTimer); st.flapTimer = null; st.phase = 0;
    st.allowed = preset(name, ACTORS, params, { ...opts, phase: 0 });
    st.preset = name; st.presetOpts = opts;
    if (name === 'flapping') {
      st.flapTimer = setInterval(() => { st.phase += 1; st.allowed = preset('flapping', ACTORS, params, { ...opts, phase: st.phase }); }, FLAP_MS);
      st.flapTimer.unref?.();
    }
  }

  function linksView() {
    return { preset: st.preset, phase: st.phase, allowed: st.allowed, islands: islands(st.allowed), delay_ms: st.delay_ms, drop_rate: st.drop_rate, duplicate_rate: st.duplicate_rate, reorder: st.reorder };
  }

  async function deliver(id, from, to, path, raw, bytes) {
    if (!up(from, to)) return record({ msg: id, from, to, path, status: 'dropped', bytes, reason: 'link went down in flight' });
    const url = TARGET.replace('{to}', to).replace('{path}', path);
    const r = await postJson(url, raw, 5000);
    record({ msg: id, from, to, path, status: r.ok ? 'delivered' : 'failed', bytes, ...(r.ok ? {} : { reason: r.error || `HTTP ${r.status}` }) });
  }

  const routes = {
    'GET /health': (req, res) => send(res, 200, { ok: true, nodes: NODES, preset: st.preset, counts: st.counts }),

    'POST /send': async (req, res) => {
      const { from, to, path = 'merge', body } = await readJson(req);
      if (!known(from) || !known(to) || from === to || to === 'hq' || from === 'hq') return send(res, 400, { error: 'from/to must be two different actors (use /rpc for hq)' });
      if (!/^[a-z0-9-]+$/.test(path)) return send(res, 400, { error: 'bad path' });
      const raw = JSON.stringify(body ?? null);
      const bytes = Buffer.byteLength(raw);
      const id = ++st.msg;
      if (!up(from, to)) { const e = record({ msg: id, from, to, path, status: 'refused', bytes }); return send(res, 503, { n: e.n, status: 'refused' }); }
      const e = record({ msg: id, from, to, path, status: 'queued', bytes });
      const copies = 1 + (st.rng.next() < st.duplicate_rate ? 1 : 0);
      for (let c = 0; c < copies; c++) {
        if (st.rng.next() < st.drop_rate) { record({ msg: id, from, to, path, status: 'dropped', bytes, reason: 'drop_rate' }); continue; }
        const delay = st.delay_ms + (st.reorder ? Math.floor(st.rng.next() * Math.max(st.delay_ms, 200)) : 0);
        setTimeout(() => { deliver(id, from, to, path, raw, bytes); }, delay);
      }
      send(res, 202, { n: e.n, status: 'queued' });
    },

    'POST /rpc': async (req, res) => {
      const { from, to = 'hq', path = 'report', body } = await readJson(req);
      if (!known(from) || to !== 'hq' || from === 'hq') return send(res, 400, { error: 'rpc is actor → hq only' });
      if (!/^[a-z0-9-]+$/.test(path)) return send(res, 400, { error: 'bad path' });
      const raw = JSON.stringify(body ?? null), bytes = Buffer.byteLength(raw), id = ++st.msg;
      if (!up(from, 'hq') || !up('hq', from)) { record({ msg: id, from, to, path, status: 'refused', bytes, rpc: true }); return send(res, 503, { status: 'refused' }); }
      const r = await postJson(`${HQ_URL}/${path}`, raw, 5000);
      record({ msg: id, from, to, path, status: r.ok ? 'delivered' : 'failed', bytes, rpc: true });
      if (!r.ok) return send(res, 502, { status: 'failed', error: r.error || `HTTP ${r.status}` });
      send(res, 200, r.body);
    },

    'GET /links': (req, res) => send(res, 200, linksView()),

    'PUT /links': async (req, res) => {
      const b = await readJson(req);
      if (b.allowed) {
        for (const [a, row] of Object.entries(b.allowed)) for (const [c, v] of Object.entries(row)) {
          if (!known(a) || !known(c) || a === c) return send(res, 400, { error: `bad link ${a}→${c}` });
          st.allowed[a][c] = !!v;
        }
        clearInterval(st.flapTimer); st.flapTimer = null; st.preset = 'custom';
      }
      for (const k of ['delay_ms', 'drop_rate', 'duplicate_rate']) if (b[k] !== undefined) {
        const v = Number(b[k]);
        if (!Number.isFinite(v) || v < 0 || (k !== 'delay_ms' && v > 1)) return send(res, 400, { error: `bad ${k}` });
        st[k] = v;
      }
      if (b.reorder !== undefined) st.reorder = !!b.reorder;
      send(res, 200, linksView());
    },

    'POST /links/preset': async (req, res) => {
      const { name, seed, percent, isolated } = await readJson(req);
      if (!PRESETS.includes(name)) return send(res, 400, { error: `unknown preset (known: ${PRESETS.join(', ')})` });
      applyPreset(name, { seed, percent, isolated });
      send(res, 200, linksView());
    },

    // Click-to-cut: toggle one undirected link (both directions).
    'POST /links/toggle': async (req, res) => {
      const { a, b, up: want } = await readJson(req);
      if (!known(a) || !known(b) || a === b) return send(res, 400, { error: 'need two different known nodes' });
      const v = want === undefined ? !(st.allowed[a][b] && st.allowed[b][a]) : !!want;
      st.allowed[a][b] = v; st.allowed[b][a] = v;
      clearInterval(st.flapTimer); st.flapTimer = null; st.preset = 'custom';
      send(res, 200, linksView());
    },

    'GET /log': (req, res, url) => {
      const since = Number(url.searchParams.get('since') || 0);
      const limit = Math.min(5000, Number(url.searchParams.get('limit') || 5000));
      const out = [];
      for (let i = st.log.length - 1; i >= 0 && st.log[i].n > since; i--) out.push(st.log[i]);
      send(res, 200, out.reverse().slice(0, limit));
    },

    'POST /reset': (req, res) => {
      applyPreset('all-up');
      Object.assign(st, { delay_ms: 0, drop_rate: 0, duplicate_rate: 0, reorder: false, log: [], counts: { refused: 0, queued: 0, dropped: 0, delivered: 0, failed: 0 } });
      send(res, 200, linksView());
    },
  };

  const server = await serve(PORT, routes, env.QUIET ? null : `proxy (${ACTORS.length} actors)`);
  return { server, close: () => { clearInterval(st.flapTimer); server.close(); }, port: server.address().port };
}

if (isMain(import.meta.url)) startProxy();
