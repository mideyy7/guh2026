// Phase 3 tests: CBBA inside the real actor core. Pure, no Docker.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cbba.js');
const { H, P, ACTORS, ISLANDS, makeRun, allUp, islandsOf } = require('./helpers/sim.js');

// ---------------------------------------------------------------------------------------
// The CBBA decision table (Choi, Brunet & How 2009, Table 1): what receiver i does with
// task t after hearing from sender k. I=receiver, K=sender, M and N are third parties.
// sK/sI are the two sides' timestamps for M and N ("newer" means k has fresher info).
// ---------------------------------------------------------------------------------------
const I = 'team-1', K = 'team-2', M = 'team-3', N = 'team-4';
const id = { I, K, M, N, null: null };
//  [sender z, sender y, receiver z, receiver y, k newer about M?, k newer about N?, expected]
const TABLE = [
  // sender thinks K (itself) wins
  ['K', 10, 'I', 5, 0, 0, 'update'],   // k outbids me
  ['K', 3, 'I', 5, 0, 0, 'leave'],     // I still win
  ['K', 6, 'K', 4, 0, 0, 'update'],    // k knows best about itself
  ['K', 3, 'M', 5, 1, 0, 'update'],    // k has fresher info about m
  ['K', 10, 'M', 5, 0, 0, 'update'],   // k outbids m
  ['K', 3, 'M', 5, 0, 0, 'leave'],
  ['K', 4, null, 0, 0, 0, 'update'],
  // sender thinks I win
  ['I', 5, 'I', 5, 0, 0, 'leave'],
  ['I', 5, 'K', 4, 0, 0, 'reset'],
  ['I', 5, 'M', 4, 1, 0, 'reset'],
  ['I', 5, 'M', 4, 0, 0, 'leave'],
  ['I', 5, null, 0, 0, 0, 'leave'],
  // sender thinks a third agent M wins
  ['M', 10, 'I', 5, 1, 0, 'update'],   // newer about m and m outbids me
  ['M', 3, 'I', 5, 1, 0, 'leave'],     // newer, but I outbid m
  ['M', 10, 'I', 5, 0, 0, 'leave'],    // not newer
  ['M', 5, 'K', 4, 1, 0, 'update'],
  ['M', 5, 'K', 4, 0, 0, 'reset'],
  ['M', 7, 'M', 4, 1, 0, 'update'],
  ['M', 7, 'M', 4, 0, 0, 'leave'],
  ['M', 3, 'N', 5, 1, 1, 'update'],    // newer about both m and n
  ['M', 10, 'N', 5, 1, 0, 'update'],   // newer about m and m outbids n
  ['M', 3, 'N', 5, -1, 1, 'reset'],    // newer about n, older about m
  ['M', 3, 'N', 5, 0, 0, 'leave'],
  ['M', 5, null, 0, 1, 0, 'update'],
  ['M', 5, null, 0, 0, 0, 'leave'],
  // sender thinks nobody wins
  [null, 0, 'I', 5, 0, 0, 'leave'],
  [null, 0, 'K', 4, 0, 0, 'update'],   // k gave it up
  [null, 0, 'M', 4, 1, 0, 'update'],
  [null, 0, 'M', 4, 0, 0, 'leave'],
  [null, 0, null, 0, 0, 0, 'leave'],
];

test('CBBA decision table: every row updates, resets or leaves as specified', () => {
  const NOW = 1000, T = 't1';
  for (const [zk, yk, zi, yi, newerM, newerN, want] of TABLE) {
    const row = `sender z=${zk} y=${yk} | receiver z=${zi} y=${yi} | newer m=${newerM} n=${newerN}`;
    const i = C.emptyAgent(I);
    i.y[T] = yi; i.z[T] = id[zi];
    if (zi === 'I') i.bundle = [T];
    i.s = { [M]: 100, [N]: 100 };
    const k = { id: K, y: { [T]: yk }, z: { [T]: id[zk] }, s: { [M]: 100 + 50 * newerM, [N]: 100 + 50 * newerN } };
    C.receive(i, k, NOW, [T]);
    let got;
    if (i.z[T] === id[zi] && (i.y[T] || 0) === yi) got = 'leave';
    else if (i.z[T] === (id[zk] ?? null) && (i.y[T] || 0) === (yk || 0)) got = 'update';
    else if (i.z[T] == null && (i.y[T] || 0) === 0) got = 'reset';
    else got = `other(z=${i.z[T]}, y=${i.y[T]})`;
    assert.equal(got, want, row);
    if (zi === 'I' && got !== 'leave') assert.deepEqual(i.bundle, [], `${row}: a lost task is released from the bundle`);
  }
  assert.equal(TABLE.length, 30);
});

