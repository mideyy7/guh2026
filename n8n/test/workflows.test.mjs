// Phase 2 tests (no Docker): build + lint the workflows, then run the BUILT workflow JSON
// through the emulator against per-actor in-memory stores, the test mini world and a proxy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { lint, buildAll } from '../../scripts/build-workflows.mjs';
import { execute, makeStore } from './emulator.mjs';

const require = createRequire(import.meta.url);
const { makeWorld, ACTORS, P } = require('../../core/test/helpers/sim.js');
const root = new URL('../../', import.meta.url);
const SRC = new URL('n8n/workflows-src/', root);
const CORE = new URL('core/dist/hive-core.js', root);

function buildToTemp() {
  const dir = mkdtempSync(join(tmpdir(), 'hive-wf-'));
  const out = pathToFileURL(dir + '/');
  buildAll({ src: SRC, out, corePath: CORE });
  const wf = {};
  for (const f of readdirSync(dir)) { const w = JSON.parse(readFileSync(join(dir, f), 'utf8')); wf[w.name] = w; }
  return wf;
}

test('build-workflows: real workflows pass the lint and get the core injected', () => {
  const wf = buildToTemp();
  assert.deepEqual(Object.keys(wf).sort(), ['hive-gossip', 'hive-interpret', 'hive-merge', 'hive-tick']);
  for (const w of Object.values(wf)) {
    for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
      assert.ok(!n.parameters.jsCode.includes('//@@HIVE_CORE@@'), `${w.name}/${n.name} still has the marker`);
      assert.ok(n.parameters.jsCode.includes('const HiveCore'), `${w.name}/${n.name} has no core`);
    }
  }
});

test('build-workflows: a planted bad URL fails the build', () => {
  const good = JSON.parse(readFileSync(new URL('hive-tick.json', SRC), 'utf8'));
  assert.deepEqual(lint(good), []);
  const plant = (url) => { const w = JSON.parse(JSON.stringify(good)); w.nodes.find((n) => n.name === 'Sense').parameters.url = url; return lint(w); };
  assert.ok(plant('=http://sim:3000/world').length > 0, '/world is dashboard-only');
  assert.ok(plant('http://sim:3000/control/start').length > 0, '/control is dashboard-only');
  assert.ok(plant('http://host.docker.internal:3000/sense').length > 0);
  assert.ok(plant('http://n8n-team-1:5678/webhook/merge').length > 0, 'actors never call each other directly');
  assert.ok(plant('https://api.anthropic.com/v1/messages').length > 0, 'only hive-interpret may call the AI');
  const envUse = JSON.parse(JSON.stringify(good));
  envUse.nodes.find((n) => n.name === 'Act').parameters.jsCode += '\nconst m = $env.MODE;';
  assert.ok(lint(envUse).some((e) => /env access/.test(e)));

  // And buildAll refuses to write anything when the lint fails.
  const dir = mkdtempSync(join(tmpdir(), 'hive-bad-'));
  mkdirSync(join(dir, 'src'));
  const bad = JSON.parse(JSON.stringify(good)); bad.nodes.find((n) => n.name === 'Sense').parameters.url = 'http://sim:3000/metrics';
  writeFileSync(join(dir, 'src', 'hive-tick.json'), JSON.stringify(bad));
  assert.throws(() => buildAll({ src: pathToFileURL(join(dir, 'src') + '/'), out: pathToFileURL(join(dir, 'out') + '/'), corePath: CORE }), /lint failed/);
});

// A live-like harness: one store per actor (its own network), a shared world and proxy.
function harness({ actors = ACTORS, seed = 1, links = () => true, mode = 'hive', hq } = {}) {
  const wf = buildToTemp();
  const world = makeWorld({ seed, actors });
  const stores = Object.fromEntries(actors.map((a) => [a, makeStore({ actor_id: a, role: world.roleOf(a), mode, peers: actors.filter((x) => x !== a) })]));
  const queue = [];   // proxy deliveries (fire-and-forget, D6)
  const log = [];
  const httpFor = (actor) => async (method, url, body) => {
    const u = new URL(url);
    if (u.host === 'store:4000') return stores[actor].handle(method, u.pathname, body);
    if (u.host === 'sim:3000') {
      if (u.pathname === '/sense') return { status: 200, json: world.sense(u.searchParams.get('actor')) };
      if (u.pathname === '/move') return { status: 200, json: world.do(body.actor, { kind: 'move', target: body.target, key: body.key }) };
      if (u.pathname === '/rescue') return { status: 200, json: world.do(body.actor, { kind: 'rescue', survivor_id: body.survivor_id, key: body.key }) };
    }
    if (u.host === 'proxy:8080' && u.pathname === '/send') {
      if (!links(body.from, body.to)) { log.push({ ...body, status: 'refused' }); return { status: 503, json: { error: 'link down' } }; }
      queue.push(body); log.push({ from: body.from, to: body.to, status: 'queued' });
      return { status: 202, json: { queued: true } };
    }
    if (u.host === 'proxy:8080' && u.pathname === '/rpc') {
      const r = hq ? hq(body) : null;
      return r ? { status: 200, json: r } : { status: 503, json: { error: 'link down' } };
    }
    return { status: 404, json: { error: `no route ${method} ${url}` } };
  };
  const h = {
    wf, world, stores, queue, log,
    async tick() {
      world.step();
      for (const a of actors) await execute(wf['hive-tick'], { body: { tick: world.tick }, headers: {}, query: {} }, httpFor(a));
    },
    async gossipRound() {
      for (const a of actors) await execute(wf['hive-gossip'], {}, httpFor(a));
      const batch = queue.splice(0);
      for (const m of batch) await execute(wf['hive-merge'], { body: m.body, headers: {}, query: {} }, httpFor(m.to));
    },
    view: (a) => stores[a].state?.view,
    exec: (name, trigger, actor) => execute(wf[name], trigger, httpFor(actor)),
  };
  return h;
}

