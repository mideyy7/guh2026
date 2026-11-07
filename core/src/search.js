// Drone search: pick the next cell to look at. Survivors appear over time, so a cell is
// worth re-searching once it hasn't been seen for `research_ticks`. Drones prefer:
//   never-seen / stale cells, nearby cells, cells near unconfirmed distress texts,
//   their own quadrant (so drones starting together fan out),
// and avoid cells a peer drone was last heard heading to.
// Plain JS, no imports (uses HiveScore from the same bundle).
const HiveSearch = (() => {
  const NEVER = 200;          // staleness credited to a never-seen cell
  const W = { dist: 4, provisional: 30, peer: 25, sector: 15 };

  function sectorOf(actorId) {
    const n = parseInt(String(actorId).split('-').pop(), 10);
    return Number.isFinite(n) ? (n - 1) % 4 : 0;
  }
  function inSector(c, sector, grid) {
    const h = grid / 2;
    const qx = c.x < h ? 0 : 1, qy = c.y < h ? 0 : 1;
    return qy * 2 + qx === sector;
  }

  // s: actor state (needs tick, pos, last_seen, tasks, resolved, hints, config, search_target)
  // Returns a cell id, or null when everything has been seen recently.
  function nextTarget(s, P) {
    const { cellXY, cellId, dist } = HiveScore;
    const tick = s.tick, pos = s.pos, grid = P.grid;
    const staleness = (c) => (s.last_seen[c] === undefined ? NEVER : Math.min(tick - s.last_seen[c], NEVER - 1));
    const due = (c) => staleness(c) >= P.research_ticks;

    // Stick with the current target while it's still due and we're not on it: no dithering.
    if (s.search_target && due(s.search_target) && s.search_target !== cellId(pos)) return s.search_target;

    const provisional = Object.values(s.tasks)
      .filter((t) => t.provisional && !s.resolved[t.task_id])
      .map((t) => cellXY(t.cell));
    const peers = Object.entries(s.hints || {})
      .filter(([id, h]) => id.startsWith('drone') && h && tick - (h.at ?? -1e9) <= 10)
      .map(([, h]) => h.heading || h.pos).filter(Boolean)
      .map((p) => (typeof p === 'string' ? cellXY(p) : p));
    const sector = sectorOf(s.config.actor_id);

    let best = null, bestV = -Infinity;
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      const id = `${x}-${y}`;
      if (!due(id)) continue;
      const c = { x, y };
      let v = staleness(id) - W.dist * dist(pos, c);
      if (provisional.some((p) => dist(p, c) <= 2)) v += W.provisional;
      if (peers.some((p) => dist(p, c) <= 2)) v -= W.peer;
      if (inSector(c, sector, grid)) v += W.sector;
      if (v > bestV) { best = id; bestV = v; }   // scan order breaks ties deterministically
    }
    return best;
  }

  return { nextTarget, sectorOf };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HiveSearch;
