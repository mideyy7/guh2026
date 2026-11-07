import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startSim } from '../server.mjs';

// Fake n8n for every actor: records tick and distress webhooks. Drone-4 can be made to fail.
let hits = [];
let failDrone = null;
let mock, sim, base;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

before(async () => {
  mock = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const [, id, path] = req.url.split('/');
    hits.push({ id, path, body: JSON.parse(raw) });
    res.writeHead(failDrone === id ? 500 : 200); res.end('{}');
  }).listen(0);
  sim = await startSim({ PORT: '0', QUIET: '1', SEED: '11', TICK_MS: '100', ACTOR_URL_TEMPLATE: `http://127.0.0.1:${mock.address().port}/{id}/{path}` });
  base = `http://127.0.0.1:${sim.port}`;
});
after(() => { sim.close(); mock.close(); });

test('sense / move / rescue follow contract C2', async () => {
  await call('POST', '/control/reset', { seed: 11 });
  const s = (await call('GET', '/sense?actor=drone-1')).body;
  assert.deepEqual(Object.keys(s).sort(), ['actor', 'detections', 'footprint', 'pos', 'tick']);
  assert.equal(s.footprint.length, 25);
  const m = (await call('POST', '/move', { actor: 'drone-1', target: { x: 5, y: 3 }, task_id: null, key: 'k1' })).body;
  assert.deepEqual(m, { ok: true, pos: { x: 3, y: 3 } });
  await call('POST', '/control/step', { n: 1 });
  assert.deepEqual((await call('GET', '/sense?actor=drone-1')).body.pos, { x: 4, y: 3 });
  const r = await call('POST', '/rescue', { actor: 'team-1', survivor_id: 's01', key: 'r1' });
  assert.equal(r.status, 200); assert.ok(['rescued', 'not_here', 'already_rescued'].includes(r.body.result));
});

test('bad input → 4xx, not a crash', async () => {
  assert.equal((await call('GET', '/sense?actor=drone-9')).status, 404);
  assert.equal((await call('POST', '/move', { actor: 'drone-1', target: { x: 99, y: 0 } })).status, 400);
  assert.equal((await call('POST', '/rescue', { actor: 'drone-1', survivor_id: 's01' })).status, 400);
  assert.equal((await call('GET', '/health')).status, 200);
});

test('the tick loop sends only {tick} to every actor, in order, at TICK_MS', async () => {
  await call('POST', '/control/reset', { seed: 11 });
  hits = [];
  await call('POST', '/control/start');
  await wait(560);
  await call('POST', '/control/pause');
  const ticks = hits.filter((h) => h.path === 'tick');
  const byActor = {};
  for (const h of ticks) (byActor[h.id] ||= []).push(h.body.tick);
  assert.equal(Object.keys(byActor).length, 7, 'all 7 actors notified');
  for (const [id, seq] of Object.entries(byActor)) {
    assert.ok(seq.length >= 3 && seq.length <= 7, `${id} got ${seq.length} ticks in ~560ms at 100ms`);
    assert.deepEqual(seq, [...seq].sort((a, b) => a - b));
  }
  for (const h of ticks) assert.deepEqual(Object.keys(h.body), ['tick'], 'tick payload carries time only');
});

test('pause stops time; step advances it manually; step refused while running', async () => {
  await call('POST', '/control/reset', { seed: 11 });
  const t0 = (await call('GET', '/status')).body.tick;
  await wait(250);
  assert.equal((await call('GET', '/status')).body.tick, t0, 'paused: no ticks');
  await call('POST', '/control/step', { n: 3 });
  assert.equal((await call('GET', '/status')).body.tick, t0 + 3);
  await call('POST', '/control/start');
  assert.equal((await call('POST', '/control/step', { n: 1 })).status, 409);
  await call('POST', '/control/pause');
});

test('distress: delivered to a drone webhook; a failed delivery is retried until it succeeds', async () => {
  await call('POST', '/control/reset', { seed: 11 });
  hits = [];
  const w = (await call('GET', '/world')).body;
  const m = w.distress[0];
  const [x, y] = m.cell.split('-').map(Number);
  // Only drone-1 goes to the sender (others to a far corner), so drone-1 must be the receiver.
  const far = x < 4 ? { x: 7, y: y < 4 ? 7 : 0 } : { x: 0, y: y < 4 ? 7 : 0 };
  await call('POST', '/move', { actor: 'drone-1', target: { x, y }, key: 'go-1' });
  for (const d of ['drone-2', 'drone-3', 'drone-4']) await call('POST', '/move', { actor: d, target: far, key: `away-${d}` });
  failDrone = 'drone-1';
  await call('POST', '/control/step', { n: Math.max(12, m.sent_tick + 10) });
  await wait(120);
  const tries = hits.filter((h) => h.path === 'distress' && h.body.msg_id === m.msg_id);
  assert.ok(tries.length >= 1, 'attempted');
  assert.ok(tries.every((t) => t.id === 'drone-1'), 'only drone-1 was in range');

  failDrone = null;
  await call('POST', '/control/step', { n: 2 });
  await wait(120);
  const after = hits.filter((h) => h.path === 'distress' && h.body.msg_id === m.msg_id);
  const delivered = (await call('GET', '/world')).body.distress.find((d) => d.msg_id === m.msg_id);
  assert.equal(delivered.state, 'delivered');
  assert.ok(after.length >= 2, `first attempt failed, a later one was retried (${after.length} tries)`);
  assert.ok(after.every((t) => t.id === 'drone-1'));
  assert.deepEqual(Object.keys(after.at(-1).body).sort(), ['delivered_tick', 'msg_id', 'sent_tick', 'text']);
  const events = (await call('GET', '/events?since=0')).body;
  assert.ok(events.some((e) => e.kind === 'distress_retry' && e.msg_id === m.msg_id), 'retry recorded');
});

test('world/metrics/status are available for the dashboard', async () => {
  const w = (await call('GET', '/world')).body;
  assert.equal(w.survivors.length, 30);
  assert.equal(w.actors.length, 7);
  const m = (await call('GET', '/metrics')).body;
  assert.ok('score' in m && 'rescued' in m && 'wasted_travel' in m);
  assert.equal((await call('POST', '/control/speed', { tick_ms: 5 })).status, 400);
});