test('workflow smoke test: 10 ticks, every store reaches tick >= 9 with 0 conflicts', async () => {
  const h = harness({ actors: ['drone-1', 'drone-2', 'team-1', 'team-2'] });
  for (let t = 0; t < 10; t++) { await h.tick(); if (t % 2 === 1) await h.gossipRound(); }
  for (const a of Object.keys(h.stores)) {
    assert.ok(h.view(a).tick >= 9, `${a} view.tick = ${h.view(a)?.tick}`);
    assert.equal(h.stores[a].conflicts, 0, `${a} conflicts`);
  }
});

test('workflows end to end: 7 actors find, share and rescue; digests converge; 0 conflicts', async () => {
  const h = harness({ seed: 3 });
  const every = Math.round(P.gossip_ms / P.tick_ms);
  for (let t = 1; t <= 60; t++) { await h.tick(); if (t % every === 0) await h.gossipRound(); }
  for (let k = 0; k < 3; k++) await h.gossipRound();      // paused: let gossip settle
  const rescued = Object.values(h.world.rescued);
  assert.ok(rescued.length >= 3, `only ${rescued.length} rescued`);
  assert.ok(rescued.every((r) => r.by.startsWith('team')), 'only teams rescue');
  const digests = new Set(ACTORS.map((a) => h.view(a).digest));
  assert.equal(digests.size, 1, `digests: ${[...digests]}`);
  // A drone's detection reached a team and the team rescued: TASK_CREATED by a drone, RESCUED by a team.
  const evs = Object.values(h.stores['team-1'].state.log.events);
  const found = new Set(evs.filter((e) => e.type === 'TASK_CREATED' && e.origin.startsWith('drone')).map((e) => e.data.survivor_id));
  assert.ok(evs.some((e) => e.type === 'RESCUED' && e.origin.startsWith('team') && found.has(e.data.survivor_id)));
  for (const a of ACTORS) assert.equal(h.stores[a].conflicts, 0);
  assert.equal(h.world.duplicate_rescues, 0, 'CBBA: no two teams attempt the same survivor');
});

test('a cut link stops sync: drone-1 keeps emitting but nobody else learns', async () => {
  const cut = (a, b) => a !== 'drone-1' && b !== 'drone-1';
  const h = harness({ seed: 2, links: cut });
  for (let t = 1; t <= 12; t++) { await h.tick(); if (t % 2 === 0) await h.gossipRound(); }
  assert.ok(h.view('drone-1').vv['drone-1'] > 0, 'drone-1 still emits events');
  for (const a of ACTORS.filter((x) => x !== 'drone-1')) assert.equal(h.view(a).vv['drone-1'], undefined, `${a} heard from drone-1`);
  assert.ok(h.log.some((l) => l.status === 'refused' && l.from === 'drone-1'));
});

test('a stale write fails the execution loudly (409), and a stale queued tick is dropped', async () => {
  const h = harness({ actors: ['drone-1', 'team-1'] });
  await h.tick(); await h.tick();
  const before = h.stores['team-1'].state.view.tick;
  // An old tick arriving late: Perceive returns no items, nothing is written.
  const r = await h.exec('hive-tick', { body: { tick: 0 } }, 'team-1');
  assert.ok(!r.order.includes('Put State'));
  assert.equal(h.stores['team-1'].state.view.tick, before);
  // Overlapping executions would write a stale version: the store returns 409 and the node throws.
  const store = h.stores['team-1'];
  const stale = await store.handle('GET', '/state');
  store.handle('PUT', '/state', { version: stale.json.version, state: stale.json.state });
  const res = store.handle('PUT', '/state', { version: stale.json.version, state: stale.json.state });
  assert.equal(res.status, 409);
  const putNode = h.wf['hive-merge'].nodes.find((n) => n.name === 'Put State');
  assert.equal(putNode.onError, undefined, 'Put State must never continue on fail');
});
