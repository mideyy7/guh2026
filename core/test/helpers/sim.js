// Test-only mini world + runner. Dev A's world/ is the real simulator; this is just enough
// physics to exercise the real core the same way the n8n hive-tick workflow does:
//   world.step() → for each actor: perceive → bid → act → do actions → applyReceipts
// and every gossip interval: gossip → deliver over the links that are up → merge.
const H = require('../../dist/hive-core.js');
const P = H.PARAMS;
const { cellXY, cellId, dist, step } = H.Score;

const ACTORS = ['drone-1', 'drone-2', 'drone-3', 'drone-4', 'team-1', 'team-2', 'team-3'];
const ISLANDS = [['drone-1', 'drone-2', 'team-1'], ['drone-3', 'team-2'], ['drone-4', 'team-3']];

function rng(seed) { let a = seed >>> 0 || 1; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function makeWorld({ seed = 1, survivors, actors = ACTORS, start } = {}) {
  const r = rng(seed * 7919);
  const surv = survivors || Array.from({ length: P.survivors }, (_, i) => ({
    survivor_id: `s${String(i).padStart(2, '0')}`,
    cell: `${Math.floor(r() * P.grid)}-${Math.floor(r() * P.grid)}`,
    people: 1 + Math.floor(r() * 5), urgency: 1 + Math.floor(r() * 5),
    appear_tick: Math.floor(r() * P.appear_by_tick),
  }));
  const teamStarts = ['0-7', '7-7', '7-0'];
  const pos = {};
  actors.forEach((a) => {
    pos[a] = cellXY((start && start[a]) || (a.startsWith('drone') ? '3-3' : teamStarts[(+a.split('-')[1] - 1) % 3]));
  });
  const w = {
    tick: 0, pos, survivors: surv, rescued: {}, keys: {}, moves: {}, frac: {},
    attempts: [], duplicate_rescues: 0, failed_attempts: 0,
    roleOf: (a) => (a.startsWith('drone') ? 'drone' : 'team'),
    step() {
      w.tick += 1;
      for (const a of Object.keys(w.moves).sort()) {
        const tgt = w.moves[a];
        const speed = P.speed[w.roleOf(a)];
        w.frac[a] = (w.frac[a] || 0) + speed;
        while (w.frac[a] >= 1 && (w.pos[a].x !== tgt.x || w.pos[a].y !== tgt.y)) { w.pos[a] = step(w.pos[a], tgt); w.frac[a] -= 1; }
        if (w.frac[a] > 1) w.frac[a] = 1;
      }
      w.moves = {};
    },
    sense(a) {
      const R = P.sensor_radius[w.roleOf(a)], p = w.pos[a], footprint = [];
      for (let y = p.y - R; y <= p.y + R; y++) for (let x = p.x - R; x <= p.x + R; x++) if (x >= 0 && y >= 0 && x < P.grid && y < P.grid) footprint.push(`${x}-${y}`);
      const detections = w.survivors
        .filter((s) => s.appear_tick <= w.tick && !w.rescued[s.survivor_id] && footprint.includes(s.cell))
        .map(({ survivor_id, cell, people, urgency }) => ({ survivor_id, cell, people, urgency }));
      return { tick: w.tick, actor: a, pos: { ...p }, footprint, detections };
    },
    do(a, action) {
      if (action.kind === 'move') {
        if (!w.keys[action.key]) { w.keys[action.key] = true; w.moves[a] = action.target; }
        return { ok: true, pos: { ...w.pos[a] } };
      }
      if (w.keys[action.key]) return w.keys[action.key];        // idempotent receipt
      const s = w.survivors.find((x) => x.survivor_id === action.survivor_id);
      let result;
      if (!s || s.appear_tick > w.tick || cellId(w.pos[a]) !== s.cell) result = 'not_here';
      else if (w.rescued[s.survivor_id]) { result = 'already_rescued'; w.duplicate_rescues += 1; }
      else { result = 'rescued'; w.rescued[s.survivor_id] = { by: a, tick: w.tick }; }
      if (result !== 'rescued') w.failed_attempts += 1;
      w.attempts.push({ a, survivor_id: action.survivor_id, result, tick: w.tick });
      const receipt = { result, tick: w.tick };
      w.keys[action.key] = receipt;
      return receipt;
    },
  };
  return w;
}

// Run the actors. links(tick) → (from, to) => bool. hq: optional (actor, body, tick) → response|null.
function makeRun({ seed = 1, actors = ACTORS, mode = 'hive', world, survivors, start } = {}) {
  const w = world || makeWorld({ seed, actors, survivors, start });
  const r = rng(seed * 104729 + 1);
  const ms = (t, i = 0) => 1_700_000_000_000 + t * P.tick_ms + i;
  const st = {};
  actors.forEach((a, i) => {
    st[a] = H.init({ actor_id: a, role: w.roleOf(a), mode, peers: actors.filter((x) => x !== a) }, ms(0, i));
  });
  let inflight = [];
  let clock = 0;   // extra ms for gossip rounds while the sim is paused
  const run = {
    world: w, state: st, actors, gossipsSent: 0, bytes: 0,
    tick(links, hq) {
      w.step();
      actors.forEach((a, i) => {
        const now = ms(w.tick, i) + clock;
        let s = H.perceive(st[a], { tick: w.tick, sense: w.sense(a) }, now);
        s = H.bid(s, now);
        const hqResp = hq ? hq(a, H.hqRequest ? H.hqRequest(s) : null, w.tick) : null;
        const out = H.act(s, { hq: hqResp }, now);
        const receipts = out.actions.map((action) => ({ action, response: w.do(a, action) }));
        st[a] = H.applyReceipts(out.state, receipts, now);
      });
      if (w.tick % Math.round(P.gossip_ms / P.tick_ms) === 0) run.gossip(links, w.tick);
    },
    // One gossip round: deliver what's in flight (sent last round), then send new messages.
    gossip(links, t, { immediate = false } = {}) {
      const deliver = (msgs) => {
        for (let i = msgs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [msgs[i], msgs[j]] = [msgs[j], msgs[i]]; }
        for (const m of msgs) st[m.to] = H.merge(st[m.to], m.body, ms(t, 50) + clock);
      };
      if (!immediate) deliver(inflight);
      inflight = [];
      for (const [i, a] of actors.entries()) {
        const out = H.gossip(st[a], ms(t, 10 + i) + clock);
        st[a] = out.state;
        for (const m of out.messages) {
          if (!actors.includes(m.to)) continue;
          if (links && !links(a, m.to)) continue;
          run.gossipsSent += 1; run.bytes += JSON.stringify(m.body).length;
          inflight.push({ to: m.to, body: m.body });
        }
      }
      if (immediate) { deliver(inflight); inflight = []; }
    },
    // Paused: no world steps, wall clock keeps moving (D8). Gossip until quiet.
    pausedRounds(n, links) {
      for (let k = 0; k < n; k++) { clock += P.gossip_ms; run.gossip(links, w.tick, { immediate: true }); }
    },
    digests: () => actors.map((a) => st[a].view.digest),
  };
  return run;
}

const allUp = () => () => true;
const islandsOf = (groups) => {
  const g = {}; groups.forEach((grp, i) => grp.forEach((a) => { g[a] = i; }));
  return (a, b) => g[a] !== undefined && g[a] === g[b];
};

module.exports = { H, P, ACTORS, ISLANDS, rng, makeWorld, makeRun, allUp, islandsOf, cellXY, cellId, dist };
