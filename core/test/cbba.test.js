const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cbba.js');

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// Random connected graph: a random spanning tree plus extra edges.
function graph(n, r, extra) {
  const adj = Array.from({ length: n }, () => new Set());
  for (let v = 1; v < n; v++) { const u = Math.floor(r() * v); adj[u].add(v); adj[v].add(u); }
  for (let e = 0; e < extra; e++) { const u = Math.floor(r() * n), v = Math.floor(r() * n); if (u !== v) { adj[u].add(v); adj[v].add(u); } }
  return adj;
}

function run(seed, nAgents, nTasks, maxLen) {
  const r = rng(seed);
  const ids = Array.from({ length: nAgents }, (_, i) => `team-${i + 1}`);
  const tasks = Array.from({ length: nTasks }, (_, j) => `t${String(j).padStart(2, '0')}`);
  const base = {}; for (const a of ids) for (const t of tasks) base[a + t] = Math.round(1 + r() * 99);
  // Deliberately NOT diminishing: position 1 gets a +40 bonus. Bid warping must cope.
  const marginal = (a, t, bundle) => base[a + t] - 7 * bundle.length + (bundle.length === 1 ? 40 : 0);
  const agents = ids.map(C.emptyAgent);
  const adj = graph(nAgents, r, Math.floor(r() * nAgents));
  let rounds = 0, quiet = 0;
  while (quiet < 3 && rounds < 200) {
    rounds++;
    for (const a of agents) C.buildBundle(a, tasks, marginal, maxLen);
    const snaps = agents.map(C.snapshot);           // synchronous round: everyone sends last state
    let changed = false;
    agents.forEach((a, i) => { for (const k of adj[i]) changed = C.receive(a, snaps[k], rounds, tasks) || changed; });
    quiet = changed ? 0 : quiet + 1;
  }
  return { agents, tasks, rounds, maxLen };
}

test('CBBA reaches a conflict-free, agreed allocation on 300 random connected graphs', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const nA = 2 + (seed % 6), nT = 3 + (seed % 15), L = 1 + (seed % 3);
    const { agents, tasks, rounds } = run(seed, nA, nT, L);
    assert.ok(rounds < 200, `seed ${seed}: did not converge`);
    for (const t of tasks) {
      const winners = new Set(agents.map((a) => a.z[t] ?? null));
      assert.equal(winners.size, 1, `seed ${seed}: agents disagree on ${t}`);
      const w = [...winners][0];
      const holders = agents.filter((a) => a.bundle.includes(t)).map((a) => a.id);
      if (w == null) assert.deepEqual(holders, [], `seed ${seed}: ${t} unowned but held`);
      else assert.deepEqual(holders, [w], `seed ${seed}: ${t} held by ${holders} but winner ${w}`);
    }
    for (const a of agents) assert.ok(a.bundle.length <= L);
  }
});

test('ties go to the lower id, deterministically', () => {
  assert.equal(C.beats(10, 'team-1', 10, 'team-2'), true);
  assert.equal(C.beats(10, 'team-2', 10, 'team-1'), false);
});

test('partition then reconnect: islands allocate independently, then converge to one allocation', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed);
    const ids = ['team-1', 'team-2', 'team-3', 'team-4'];
    const tasks = Array.from({ length: 6 + (seed % 6) }, (_, j) => `t${j}`);
    const base = {}; for (const a of ids) for (const t of tasks) base[a + t] = Math.round(1 + r() * 99);
    const marginal = (a, t, b) => base[a + t] - 5 * b.length;
    const agents = ids.map(C.emptyAgent);
    const split = [[1], [0], [3], [2]];                 // islands {1,2} and {3,4}
    const joined = [[1, 2], [0, 3], [0, 3], [1, 2]];    // ring
    let now = 0;
    const rounds = (adj, n) => { for (let k = 0; k < n; k++) { now++;
      for (const a of agents) C.buildBundle(a, tasks, marginal, 2);
      const snaps = agents.map(C.snapshot);
      agents.forEach((a, i) => { for (const j of adj[i]) C.receive(a, snaps[j], now, tasks); }); } };
    rounds(split, 30);
    // During the partition both islands may claim the same task: that is expected and measured.
    rounds(joined, 60);
    for (const t of tasks) {
      const w = new Set(agents.map((a) => a.z[t] ?? null));
      assert.equal(w.size, 1, `seed ${seed}: disagreement on ${t} after reconnect`);
      const holders = agents.filter((a) => a.bundle.includes(t)).map((a) => a.id);
      const win = [...w][0];
      assert.deepEqual(holders, win == null ? [] : [win], `seed ${seed}: ${t}`);
    }
  }
});
