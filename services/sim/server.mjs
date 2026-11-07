// HIVE world simulator (contract C2): an HTTP wrapper around world/world.mjs plus the tick driver.
// It is physics, not a coordinator: it sends actors only the time ({tick}) and the distress texts a
// drone's radio would pick up. It never tells an actor what to do.
import { serve, send, readJson, postJson, loadParams, isMain } from '../lib/http.mjs';
import { createWorld } from '../../world/world.mjs';

export async function startSim(env = process.env) {
  const params = await loadParams();
  const ACTORS = (env.ACTORS || [...params.actors.drones, ...params.actors.teams].join(',')).split(',').filter(Boolean);
  const PORT = Number(env.PORT || params.ports.sim);
  const ACTOR_URL = env.ACTOR_URL_TEMPLATE || 'http://n8n-{id}:5678/webhook/{path}';
  const urlFor = (id, path) => ACTOR_URL.replace('{id}', id).replace('{path}', path);

  const st = {
    seed: Number(env.SEED || 1), tick_ms: Number(env.TICK_MS || params.tick_ms),
    world: null, running: false, timer: null, events: [], n: 0,
    tickFailures: Object.fromEntries(ACTORS.map((a) => [a, 0])), lastTickOk: {},
  };
  const event = (e) => { st.events.push({ n: ++st.n, ts: Date.now(), tick: st.world.tick, ...e }); if (st.events.length > 20000) st.events.splice(0, 5000); };

  function reset(seed) {
    stop();
    st.seed = Number(seed ?? st.seed);
    st.world = createWorld(st.seed, params, ACTORS);
    st.events = []; st.n = 0;
    for (const a of ACTORS) st.tickFailures[a] = 0;
    st.lastTickOk = {};
  }

  // One world step + notifications. Notifications are fire-and-forget: a slow actor never delays time.
  function tickOnce() {
    const deliveries = st.world.step();
    const tick = st.world.tick;
    for (const id of ACTORS) {
      postJson(urlFor(id, 'tick'), { tick }, 1000).then((r) => {
        if (r.ok) st.lastTickOk[id] = tick; else st.tickFailures[id] += 1;
      });
    }
    for (const d of deliveries) {
      const { to, ...msg } = d;
      event({ kind: 'distress_delivered', to, msg_id: d.msg_id, text: d.text });
      postJson(urlFor(to, 'distress'), msg, 5000).then((r) => {
        if (!r.ok) { st.world.requeueDistress(d.msg_id); event({ kind: 'distress_retry', to, msg_id: d.msg_id, reason: r.error || `HTTP ${r.status}` }); }
      });
    }
    return { tick, deliveries: deliveries.length };
  }

  function loop() {
    if (!st.running) return;
    const started = Date.now();
    tickOnce();
    if (st.world.tick >= params.horizon_ticks && env.STOP_AT_HORIZON !== '0') { st.running = false; event({ kind: 'horizon_reached' }); return; }
    st.timer = setTimeout(loop, Math.max(0, st.tick_ms - (Date.now() - started)));
  }
  function start() { if (!st.running) { st.running = true; st.timer = setTimeout(loop, st.tick_ms); } }
  function stop() { st.running = false; clearTimeout(st.timer); }

  const status = () => ({ running: st.running, tick: st.world.tick, seed: st.seed, tick_ms: st.tick_ms, horizon: params.horizon_ticks, actors: ACTORS, tick_failures: st.tickFailures, last_tick_ok: st.lastTickOk });
  const guard = (fn) => { try { return fn(); } catch (e) { throw Object.assign(e, { status: e.status || 400 }); } };

  reset(st.seed);

  const routes = {
    'GET /health': (req, res) => send(res, 200, { ok: true, ...status() }),
    // ── actor-facing ───────────────────────────────────────────────
    'GET /sense': (req, res, url) => send(res, 200, guard(() => st.world.sense(url.searchParams.get('actor')))),
    'POST /move': async (req, res) => {
      const { actor, target, task_id, key } = await readJson(req);
      send(res, 200, guard(() => st.world.move(actor, target, task_id, key)));
    },
    'POST /rescue': async (req, res) => {
      const { actor, survivor_id, key } = await readJson(req);
      const r = guard(() => st.world.rescue(actor, survivor_id, key));
      event({ kind: 'rescue_attempt', actor, survivor_id, result: r.result });
      send(res, 200, r);
    },
    // ── dashboard-only (actors must never call these; the workflow lint rejects them) ──
    'GET /world': (req, res) => send(res, 200, { ...st.world.snapshot(), running: st.running }),
    'GET /metrics': (req, res) => send(res, 200, st.world.metrics()),
    'GET /events': (req, res, url) => { const since = Number(url.searchParams.get('since') || 0); send(res, 200, st.events.filter((e) => e.n > since)); },
    'GET /status': (req, res) => send(res, 200, status()),
    'POST /control/reset': async (req, res) => { const { seed } = await readJson(req); reset(seed); send(res, 200, status()); },
    'POST /control/start': (req, res) => { start(); send(res, 200, status()); },
    'POST /control/pause': (req, res) => { stop(); send(res, 200, status()); },
    'POST /control/step': async (req, res) => {
      const { n = 1 } = await readJson(req);
      if (st.running) return send(res, 409, { error: 'pause first' });
      for (let i = 0; i < Math.min(500, Number(n)); i++) tickOnce();
      send(res, 200, status());
    },
    'POST /control/speed': async (req, res) => {
      const { tick_ms } = await readJson(req);
      const v = Number(tick_ms);
      if (!Number.isFinite(v) || v < 100 || v > 60000) return send(res, 400, { error: 'tick_ms must be 100..60000' });
      st.tick_ms = v; send(res, 200, status());
    },
  };

  const server = await serve(PORT, routes, env.QUIET ? null : `sim (${ACTORS.length} actors, seed ${st.seed}, ${st.tick_ms} ms/tick)`);
  if (env.AUTOSTART === '1') start();
  return { server, port: server.address().port, close: () => { stop(); server.close(); }, get world() { return st.world; } };
}

if (isMain(import.meta.url)) startSim();