// ---------------------------------------------------------------------------------------
const teams = ACTORS.filter((a) => a.startsWith('team'));
function checkAgreement(run, label) {
  const views = ACTORS.map((a) => run.state[a].view);
  assert.equal(new Set(views.map((v) => v.digest)).size, 1, `${label}: digests differ`);
  const owners = views[0].owners;
  const held = {};
  for (const t of teams) {
    const b = run.state[t].view.bundle;
    assert.ok(b.length <= P.bundle_max, `${label}: ${t} holds ${b.length} tasks`);
    for (const task of b) {
      assert.equal(held[task], undefined, `${label}: ${task} held by ${held[task]} and ${t}`);
      held[task] = t;
    }
  }
  for (const [task, team] of Object.entries(held)) {
    if (task in owners) assert.equal(owners[task], team, `${label}: ${task} in ${team}'s bundle but owner is ${owners[task]}`);
  }
}

test('7 actors, 200 seeds: 3-island blackout for 40 ticks, then reconnect → one agreed allocation within 10 gossip rounds', () => {
  let maxRounds = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const run = makeRun({ seed });
    for (let t = 0; t < 40; t++) run.tick(islandsOf(ISLANDS));
    let rounds = 0;
    while (new Set(run.digests()).size > 1 && rounds < 10) { run.pausedRounds(1, allUp()); rounds++; }
    run.pausedRounds(1, allUp());                     // one more quiet round: must stay agreed
    maxRounds = Math.max(maxRounds, rounds);
    checkAgreement(run, `seed ${seed}`);
  }
  assert.ok(maxRounds <= 10);
});

test('all links up for the whole horizon: no duplicate rescues and nearly everyone saved', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const run = makeRun({ seed });
    for (let t = 0; t < P.horizon_ticks; t++) run.tick(allUp());
    assert.equal(run.world.duplicate_rescues, 0, `seed ${seed}`);
    assert.ok(Object.keys(run.world.rescued).length >= 26, `seed ${seed}: ${Object.keys(run.world.rescued).length}/30`);
    assert.ok(Object.values(run.world.rescued).every((r) => r.by.startsWith('team')));
  }
});

test('duplicates are measured, not hidden: both islands commit to one survivor → 1 RESCUED + 1 ATTEMPT(already_rescued)', () => {
  // team-1 and team-2 are cut off from each other, each one cell from the same survivor.
  // Live actors run concurrently: both sense the survivor BEFORE either rescue lands. Model
  // that by perceiving both teams first, then acting both.
  const actors = ['team-1', 'team-2'];
  const survivors = [{ survivor_id: 's00', cell: '3-3', people: 2, urgency: 5, appear_tick: 0 }];
  const run = makeRun({ seed: 1, actors, survivors, start: { 'team-1': '2-3', 'team-2': '4-3' } });
  const w = run.world, st = run.state, NOW = 1_700_000_000_000;
  for (let t = 0; t < 6; t++) {
    w.step();
    for (const a of actors) st[a] = H.bid(H.perceive(st[a], { tick: w.tick, sense: w.sense(a) }, NOW + t), NOW + t);
    for (const a of actors) {
      const out = H.act(st[a], { hq: null }, NOW + t);
      st[a] = H.applyReceipts(out.state, out.actions.map((action) => ({ action, response: w.do(a, action) })), NOW + t);
    }
  }
  assert.equal(Object.keys(w.rescued).length, 1, 'exactly one rescue');
  assert.equal(w.duplicate_rescues, 1, 'the duplicate shows up in metrics');
  run.pausedRounds(2, allUp());
  for (const a of actors) {
    const evs = Object.values(st[a].log.events);
    assert.equal(evs.filter((e) => e.type === 'RESCUED').length, 1, `${a}: one RESCUED`);
    assert.equal(evs.filter((e) => e.type === 'ATTEMPT' && e.data.result === 'already_rescued').length, 1, `${a}: one failed ATTEMPT`);
    assert.equal(evs.filter((e) => e.type === 'COMMITTED').length, 2, `${a}: both teams committed`);
  }
  assert.equal(st['team-1'].view.digest, st['team-2'].view.digest);
});

