// STUB CORE — a deliberately simple stand-in that implements the contract C6 API, so Dev A can
// build and test the headless benchmark before Dev B's real core (core/dist/hive-core.js) exists.
// It is NOT HIVE: no CBBA, no version vectors. Numbers produced with it are meaningless and the
// runner labels them "stub". Pure: no I/O, no Date.now(), no Math.random().
const HiveStub = (() => {
  const P = require('../contracts/params.json');
  const parse = (c) => { const [x, y] = c.split('-').map(Number); return { x, y }; };
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const cells = []; for (let y = 0; y < P.grid; y++) for (let x = 0; x < P.grid; x++) cells.push(`${x}-${y}`);

  function init(config) {
    return { id: config.actor_id, role: config.role, mode: config.mode || 'hive', peers: config.peers || [],
      tick: 0, pos: null, searched: {}, tasks: {}, rescued: {}, claims: {}, current: null, intents: {}, cached: null, view: null };
  }
  function score(pos, task, path, tick, params = P) {
    const eta = dist(pos, parse(task.cell)) / params.speed.team;
    const age = Math.max(0, tick - (task.created_tick || 0));
    return params.weights.w1 * task.urgency * Math.exp(-(age + eta) / params.tau_ticks) - params.weights.w2 * eta - params.weights.w3 * path.length;
  }
  function perceive(s, { tick, sense }) {
    s.tick = tick; s.pos = sense.pos;
    for (const c of sense.footprint) s.searched[c] = true;
    for (const d of sense.detections) {
      const id = `T-${d.survivor_id}`;
      if (!s.tasks[id]) s.tasks[id] = { id, survivor_id: d.survivor_id, cell: d.cell, people: d.people, urgency: d.urgency, created_tick: tick };
    }
    return s;
  }
  const bid = (s) => s;
  const open = (s) => Object.values(s.tasks).filter((t) => !s.rescued[t.survivor_id]);
  function act(s, { hq } = {}) {
    const actions = [];
    if (s.role === 'drone') {
      const next = cells.filter((c) => !s.searched[c]).sort((a, b) => dist(s.pos, parse(a)) - dist(s.pos, parse(b)) || (a < b ? -1 : 1))[(s.id.charCodeAt(6) || 0) % 3] || cells[0];
      actions.push({ kind: 'move', target: parse(next), task_id: null, key: `${s.id}:${s.tick}:move` });
      s.current = { action: 'searching', target: parse(next) };
    } else {
      let task = null;
      if (s.mode !== 'hive') {
        if (hq) { s.cached = hq.assignment || null; if (hq.task && !s.tasks[hq.task.id]) s.tasks[hq.task.id] = { ...hq.task, created_tick: s.tick }; }
        else if (s.mode === 'central-naive') s.cached = null;
        task = s.cached && s.tasks[s.cached] && !s.rescued[s.tasks[s.cached].survivor_id] ? s.tasks[s.cached] : null;
      } else {
        // Greedy: best-scoring open task that no lower-id peer has claimed.
        task = open(s).filter((t) => !s.claims[t.id] || s.claims[t.id] >= s.id).sort((a, b) => score(s.pos, b, [], s.tick) - score(s.pos, a, [], s.tick) || (a.id < b.id ? -1 : 1))[0] || null;
      }
      if (task) {
        s.claims[task.id] = s.id;
        const t = parse(task.cell);
        if (dist(s.pos, t) === 0) { const key = `${s.id}:${task.id}:rescue`; s.intents[key] = task.survivor_id; actions.push({ kind: 'rescue', survivor_id: task.survivor_id, key }); s.current = { action: 'rescuing', target: t }; }
        else { actions.push({ kind: 'move', target: t, task_id: task.id, key: `${s.id}:${s.tick}:move` }); s.current = { action: 'travelling', target: t }; }
      } else s.current = { action: 'idle', target: null };
    }
    return { state: view(s), actions };
  }
  function applyReceipts(s, receipts) {
    for (const r of receipts) if (r.kind === 'rescue') { const sid = s.intents[r.key]; if (sid) { s.rescued[sid] = true; delete s.intents[r.key]; } }
    return view(s);
  }
  function hqRequest(s) {
    return { actor: s.id, role: s.role, tick: s.tick, pos: s.pos, detections: open(s).map((t) => ({ task_id: t.id, survivor_id: t.survivor_id, cell: t.cell, urgency: t.urgency, people: t.people })), done: Object.keys(s.rescued) };
  }
  function gossip(s) {
    if (s.mode !== 'hive') return { state: s, messages: [] };
    const body = { from: s.id, tasks: s.tasks, searched: Object.keys(s.searched), rescued: Object.keys(s.rescued), claims: s.claims };
    return { state: s, messages: s.peers.map((to) => ({ to, body })) };
  }
  function merge(s, b) {
    for (const [id, t] of Object.entries(b.tasks || {})) if (!s.tasks[id]) s.tasks[id] = t;
    for (const c of b.searched || []) s.searched[c] = true;
    for (const r of b.rescued || []) s.rescued[r] = true;
    for (const [t, who] of Object.entries(b.claims || {})) if (!s.claims[t] || who < s.claims[t]) s.claims[t] = who;
    return view(s);
  }
  const interpret = (s) => s;
  function sharedDigest(s) {
    const str = JSON.stringify([Object.keys(s.tasks).sort(), Object.keys(s.searched).sort(), Object.keys(s.rescued).sort()]);
    let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function view(s) {
    s.view = { actor_id: s.id, role: s.role, tick: s.tick, pos: s.pos, action: s.current?.action || 'idle', target: s.current?.target || null,
      bundle: [], owners: s.claims, known_tasks: Object.keys(s.tasks).length, provisional: 0, digest: sharedDigest(s), vv: {} };
    return s;
  }
  return { STUB: true, PARAMS: P, init, perceive, bid, act, applyReceipts, hqRequest, gossip, merge, interpret, score, sharedDigest };
})();
module.exports = HiveStub;
