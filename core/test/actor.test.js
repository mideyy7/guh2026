// Phase 1 core tests: pure, no Docker.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { H, P, makeRun, makeWorld, allUp } = require('./helpers/sim.js');

const cfg = (actor_id, extra = {}) => ({ actor_id, role: actor_id.startsWith('drone') ? 'drone' : 'team', mode: 'hive',
  peers: ['drone-1', 'drone-2', 'drone-3', 'drone-4', 'team-1', 'team-2', 'team-3'].filter((x) => x !== actor_id), ...extra });
const sense = (tick, pos, detections = [], footprint = []) => ({ tick, actor: 'x', pos, footprint, detections });
const NOW = 1_700_000_000_000;

test('two drones detecting the same survivor create the same T- id; after a merge exactly one task exists', () => {
  const det = [{ survivor_id: 's07', cell: '4-2', people: 3, urgency: 4 }];
  let a = H.perceive(H.init(cfg('drone-1'), NOW), { tick: 5, sense: sense(5, { x: 3, y: 3 }, det) }, NOW);
  let b = H.perceive(H.init(cfg('drone-2'), NOW), { tick: 6, sense: sense(6, { x: 4, y: 3 }, det) }, NOW);
  assert.deepEqual(Object.keys(a.tasks), ['T-s07']);
  assert.deepEqual(Object.keys(b.tasks), ['T-s07']);
  const msg = H.gossip(a, NOW).messages.find((m) => m.to === 'drone-2').body;
  b = H.merge(b, msg, NOW + 1);
  assert.deepEqual(Object.keys(b.tasks), ['T-s07']);
  assert.equal(b.tasks['T-s07'].created_tick, 5, 'age comes from the earliest detection, whatever the arrival order');
  assert.equal(b.view.known_tasks, 1);
});

test('replay safety: the same gossip merged 3 times leaves state and digest unchanged', () => {
  let a = H.init(cfg('drone-1'), NOW);
  a = H.perceive(a, { tick: 3, sense: sense(3, { x: 1, y: 1 }, [{ survivor_id: 's01', cell: '1-2', people: 2, urgency: 5 }], ['0-0', '1-1', '1-2']) }, NOW);
  const body = H.gossip(a, NOW).messages.find((m) => m.to === 'team-1').body;
  let t = H.init(cfg('team-1'), NOW);
  t = H.merge(t, body, NOW + 5);
  const once = JSON.stringify(t);
  for (let i = 0; i < 2; i++) t = H.merge(t, body, NOW + 5);
  assert.equal(JSON.stringify(t), once);
  assert.equal(t.view.digest, JSON.parse(once).view.digest);
});

test('a gossip body carries vv, events, a position hint, and only what the peer lacks', () => {
  let a = H.init(cfg('drone-1'), NOW);
  a = H.perceive(a, { tick: 1, sense: sense(1, { x: 0, y: 0 }, [], ['0-0', '0-1']) }, NOW);
  const { messages } = H.gossip(a, NOW);
  assert.equal(messages.length, 6);
  const body = messages[0].body;
  assert.deepEqual(Object.keys(body).sort(), ['events', 'from', 'hint', 'sent_at', 'vv']);
  assert.equal(body.events.length, 2);
  // The peer tells us it has everything → next gossip to it is empty.
  a = H.merge(a, { from: messages[0].to, sent_at: NOW, vv: { 'drone-1': 2 }, events: [] }, NOW);
  assert.equal(H.gossip(a, NOW).messages.find((m) => m.to === messages[0].to).body.events.length, 0);
});

test('simulated 4-actor run: after one gossip round, searched/rescued sets and digests all match', () => {
  const actors = ['drone-1', 'drone-2', 'team-1', 'team-2'];
  for (const seed of [1, 2, 3, 4, 5]) {
    const run = makeRun({ seed, actors });
    for (let t = 0; t < 61; t++) run.tick(allUp());   // 61: ends between gossip rounds
    run.pausedRounds(1);
    const s = actors.map((a) => run.state[a]);
    const keys = (o) => JSON.stringify(Object.keys(o).sort());
    for (const x of s) {
      assert.equal(keys(x.log.searched), keys(s[0].log.searched), `seed ${seed}: searched differs`);
      assert.equal(keys(x.log.rescued), keys(s[0].log.rescued), `seed ${seed}: rescued differs`);
    }
    assert.equal(new Set(run.digests()).size, 1, `seed ${seed}: digests ${run.digests()}`);
    assert.ok(Object.keys(run.world.rescued).length > 0, `seed ${seed}: the greedy teams should rescue someone`);
  }
});

