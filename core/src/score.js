// Geometry + task scoring. Shared by the actors (CBBA marginal gains) and by HQ (central
// baselines), so both judge a task with the same function and the benchmark is fair.
// Plain JS, no imports.
const HiveScore = (() => {
  const cellXY = (c) => { const i = c.indexOf('-'); return { x: +c.slice(0, i), y: +c.slice(i + 1) }; };
  const cellId = (p) => `${p.x}-${p.y}`;
  // Chebyshev distance: diagonal moves are allowed.
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const toXY = (p) => (typeof p === 'string' ? cellXY(p) : p);

  // Ticks for a team to travel from pos through every task in `path`, then to `task`.
  function eta(pos, path, task, params) {
    let at = toXY(pos), cells = 0;
    for (const t of path) { const q = cellXY(t.cell); cells += dist(at, q); at = q; }
    cells += dist(at, cellXY(task.cell));
    return cells / params.speed.team;
  }

  // score = w1·urgency·exp(−(age+eta)/τ) − w2·eta − w3·|path|
  //   pos   actor position {x,y} (or "x-y")
  //   task  {cell, urgency, created_tick}
  //   path  tasks already in the bundle before this one (travel goes through them first)
  //   tick  current tick; age = tick − created_tick
  function score(pos, task, path, tick, params) {
    const P = params;
    const p = path || [];
    const e = eta(pos, p, task, P);
    const age = Math.max(0, tick - (task.created_tick ?? tick));
    const { w1, w2, w3 } = P.weights;
    return w1 * task.urgency * Math.exp(-(age + e) / P.tau_ticks) - w2 * e - w3 * p.length;
  }

  // One step from `from` toward `to` (Chebyshev). Used by tests' mini world only.
  function step(from, to) {
    return { x: from.x + Math.sign(to.x - from.x), y: from.y + Math.sign(to.y - from.y) };
  }

  return { cellXY, cellId, dist, eta, score, step };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HiveScore;
