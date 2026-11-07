// The world: ground truth and physics. It never tells an actor what to do (hack.md §4 rule 4).
// Pure and deterministic: no I/O, no clock, no Math.random. The sim service and the headless
// benchmark both drive it through the same methods.
import { makeScenario } from './scenario.mjs';
import { cellId, parseCell, dist, samePos, stepToward, cellsWithin } from './grid.mjs';

export function createWorld(seed, params, actorIds) {
  const sc = makeScenario(seed, params, actorIds);
  const G = params.grid;
  const actors = {};
  for (const a of sc.actors) {
    // cmd: the target commanded for the NEXT step only (contract C2). target: last commanded target, for display.
    actors[a.id] = { id: a.id, role: a.role, pos: parseCell(a.start), cmd: null, target: null, task_id: null, progress: 0, travel: {} };
  }
  const survivors = Object.fromEntries(sc.survivors.map((s) => [s.id, { ...s, pos: parseCell(s.cell) }]));
  const st = {
    tick: 0,
    rescued: {},          // survivor_id → {by, tick}
    receipts: {},         // key → rescue response (idempotency)
    moveKeys: new Set(),  // move keys already accepted
    attempts: [],         // every rescue call: {actor, survivor_id, result, tick}
    distress: sc.distress.map((m) => ({ ...m, delivered_to: null, delivered_tick: null })),
  };
  const ids = Object.keys(actors).sort();

  const isVisible = (s) => s.appear_tick <= st.tick && !st.rescued[s.id];

  function requireActor(id) {
    const a = actors[id];
    if (!a) throw Object.assign(new Error(`unknown actor ${id}`), { status: 404 });
    return a;
  }

  // Advance one tick: apply each actor's commanded target at its speed, in actor-ID order. A command
  // lasts one step: an actor that sends no move this tick holds position. A team's fractional
  // progress carries over only while it keeps commanding the same target.
  // Returns the distress messages delivered this tick: [{to, msg_id, text, sent_tick, delivered_tick}].
  function step() {
    st.tick += 1;
    for (const id of ids) {
      const a = actors[id];
      const cmd = a.cmd; a.cmd = null;
      if (!cmd) { a.progress = 0; continue; }
      a.progress += params.speed[a.role];
      while (a.progress >= 1 && !samePos(a.pos, cmd)) {
        a.pos = stepToward(a.pos, cmd);
        a.progress -= 1;
        if (a.task_id) a.travel[a.task_id] = (a.travel[a.task_id] || 0) + 1;
      }
      if (samePos(a.pos, cmd)) { a.target = null; a.progress = 0; }
    }
    return deliverDistress();
  }

  // A text reaches the nearest drone within distress_radius (ties → lower id). Until then it
  // stays "Sending…" and is retried every tick.
  function deliverDistress() {
    const out = [];
    for (const m of st.distress) {
      if (m.delivered_to || m.sent_tick > st.tick || st.rescued[m.survivor_id]) continue;
      const from = parseCell(m.cell);
      let best = null;
      for (const id of ids) {
        const a = actors[id];
        if (a.role !== 'drone') continue;
        const d = dist(a.pos, from);
        if (d <= params.distress_radius && (!best || d < best.d)) best = { id, d };
      }
      if (!best) continue;
      m.delivered_to = best.id; m.delivered_tick = st.tick;
      out.push({ to: best.id, msg_id: m.msg_id, text: m.text, sent_tick: m.sent_tick, delivered_tick: st.tick });
    }
    return out;
  }

  // C2 /sense: only this actor's footprint; only appeared, unrescued survivors.
  function sense(id) {
    const a = requireActor(id);
    const footprint = cellsWithin(a.pos, params.sensor_radius[a.role], G);
    const inFp = new Set(footprint);
    const detections = Object.values(survivors)
      .filter((s) => isVisible(s) && inFp.has(s.cell))
      .sort((p, q) => (p.id < q.id ? -1 : 1))
      .map((s) => ({ survivor_id: s.id, cell: s.cell, people: s.people, urgency: s.urgency }));
    return { tick: st.tick, actor: id, pos: { ...a.pos }, footprint, detections };
  }

  // C2 /move: commands a target for the next step only; applied by step() at the actor's speed.
  // Repeated key is ignored.
  function move(id, target, task_id, key) {
    const a = requireActor(id);
    if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y) || target.x < 0 || target.y < 0 || target.x >= G || target.y >= G)
      throw Object.assign(new Error('target must be {x,y} inside the grid'), { status: 400 });
    if (key && st.moveKeys.has(key)) return { ok: true, pos: { ...a.pos }, duplicate: true };
    if (key) st.moveKeys.add(key);
    const changed = !a.target || !samePos(a.target, target);
    if (changed) a.progress = 0;
    a.cmd = samePos(a.pos, target) ? null : { x: target.x, y: target.y };
    a.target = a.cmd;
    a.task_id = task_id ?? null;
    return { ok: true, pos: { ...a.pos } };
  }

  // C2 /rescue: idempotent per key; each survivor is rescued exactly once.
  function rescue(id, survivor_id, key) {
    const a = requireActor(id);
    if (a.role !== 'team') throw Object.assign(new Error('only rescue teams can rescue'), { status: 400 });
    if (key && st.receipts[key]) return st.receipts[key];
    const s = survivors[survivor_id];
    let result;
    if (s && st.rescued[s.id]) result = 'already_rescued';
    else if (!s || s.appear_tick > st.tick || !samePos(a.pos, s.pos)) result = 'not_here';
    else { result = 'rescued'; st.rescued[s.id] = { by: id, tick: st.tick }; }
    const receipt = { result, tick: st.tick };
    st.attempts.push({ actor: id, survivor_id, result, tick: st.tick });
    if (key) st.receipts[key] = receipt;
    return receipt;
  }

  function metrics() {
    let score = 0, unrescued = 0, unrescuedUrgency = 0, notYet = 0;
    for (const s of Object.values(survivors)) {
      const r = st.rescued[s.id];
      if (r) score += s.urgency * Math.exp(-(r.tick - s.appear_tick) / params.tau_ticks);
      else if (s.appear_tick <= st.tick) { unrescued += 1; unrescuedUrgency += s.urgency; }
      else notYet += 1;
    }
    const rescuesBy = {}, wasted = {};
    for (const r of Object.values(st.rescued)) rescuesBy[r.by] = (rescuesBy[r.by] || 0) + 1;
    for (const a of Object.values(actors)) {
      // Travel spent on a task this actor did not end up rescuing is wasted.
      let w = 0;
      for (const [task, steps] of Object.entries(a.travel)) {
        const sid = task.startsWith('T-') ? task.slice(2) : null;
        if (!sid || st.rescued[sid]?.by !== a.id) w += steps;
      }
      wasted[a.id] = w;
    }
    const totalTime = Object.entries(st.rescued).reduce((t, [sid, r]) => t + (r.tick - survivors[sid].appear_tick) * survivors[sid].urgency, 0);
    const urgencySum = Object.keys(st.rescued).reduce((t, sid) => t + survivors[sid].urgency, 0);
    return {
      tick: st.tick,
      score: Math.round(score * 1000) / 1000,
      rescued: Object.keys(st.rescued).length,
      unrescued, unrescued_urgency: unrescuedUrgency, not_yet_appeared: notYet,
      urgency_weighted_time_to_rescue: urgencySum ? Math.round((totalTime / urgencySum) * 100) / 100 : null,
      duplicate_attempts: st.attempts.filter((x) => x.result === 'already_rescued').length,
      wasted_travel: wasted, wasted_travel_total: Object.values(wasted).reduce((p, q) => p + q, 0),
      rescues_by: rescuesBy,
      distress: {
        total: st.distress.length,
        sent: st.distress.filter((m) => m.sent_tick <= st.tick).length,
        delivered: st.distress.filter((m) => m.delivered_to).length,
        waiting: st.distress.filter((m) => m.sent_tick <= st.tick && !m.delivered_to && !st.rescued[m.survivor_id]).length,
      },
    };
  }

  // Ground truth for the dashboard ONLY. Actors must never see this.
  function snapshot() {
    return {
      seed: sc.seed, tick: st.tick, grid: G,
      actors: Object.values(actors).map((a) => ({ id: a.id, role: a.role, pos: { ...a.pos }, target: a.target && { ...a.target }, task_id: a.task_id })),
      survivors: Object.values(survivors).map((s) => ({
        id: s.id, cell: s.cell, people: s.people, urgency: s.urgency, district: s.district, appear_tick: s.appear_tick,
        state: st.rescued[s.id] ? 'rescued' : s.appear_tick <= st.tick ? 'waiting' : 'not_yet',
        rescued_by: st.rescued[s.id]?.by ?? null,
      })),
      distress: st.distress.map((m) => ({
        msg_id: m.msg_id, survivor_id: m.survivor_id, cell: m.cell, text: m.text, sent_tick: m.sent_tick,
        state: m.delivered_to ? 'delivered' : m.sent_tick <= st.tick ? (st.rescued[m.survivor_id] ? 'moot' : 'sending') : 'not_yet',
        delivered_to: m.delivered_to, delivered_tick: m.delivered_tick,
      })),
    };
  }

  // Delivery failed (the drone's n8n was unreachable): the phone keeps trying, so the text goes back
  // to "Sending…" and is retried on later ticks.
  function requeueDistress(msg_id) {
    const m = st.distress.find((x) => x.msg_id === msg_id);
    if (m) { m.delivered_to = null; m.delivered_tick = null; }
    return !!m;
  }

  // Canonical state string for determinism tests.
  function hash() {
    return JSON.stringify({ t: st.tick, a: ids.map((i) => [i, actors[i].pos, actors[i].target, actors[i].travel]), r: st.rescued, at: st.attempts });
  }

  return { step, sense, move, rescue, metrics, snapshot, hash, requeueDistress, get tick() { return st.tick; }, actorIds: ids, scenario: sc };
}