test('rescue receipts: rescued → RESCUED, already_rescued/not_here → ATTEMPT; the intent is cleared', () => {
  let t = H.init(cfg('team-1'), NOW);
  t = H.perceive(t, { tick: 1, sense: sense(1, { x: 2, y: 2 }, [{ survivor_id: 's1', cell: '2-2', people: 1, urgency: 3 }]) }, NOW);
  const out = H.act(t, { hq: null }, NOW);
  const rescue = out.actions.find((a) => a.kind === 'rescue');
  assert.equal(rescue.key, 'team-1:T-s1:rescue');
  assert.ok(out.state.intents[rescue.key], 'intent written before acting');
  const done = H.applyReceipts(out.state, [{ action: rescue, response: { result: 'rescued', tick: 1 } }], NOW);
  assert.deepEqual(done.intents, {});
  assert.deepEqual(Object.keys(done.log.rescued), ['s1']);
  assert.equal(Object.values(done.log.events).filter((e) => e.type === 'RESCUED').length, 1);

  const other = H.applyReceipts(out.state, [{ action: rescue, response: { result: 'already_rescued', tick: 1 } }], NOW);
  const ev = Object.values(other.log.events).find((e) => e.type === 'ATTEMPT');
  assert.equal(ev.data.result, 'already_rescued');
  assert.ok(other.gone.s1);

  const failed = H.applyReceipts(out.state, [{ action: rescue, response: null }], NOW);
  assert.ok(failed.intents[rescue.key], 'a failed call keeps the intent so it is retried with the same key');
});

test('search: two drones in the same place, everything unsearched, pick different targets', () => {
  for (const pair of [['drone-1', 'drone-2'], ['drone-3', 'drone-4'], ['drone-1', 'drone-4']]) {
    const targets = pair.map((id) => {
      let s = H.init(cfg(id), NOW);
      s = H.perceive(s, { tick: 0, sense: sense(0, { x: 3, y: 3 }) }, NOW);
      return H.act(s, { hq: null }, NOW).state.search_target;
    });
    assert.notEqual(targets[0], targets[1], `${pair}: both chose ${targets[0]}`);
  }
});

test('search: four drones starting together cover the whole grid within 40 ticks', () => {
  const run = makeRun({ seed: 9, actors: ['drone-1', 'drone-2', 'drone-3', 'drone-4'], survivors: [] });
  for (let t = 0; t < 40; t++) run.tick(allUp());
  assert.equal(Object.keys(run.state['drone-1'].log.searched).length, P.grid * P.grid);
});

test('Code-node compatibility: dist loads with require and contains no require( or import', () => {
  const file = path.join(__dirname, '..', 'dist', 'hive-core.js');
  const src = readFileSync(file, 'utf8');
  assert.equal(/\brequire\s*\(/.test(src), false);
  assert.equal(/^\s*import\s/m.test(src), false);
  for (const fn of ['init', 'perceive', 'bid', 'act', 'applyReceipts', 'gossip', 'merge', 'score', 'sharedDigest']) {
    assert.equal(typeof H[fn], 'function', fn);
  }
  assert.equal(H.PARAMS.grid, 8);
});

test('score: closer, more urgent, fresher tasks score higher; path length costs', () => {
  const pos = { x: 0, y: 0 };
  const t = (cell, urgency, created_tick = 0) => ({ cell, urgency, created_tick });
  assert.ok(H.score(pos, t('1-1', 5), [], 0) > H.score(pos, t('4-4', 5), [], 0));
  assert.ok(H.score(pos, t('1-1', 5), [], 0) > H.score(pos, t('1-1', 2), [], 0));
  assert.ok(H.score(pos, t('1-1', 5, 0), [], 0) > H.score(pos, t('1-1', 5, 0), [], 50));
  assert.ok(H.score(pos, t('2-2', 5), [], 0) > H.score(pos, t('2-2', 5), [t('1-1', 1)], 0), 'a bundle entry costs w3');
  // eta is measured at team speed: 2 cells at 0.5 cells/tick = 4 ticks
  assert.equal(H.Score.eta(pos, [], t('2-1', 1), P), 4);
});

test('the world helper is deterministic: same seed, same rescues', () => {
  const go = () => { const run = makeRun({ seed: 4 }); for (let t = 0; t < 80; t++) run.tick(allUp()); return JSON.stringify(run.world.rescued); };
  assert.equal(go(), go());
});
