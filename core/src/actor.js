// HiveCore: the actor brain (contract C6). Pure functions over a JSON state object.
// The caller (n8n Code node, unit test or headless benchmark) does all I/O and passes the
// time in as nowMs. Every function works on a copy of the state and returns the new one.
// Plain JS, no imports: uses HiveEvents, HiveCBBA, HiveScore, HiveDigest, HiveSearch,
// HIVE_PARAMS and HIVE_GAZETTEER from the same bundle.
const HiveCore = (() => {
  const E = HiveEvents, S = HiveScore;
  const P = HIVE_PARAMS;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------- state ----------
  function init(config, nowMs) {
    const s = {
      config: { actor_id: config.actor_id, role: config.role, mode: config.mode || 'hive', peers: (config.peers || []).slice() },
      tick: -1,
      pos: null,
      log: E.emptyLog(),        // replicated event log (version vector, searched, rescued)
      tasks: {},                // task_id -> {task_id, survivor_id, cell, people, urgency, provisional, source, created_tick}
      resolved: {},             // provisional task_id -> confirming task_id
      committed: {},            // task_id -> {actor_id: true}
      gone: {},                 // survivor_id -> true once rescued or a rescue attempt failed
      last_seen: {},            // cell -> last tick any actor searched it
      peer_vv: {},              // peer -> the version vector it last told us
      last_heard: {},           // peer -> ms
      hints: {},                // peer -> {pos, heading, at}
      dirty: false,             // something changed that may change the allocation
      intents: {},              // key -> rescue action written before acting; cleared by its receipt
      search_target: null,
      action: 'idle',
      target: null,
      last_detections: [],
      started_ms: nowMs,
    };
    return refresh(s);
  }

  // ---------- events ----------
  function applyEvent(s, ev) {
    const d = ev.data || {};
    if (ev.type === 'TASK_CREATED') {
      const cur = s.tasks[d.task_id];
      if (!cur) {
        s.tasks[d.task_id] = {
          task_id: d.task_id, survivor_id: d.survivor_id ?? null, cell: d.cell, people: d.people ?? null,
          urgency: d.urgency, provisional: !!d.provisional, source: d.source, created_tick: ev.tick,
        };
      } else if (ev.tick < cur.created_tick) cur.created_tick = ev.tick;   // order-independent
      if (d.resolves) s.resolved[d.resolves] = d.task_id;
      s.dirty = true;
    } else if (ev.type === 'CELL_SEARCHED') {
      if (!(s.last_seen[d.cell] >= ev.tick)) s.last_seen[d.cell] = ev.tick;
    } else if (ev.type === 'COMMITTED') {
      (s.committed[d.task_id] ||= {})[ev.origin] = true;
      s.dirty = true;
    } else if (ev.type === 'ATTEMPT' || ev.type === 'RESCUED') {
      if (d.survivor_id) s.gone[d.survivor_id] = true;
      s.dirty = true;
    }
  }
  function emit(s, type, data) {
    const ev = E.emit(s.log, s.config.actor_id, type, data, Math.max(0, s.tick));
    applyEvent(s, ev);
    return ev;
  }

  // A task is finished when its survivor is gone (confirmed) or a sensor confirmed it (provisional).
  function isDone(s, t) { return t.provisional ? !!s.resolved[t.task_id] : !!s.gone[t.survivor_id]; }
  function openTasks(s) { return Object.values(s.tasks).filter((t) => !t.provisional && !isDone(s, t)); }

  // ---------- perceive ----------
  function perceive(state, input, nowMs) {
    const s = clone(state);
    const { tick, sense } = input;
    s.tick = tick;
    s.pos = sense.pos;
    for (const cell of sense.footprint || []) {
      const seen = s.last_seen[cell];
      if (seen === undefined || tick - seen >= P.research_ticks) emit(s, 'CELL_SEARCHED', { cell });
    }
    for (const d of sense.detections || []) {
      if (s.gone[d.survivor_id]) continue;
      const task_id = `T-${d.survivor_id}`;
      const resolves = nearestProvisional(s, d.cell);
      if (!s.tasks[task_id] || resolves) {
        const data = { task_id, survivor_id: d.survivor_id, cell: d.cell, people: d.people, urgency: d.urgency, provisional: false, source: 'sensor' };
        if (resolves) data.resolves = resolves;
        emit(s, 'TASK_CREATED', data);
      }
    }
    s.last_detections = (sense.detections || []).map((d) => ({ ...d }));
    return refresh(s);
  }
  function nearestProvisional(s, cell) {
    const c = S.cellXY(cell);
    let best = null, bestD = Infinity;
    for (const t of Object.values(s.tasks)) {
      if (!t.provisional || s.resolved[t.task_id]) continue;
      const dd = S.dist(c, S.cellXY(t.cell));
      if (dd <= 2 && (dd < bestD || (dd === bestD && t.task_id < best))) { best = t.task_id; bestD = dd; }
    }
    return best;
  }

  // ---------- bid (Phase 3: CBBA) ----------
  function bid(state, nowMs) {
    const s = clone(state);
    s.dirty = false;
    return refresh(s);
  }

  // ---------- act ----------
  function act(state, ctx, nowMs) {
    const s = clone(state);
    const me = s.config.actor_id;
    const actions = Object.values(s.intents).map((a) => ({ ...a }));   // restart recovery: same key
    const move = (cell, task_id) => {
      const a = { kind: 'move', target: S.cellXY(cell), key: `${me}:${s.tick}:move` };
      if (task_id) a.task_id = task_id;
      actions.push(a);
    };
    s.action = 'idle'; s.target = null;

    if (s.config.role === 'drone') {
      const cell = HiveSearch.nextTarget(s, P);
      s.search_target = cell;
      if (cell) { s.action = 'searching'; s.target = S.cellXY(cell); if (cell !== S.cellId(s.pos)) move(cell); }
    } else {
      // Phase 1 placeholder: greedy, nearest open task.
      const t = openTasks(s).sort((a, b) => S.dist(s.pos, S.cellXY(a.cell)) - S.dist(s.pos, S.cellXY(b.cell)) || (a.task_id < b.task_id ? -1 : 1))[0];
      if (t) goRescue(s, t, actions, move);
    }
    return { state: refresh(s), actions };
  }
  function goRescue(s, t, actions, move) {
    const me = s.config.actor_id;
    s.target = S.cellXY(t.cell);
    if (S.cellId(s.pos) === t.cell) {
      s.action = 'rescuing';
      const key = `${me}:${t.task_id}:rescue`;
      if (!s.intents[key]) {
        const a = { kind: 'rescue', survivor_id: t.survivor_id, task_id: t.task_id, key };
        s.intents[key] = a;
        actions.push({ ...a });
      }
    } else {
      s.action = 'travelling';
      move(t.cell, t.task_id);
    }
  }

  // ---------- receipts ----------
  // receipts: [{action, response}], response = the simulator's JSON (null if the call failed)
  function applyReceipts(state, receipts, nowMs) {
    const s = clone(state);
    for (const { action, response } of receipts || []) {
      if (!action || action.kind !== 'rescue') continue;
      if (!response || !response.result) continue;          // call failed: keep the intent, retry next tick
      const { task_id, survivor_id, key } = action;
      if (response.result === 'rescued') emit(s, 'RESCUED', { task_id, survivor_id });
      else emit(s, 'ATTEMPT', { task_id, survivor_id, result: response.result });
      delete s.intents[key];
    }
    return refresh(s);
  }

  // ---------- central modes (Phase 4) ----------
  // The report a team or drone sends to HQ each tick; null in hive mode (HQ isn't used).
  function hqRequest(s) {
    if (s.config.mode === 'hive') return null;
    return { actor: s.config.actor_id, role: s.config.role, tick: s.tick, pos: s.pos,
      detections: s.last_detections || [], done: [] };
  }

  // ---------- gossip / merge ----------
  function gossip(state, nowMs) {
    const s = clone(state);
    if (s.config.mode !== 'hive') return { state: s, messages: [] };
    const base = {
      from: s.config.actor_id, sent_at: nowMs, vv: { ...s.log.vv },
      hint: { pos: s.pos, heading: s.target },
    };
    const messages = s.config.peers.map((to) => ({
      to,
      body: { ...base, events: E.missingFor(s.log, s.peer_vv[to] || {}, P.gossip_event_cap) },
    }));
    return { state: s, messages };
  }

  function merge(state, body, nowMs) {
    const s = clone(state);
    if (!body || !body.from || body.from === s.config.actor_id) return s;
    const from = body.from;
    for (const ev of E.receive(s.log, body.events || [])) applyEvent(s, ev);
    const pv = (s.peer_vv[from] ||= {});
    for (const [o, n] of Object.entries(body.vv || {})) if (!(pv[o] >= n)) pv[o] = n;
    s.last_heard[from] = Math.max(s.last_heard[from] || 0, body.sent_at || nowMs);
    if (body.hint) s.hints[from] = { pos: body.hint.pos ?? null, heading: body.hint.heading ?? null, at: s.tick };
    return refresh(s);
  }

  // ---------- view + digest ----------
  function owners(s) {
    const o = {};
    for (const t of openTasks(s)) o[t.task_id] = null;
    return o;
  }
  function sharedDigest(s) {
    return HiveDigest.digest({
      vv: s.log.vv,
      searched: Object.keys(s.log.searched).sort(),
      rescued: Object.keys(s.log.rescued).sort(),
      owners: owners(s),
    });
  }
  function refresh(s) {
    s.view = {
      actor_id: s.config.actor_id, role: s.config.role, tick: s.tick, pos: s.pos,
      action: s.action, target: s.target,
      bundle: [],
      owners: owners(s),
      known_tasks: Object.keys(s.tasks).length,
      digest: sharedDigest(s),
      vv: { ...s.log.vv },
      provisional: Object.values(s.tasks).filter((t) => t.provisional && !s.resolved[t.task_id]).length,
    };
    return s;
  }

  return {
    init, perceive, bid, act, applyReceipts, hqRequest, gossip, merge, sharedDigest,
    score: (pos, task, path, tick, params) => S.score(pos, task, path, tick, params || P),
    PARAMS: P,
    GAZETTEER: HIVE_GAZETTEER,
    _internal: { isDone, openTasks },
  };
})();