test('a team that sees an empty cell does not send a pointless rescue', () => {
  // team-2 hears nothing; team-1 rescues first. team-2 arrives later, sees nobody, moves on.
  const actors = ['team-1', 'team-2'];
  const survivors = [{ survivor_id: 's00', cell: '3-3', people: 2, urgency: 5, appear_tick: 0 }];
  const run = makeRun({ seed: 1, actors, survivors, start: { 'team-1': '3-4', 'team-2': '4-3' } });
  run.world.frac['team-1'] = 1;                        // team-1 gets there a tick earlier
  for (let t = 0; t < 8; t++) run.tick(() => false);
  assert.equal(run.world.duplicate_rescues, 0);
  assert.ok(run.state['team-2'].absent.s00, 'team-2 saw the cell empty');
  assert.equal(run.state['team-2'].view.bundle.length, 0);
});

test('restart recovery: an intent with no receipt is re-sent with the SAME key, and counts once', () => {
  const actors = ['team-1'];
  const survivors = [{ survivor_id: 's00', cell: '1-1', people: 1, urgency: 4, appear_tick: 0 }];
  const run = makeRun({ seed: 1, actors, survivors, start: { 'team-1': '1-1' } });
  const w = run.world; const NOW = 1_700_000_000_000;
  w.step();
  let s = H.perceive(run.state['team-1'], { tick: w.tick, sense: w.sense('team-1') }, NOW);
  s = H.bid(s, NOW);
  const out = H.act(s, { hq: null }, NOW);
  const rescue = out.actions.find((a) => a.kind === 'rescue');
  assert.ok(out.state.intents[rescue.key], 'intent saved before acting (Put State)');
  w.do('team-1', rescue);                               // the sim did it ... then n8n crashed: no receipt
  const saved = JSON.parse(JSON.stringify(out.state)); // what the store holds
  w.step();
  let r = H.perceive(saved, { tick: w.tick, sense: w.sense('team-1') }, NOW + 2000);
  r = H.bid(r, NOW + 2000);
  const again = H.act(r, { hq: null }, NOW + 2000);
  const resent = again.actions.filter((a) => a.kind === 'rescue');
  assert.deepEqual(resent.map((a) => a.key), [rescue.key], 'same key, sent once');
  const receipt = w.do('team-1', resent[0]);
  assert.equal(receipt.result, 'rescued', 'the sim returns the original receipt for a repeated key');
  const done = H.applyReceipts(again.state, [{ action: resent[0], response: receipt }], NOW + 2000);
  assert.equal(Object.values(done.log.events).filter((e) => e.type === 'RESCUED').length, 1);
  assert.deepEqual(done.intents, {});
  assert.equal(w.duplicate_rescues, 0);
});

test('a task another team COMMITTED to leaves my bundle; my own commit is kept (irreversible)', () => {
  const NOW = 1_700_000_000_000;
  const cfg = (actor_id) => ({ actor_id, role: 'team', mode: 'hive', peers: ['team-1', 'team-2'].filter((x) => x !== actor_id) });
  const det = [{ survivor_id: 'a', cell: '2-2', people: 1, urgency: 5 }, { survivor_id: 'b', cell: '3-3', people: 1, urgency: 5 }];
  let t1 = H.perceive(H.init(cfg('team-1'), NOW), { tick: 1, sense: { tick: 1, pos: { x: 2, y: 2 }, footprint: [], detections: det } }, NOW);
  t1 = H.bid(t1, NOW);
  assert.deepEqual(t1.view.bundle.sort(), ['T-a', 'T-b']);
  const act = H.act(t1, { hq: null }, NOW);           // at 2-2: commits to T-a and rescues
  assert.equal(act.state.my_commit, 'T-a');
  assert.ok(Object.values(act.state.log.events).some((e) => e.type === 'COMMITTED' && e.data.task_id === 'T-a'));
  // team-2 commits to T-b; team-1 hears it and gives T-b up.
  let t2 = H.perceive(H.init(cfg('team-2'), NOW), { tick: 1, sense: { tick: 1, pos: { x: 3, y: 3 }, footprint: [], detections: det } }, NOW);
  t2 = H.act(H.bid(t2, NOW), { hq: null }, NOW).state;
  assert.equal(t2.my_commit, 'T-b');
  const msg = H.gossip(t2, NOW).messages.find((m) => m.to === 'team-1').body;
  let s = H.merge(act.state, msg, NOW + 1);
  s = H.bid(s, NOW + 1);
  assert.deepEqual(s.view.bundle, ['T-a'], 'kept my commit, dropped the task team-2 committed to');
});
