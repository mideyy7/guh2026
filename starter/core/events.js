// Event log + version vectors + grow-only sets. Plain JS, no imports, so the same file
// can be pasted into an n8n Code node and require()'d by Node tests and the headless sim.
const HiveEvents = (() => {
  function emptyLog() {
    return { seq: 0, vv: {}, pending: {}, events: {}, searched: {}, rescued: {} };
  }

  // Create an event originating at this actor. Returns the event; mutates log.
  function emit(log, actorId, type, data, tick) {
    log.seq += 1;
    const ev = { id: `${actorId}:${log.seq}`, origin: actorId, seq: log.seq, type, data, tick };
    applyOne(log, ev);
    log.vv[actorId] = log.seq;
    return ev;
  }

  // Effects of an event on the replicated sets. Idempotent by construction (sets).
  function applyOne(log, ev) {
    log.events[ev.id] = ev;
    if (ev.type === 'CELL_SEARCHED') log.searched[ev.data.cell] = true;
    if (ev.type === 'RESCUED') log.rescued[ev.data.survivorId] = true;
  }

  // Receive events from a peer in any order, possibly duplicated.
  // vv[origin] only ever advances over a contiguous prefix; gaps wait in `pending`.
  // Returns the list of events newly applied (in apply order).
  function receive(log, incoming) {
    const applied = [];
    for (const ev of incoming) {
      const have = log.vv[ev.origin] || 0;
      if (ev.seq <= have) continue;                       // duplicate: already applied
      (log.pending[ev.origin] ||= {})[ev.seq] = ev;       // buffer (dedupes by seq)
    }
    for (const origin of Object.keys(log.pending)) {
      const buf = log.pending[origin];
      let next = (log.vv[origin] || 0) + 1;
      while (buf[next]) {
        applyOne(log, buf[next]); applied.push(buf[next]);
        delete buf[next]; log.vv[origin] = next; next += 1;
      }
      if (Object.keys(buf).length === 0) delete log.pending[origin];
    }
    return applied;
  }

  // Anti-entropy: events a peer is missing, given the last version vector it told us.
  // Only applied (contiguous) events are ever sent, in seq order per origin, capped.
  function missingFor(log, peerVV, limit = 200) {
    const out = [];
    for (const ev of Object.values(log.events)) {
      if (ev.seq > (peerVV[ev.origin] || 0)) out.push(ev);
    }
    out.sort((a, b) => (a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : a.seq - b.seq));
    return out.slice(0, limit);
  }

  return { emptyLog, emit, receive, missingFor };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HiveEvents;
