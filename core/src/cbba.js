// CBBA (Choi, Brunet & How 2009): bundle phase + the receiver decision table (Table 1).
// Pure functions over plain objects. No imports, so it can be pasted into an n8n Code node.
const HiveCBBA = (() => {
  // agent state: { id, bundle: [taskId], y: {task: bid}, z: {task: winnerId|null}, s: {agentId: time} }
  function emptyAgent(id) { return { id, bundle: [], y: {}, z: {}, s: {} }; }

  // Strict total order on (bid, winner): higher bid wins, ties go to the lower id.
  function beats(y1, z1, y2, z2) {
    if (z2 == null) return y1 > 0 || z1 != null;
    if (z1 == null) return false;
    return y1 > y2 || (y1 === y2 && z1 < z2);
  }

  // Bundle phase. marginal(agentId, taskId, bundle) -> score of appending task to bundle.
  // Bid warping: a bid can never exceed the previous bid in the bundle, which keeps
  // CBBA's diminishing-marginal-gain assumption true even for travel-based scores.
  function buildBundle(a, tasks, marginal, maxLen) {
    while (a.bundle.length < maxLen) {
      const cap = a.bundle.length ? a.y[a.bundle[a.bundle.length - 1]] : Infinity;
      let best = null, bestC = 0;
      for (const t of tasks) {
        if (a.bundle.includes(t)) continue;
        const c = Math.min(marginal(a.id, t, a.bundle), cap);
        if (c <= 0) continue;
        if (!beats(c, a.id, a.y[t] || 0, a.z[t] ?? null)) continue; // would not outbid current winner
        if (best === null || c > bestC || (c === bestC && t < best)) { best = t; bestC = c; }
      }
      if (best === null) break;
      a.bundle.push(best); a.y[best] = bestC; a.z[best] = a.id;
    }
  }

  // Receiver i processes a message from sender k: { id, y, z, s } (a snapshot of k's tables).
  // Implements the CBBA decision table. Returns true if anything changed.
  function receive(i, k, now, tasks) {
    const I = i.id, K = k.id;
    const sI = (m) => i.s[m] || 0, sK = (m) => (m === K ? now : k.s[m] || 0);
    let changed = false;
    const update = (t) => { if (i.y[t] !== k.y[t] || i.z[t] !== k.z[t]) changed = true; i.y[t] = k.y[t] || 0; i.z[t] = k.z[t] ?? null; };
    const reset = (t) => { if (i.z[t] != null) changed = true; i.y[t] = 0; i.z[t] = null; };
    for (const t of tasks) {
      const zk = k.z[t] ?? null, zi = i.z[t] ?? null, yk = k.y[t] || 0, yi = i.y[t] || 0;
      const kBeatsI = beats(yk, zk, yi, zi);
      if (zk === K) {
        if (zi === I) { if (kBeatsI) update(t); }
        else if (zi === K) update(t);
        else if (zi == null) update(t);
        else { const m = zi; if (sK(m) > sI(m) || kBeatsI) update(t); }
      } else if (zk === I) {
        if (zi === I) { /* leave */ }
        else if (zi === K) reset(t);
        else if (zi == null) { /* leave */ }
        else { const m = zi; if (sK(m) > sI(m)) reset(t); }
      } else if (zk != null) { // zk = m, a third agent
        const m = zk;
        if (zi === I) { if (sK(m) > sI(m) && kBeatsI) update(t); }
        else if (zi === K) { if (sK(m) > sI(m)) update(t); else reset(t); }
        else if (zi === m) { if (sK(m) > sI(m)) update(t); }
        else if (zi == null) { if (sK(m) > sI(m)) update(t); }
        else { // zi = n, a fourth agent
          const n = zi;
          if (sK(m) > sI(m) && sK(n) > sI(n)) update(t);
          else if (sK(m) > sI(m) && kBeatsI) update(t);
          else if (sK(n) > sI(n) && sI(m) > sK(m)) reset(t);
        }
      } else { // zk == null
        if (zi === I) { /* leave */ }
        else if (zi === K) update(t);
        else if (zi == null) { /* leave */ }
        else { const m = zi; if (sK(m) > sI(m)) update(t); }
      }
    }
    // Timestamps: direct contact with k now; relayed info about everyone else.
    i.s[K] = now;
    for (const [m, tm] of Object.entries(k.s)) if (m !== I && tm > sI(m)) i.s[m] = tm;
    // Bundle release: from the first task I no longer win, drop it and everything after.
    const lost = i.bundle.findIndex((t) => i.z[t] !== I);
    if (lost >= 0) {
      for (const t of i.bundle.slice(lost + 1)) if (i.z[t] === I) { i.y[t] = 0; i.z[t] = null; }
      i.bundle = i.bundle.slice(0, lost);
      changed = true;
    }
    return changed;
  }

  function snapshot(a) { return JSON.parse(JSON.stringify({ id: a.id, y: a.y, z: a.z, s: a.s })); }
  return { emptyAgent, buildBundle, receive, snapshot, beats };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HiveCBBA;
