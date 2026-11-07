import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSim } from '../../sim/server.mjs';
import { startProxy } from '../../proxy/server.mjs';
import { startDashboard } from '../server.mjs';

const ACTORS = 'drone-1,team-1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let sim, proxy, dash, base, stores = {};
const storePorts = { 'drone-1': 4911, 'team-1': 4912 };
const dir = mkdtempSync(join(tmpdir(), 'dash-'));

function startStore(id) {
  const p = spawn(process.execPath, [new URL('../../store/server.mjs', import.meta.url).pathname], {
    env: { ...process.env, ACTOR_ID: id, ROLE: id.startsWith('drone') ? 'drone' : 'team', PEERS: '', DB_PATH: join(dir, `${id}.db`), PORT: String(storePorts[id]), NODE_NO_WARNINGS: '1' }, stdio: 'ignore',
  });
  stores[id] = p;
  return (async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${storePorts[id]}/health`)).ok) return; } catch {} await wait(100); } throw new Error('store did not start'); })();
}
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await r.text(); let j = text; try { j = JSON.parse(text); } catch {}
  return { status: r.status, body: j, type: r.headers.get('content-type') };
};
async function putView(id, view) {
  const s = await (await fetch(`http://127.0.0.1:${storePorts[id]}/state`)).json();
  await fetch(`http://127.0.0.1:${storePorts[id]}/state`, { method: 'PUT', body: JSON.stringify({ version: s.version, state: { view } }) });
}

before(async () => {
  await Promise.all(Object.keys(storePorts).map(startStore));
  sim = await startSim({ PORT: '0', QUIET: '1', ACTORS, ACTOR_URL_TEMPLATE: 'http://127.0.0.1:1/{id}/{path}', TICK_MS: '100' });
  proxy = await startProxy({ PORT: '0', QUIET: '1', ACTORS, TARGET_TEMPLATE: 'http://127.0.0.1:1/{to}/{path}' });
  dash = await startDashboard({
    PORT: '0', QUIET: '1', ACTORS, STALE_MS: '600',
    SIM_URL: `http://127.0.0.1:${sim.port}`, PROXY_URL: `http://127.0.0.1:${proxy.port}`,
    STORE_URLS: JSON.stringify(Object.fromEntries(Object.entries(storePorts).map(([id, p]) => [id, `http://127.0.0.1:${p}`]))),
  });
  base = `http://127.0.0.1:${dash.port}`;
});
after(() => { dash.close(); sim.close(); proxy.close(); for (const p of Object.values(stores)) p.kill(); });

test('actors: every configured actor reported, reachable, no state yet', async () => {
  const a = (await call('GET', '/api/actors')).body;
  assert.deepEqual(a.map((x) => x.actor_id), ['drone-1', 'team-1']);
  for (const x of a) { assert.equal(x.reachable, true); assert.equal(x.view, null); assert.equal(x.conflicts, 0); }
});

test('convergence: agrees when digests match, names the actor that diverged', async () => {
  await putView('drone-1', { digest: 'aaaa1111', action: 'searching' });
  await putView('team-1', { digest: 'aaaa1111', action: 'idle' });
  let c = (await call('GET', '/api/convergence')).body;
  assert.equal(c.converged, true);
  await putView('team-1', { digest: 'bbbb2222', action: 'idle' });
  c = (await call('GET', '/api/convergence')).body;
  assert.equal(c.converged, false);
  assert.equal(c.diverged.length, 1);
});

test('snapshot: one call carries actors, world, metrics, links, log and events', async () => {
  const s = (await call('GET', '/api/snapshot?log_since=0&events_since=0')).body;
  for (const k of ['actors', 'convergence', 'world', 'metrics', 'links', 'log', 'events', 'errors']) assert.ok(k in s, k);
  assert.equal(s.world.actors.length, 2);
  assert.equal(s.errors.sim, null); assert.equal(s.errors.proxy, null);
});

test('observing never bridges islands: polling creates zero proxy traffic', async () => {
  await call('POST', '/api/proxy/preset', { name: 'blackout-3' });
  const before = (await call('GET', '/api/proxy/log?since=0')).body.length;
  for (let i = 0; i < 10; i++) await call('GET', '/api/snapshot');
  const afterLog = (await call('GET', '/api/proxy/log?since=0')).body;
  assert.equal(afterLog.length, before, 'the dashboard reads stores directly, never through the proxy');
  const isl = (await call('GET', '/api/islands')).body.islands;
  assert.deepEqual(isl, [['drone-1', 'team-1']], 'dev pair is in the same blackout island');
});

test('outage controls pass through: preset, toggle, link settings', async () => {
  const t = (await call('POST', '/api/proxy/toggle', { a: 'drone-1', b: 'team-1' })).body;
  assert.equal(t.allowed['drone-1']['team-1'], false);
  const s = (await call('PUT', '/api/proxy/links', { delay_ms: 50 })).body;
  assert.equal(s.delay_ms, 50);
  assert.equal((await call('POST', '/api/proxy/preset', { name: 'nope' })).status, 400, 'errors are passed through');
});

test('reset: sim back to tick 0, every store cleared, links all-up', async () => {
  await call('POST', '/api/sim/control/step', { n: 5 });
  assert.equal((await call('GET', '/api/sim/status')).body.tick >= 5, true);
  const r = await call('POST', '/api/reset', { seed: 4 });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.seed, 4);
  assert.equal((await call('GET', '/api/sim/status')).body.tick, 0);
  for (const a of (await call('GET', '/api/actors')).body) assert.equal(a.version, 0);
  assert.equal((await call('GET', '/api/proxy/links')).body.preset, 'all-up');
});

test('a dead store shows as stale and unreachable, keeping its last view', async () => {
  await putView('team-1', { digest: 'cccc3333', action: 'idle' });
  assert.equal((await call('GET', '/api/actors')).body[1].stale, false);
  stores['team-1'].kill();
  await wait(900);
  const t1 = (await call('GET', '/api/actors')).body.find((x) => x.actor_id === 'team-1');
  assert.equal(t1.reachable, false);
  assert.equal(t1.stale, true);
  assert.equal(t1.view.digest, 'cccc3333', 'last known view kept');
  const r = await call('POST', '/api/reset', {});
  assert.equal(r.status, 502); assert.deepEqual(r.body.failed, ['store-team-1'], 'reset reports exactly what failed');
  await startStore('team-1');
});

test('static UI is served; path traversal is refused', async () => {
  const idx = await call('GET', '/');
  assert.equal(idx.status, 200); assert.match(idx.type, /text\/html/); assert.match(idx.body, /<title>HIVE Control<\/title>/);
  assert.equal((await call('GET', '/app.js')).status, 200);
  assert.equal((await fetch(base + '/..%2F..%2Fserver.mjs')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/%2e%2e/.env')).status, 404);
});
