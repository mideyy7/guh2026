// HiveCore: the actor brain (contract C6). Deterministic functions over a JSON state object.
// The caller (n8n Code node, unit test or headless benchmark) does all I/O and passes the
// time in as nowMs. Each function TAKES OWNERSHIP of the state passed in: it may modify it
// and returns the new state. (Deep-copying a 300 KB state on every call was 90% of run time.)
// Callers that need the old state keep their own copy. Events are immutable once created.
// Plain JS, no imports: uses HiveEvents, HiveCBBA, HiveScore, HiveDigest, HiveSearch,
// HIVE_PARAMS and HIVE_GAZETTEER from the same bundle.
const HiveCore = (() => {
  const E = HiveEvents, S = HiveScore, C = HiveCBBA;
  const P = HIVE_PARAMS;

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
      absent: {},               // survivor_id -> true: my own sensor saw the cell empty (local only)
      last_seen: {},            // cell -> last tick any actor searched it
      peer_vv: {},              // peer -> the version vector it last told us
      last_heard: {},           // peer -> ms
      hints: {},                // peer -> {pos, heading, at}
      dirty: false,             // something changed that may change the allocation
      intents: {},              // key -> rescue action written before acting; cleared by its receipt
      cbba: C.emptyAgent(config.actor_id),   // {id, bundle, y, z, s}: drones keep tables too, to relay
      my_commit: null,          // task this team COMMITTED to: irreversible, held outside CBBA
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
      for (const c of d.cells || [d.cell]) if (!(s.last_seen[c] >= ev.tick)) s.last_seen[c] = ev.tick;
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
  // isGone adds what this actor saw with its own sensor: a known survivor missing from a cell
  // it is looking at was rescued by someone it hasn't heard from yet. Local only (not an event,
  // not in the digest): the rescuer's RESCUED event makes it consistent everywhere later.
  function isGone(s, t) { return isDone(s, t) || (!t.provisional && !!s.absent[t.survivor_id]); }

  // ---------- perceive ----------
  function perceive(state, input, nowMs) {
    const s = state;
    const { tick, sense } = input;
    s.tick = tick;
    s.pos = sense.pos;
    const cells = (sense.footprint || []).filter((c) => s.last_seen[c] === undefined || tick - s.last_seen[c] >= P.research_ticks);
    if (cells.length) emit(s, 'CELL_SEARCHED', { cells: cells.sort() });   // one event per tick, not per cell
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
    const seen = new Set((sense.detections || []).map((d) => d.survivor_id));
    const fp = new Set(sense.footprint || []);
    for (const t of openTasks(s)) if (fp.has(t.cell) && !seen.has(t.survivor_id) && !s.absent[t.survivor_id]) { s.absent[t.survivor_id] = true; s.dirty = true; }
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

  // ---------- bid: CBBA bundle phase (teams only, only when something changed) ----------
  function bid(state, nowMs) {
    const s = state;
    if (s.config.role !== 'team' || s.config.mode !== 'hive' || !s.dirty) { s.dirty = false; return refresh(s); }
    const a = s.cbba;
    if (s.my_commit && (!s.tasks[s.my_commit] || isGone(s, s.tasks[s.my_commit]))) s.my_commit = null;
    prune(s);
    // Candidates: confirmed, not done, nobody committed. Provisional tasks wait for a sensor.
    const cands = openTasks(s).filter((t) => !s.committed[t.task_id] && !isGone(s, t)).map((t) => t.task_id).sort();
    const head = s.my_commit ? [s.tasks[s.my_commit]] : [];
    const marginal = (_id, tid, bundle) => S.score(s.pos, s.tasks[tid], head.concat(bundle.map((b) => s.tasks[b])), s.tick, P);
    C.buildBundle(a, cands, marginal, P.bundle_max - head.length);   // bid warping is built in
    s.dirty = false;
    return refresh(s);
  }

  // ---------- act ----------
  function act(state, ctx, nowMs) {
    const s = state;
    const me = s.config.actor_id;
    const actions = Object.values(s.intents).map((a) => ({ ...a }));      // restart recovery: same key
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
      teamAct(s, actions, move);
    }
    return { state: refresh(s), actions };
  }
  // Drop finished tasks and committed tasks from the CBBA bundle. A COMMITTED task leaves
  // CBBA for good: its owner is the committer (from replicated events), not a bid.
  function prune(s) {
    s.cbba.bundle = s.cbba.bundle.filter((tid) => s.tasks[tid] && !isGone(s, s.tasks[tid]) && !s.committed[tid] && tid !== s.my_commit);
  }
  function committer(s, tid) { const c = Object.keys(s.committed[tid] || {}).sort(); return c.length ? c[0] : null; }

  // Teams in hive mode: work through the CBBA bundle. On arrival (within commit_radius)
  // emit COMMITTED, which is irreversible, then rescue with a stable key.
  function teamAct(s, actions, move) {
    let t = s.my_commit && s.tasks[s.my_commit] && !isGone(s, s.tasks[s.my_commit]) ? s.tasks[s.my_commit] : null;
    if (!t) {
      s.my_commit = null;
      const tid = s.cbba.bundle.find((x) => s.tasks[x] && !isGone(s, s.tasks[x]));
      t = tid ? s.tasks[tid] : null;
    }
    if (!t) return;
    if (!s.my_commit && S.dist(s.pos, S.cellXY(t.cell)) <= P.commit_radius) {
      emit(s, 'COMMITTED', { task_id: t.task_id });
      s.my_commit = t.task_id;
      s.cbba.bundle = s.cbba.bundle.filter((x) => x !== t.task_id);
    }
    goRescue(s, t, actions, move);
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
    const s = state;
    for (const { action, response } of receipts || []) {
      if (!action || action.kind !== 'rescue') continue;
      if (!response || !response.result) continue;          // call failed: keep the intent, retry next tick
      const { task_id, survivor_id, key } = action;
      if (response.result === 'rescued') emit(s, 'RESCUED', { task_id, survivor_id });
      else emit(s, 'ATTEMPT', { task_id, survivor_id, result: response.result });
      delete s.intents[key];
      if (s.my_commit === task_id) s.my_commit = null;
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
    const s = state;
    if (s.config.mode !== 'hive') return { state: s, messages: [] };
    const open = openTasks(s).filter((t) => !s.committed[t.task_id]).map((t) => t.task_id);
    const y = {}, z = {};
    for (const t of open) { if (s.cbba.y[t] !== undefined) y[t] = s.cbba.y[t]; if (s.cbba.z[t] != null) z[t] = s.cbba.z[t]; }
    const base = {
      from: s.config.actor_id, sent_at: nowMs, vv: { ...s.log.vv },
      cbba: { y, z, s: { ...s.cbba.s } },          // only unfinished tasks: done ones don't ping-pong
      hint: { pos: s.pos, heading: s.target },
    };
    const messages = s.config.peers.map((to) => ({
      to,
      body: { ...base, events: E.missingFor(s.log, s.peer_vv[to] || {}, P.gossip_event_cap) },
    }));
    return { state: s, messages };
  }

  function merge(state, body, nowMs) {
    const s = state;
    if (!body || !body.from || body.from === s.config.actor_id) return s;
    const from = body.from;
    for (const ev of E.receive(s.log, body.events || [])) applyEvent(s, ev);
    const pv = (s.peer_vv[from] ||= {});
    for (const [o, n] of Object.entries(body.vv || {})) if (!(pv[o] >= n)) pv[o] = n;
    s.last_heard[from] = Math.max(s.last_heard[from] || 0, body.sent_at || nowMs);
    if (body.hint) s.hints[from] = { pos: body.hint.pos ?? null, heading: body.hint.heading ?? null, at: s.tick };
    // CBBA consensus. Drones run it too (they never bid) so allocations relay through them.
    if (body.cbba && s.config.mode === 'hive') {
      const ids = openTasks(s).filter((t) => !s.committed[t.task_id]).map((t) => t.task_id).sort();
      const k = { id: from, y: body.cbba.y || {}, z: body.cbba.z || {}, s: body.cbba.s || {} };
      if (C.receive(s.cbba, k, nowMs, ids)) s.dirty = true;
    }
    prune(s);
    return refresh(s);
  }

  // ---------- view + digest ----------
  function owners(s) {
    const o = {};
    for (const t of openTasks(s)) o[t.task_id] = committer(s, t.task_id) ?? s.cbba.z[t.task_id] ?? null;
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
      bundle: (s.my_commit ? [s.my_commit] : []).concat(s.cbba.bundle.filter((x) => x !== s.my_commit)),
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
    _internal: { isDone, isGone, openTasks },
  };
})();
