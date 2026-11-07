// Pure checks over snapshots of the live system. Each takes plain data (actor views,
// proxy log entries, metrics) and returns { ok, problems[] , ...details }, so the same
// code is unit-tested against the in-memory 7-actor system (core/test) and then used by
// the live e2e scripts. No I/O here.

export const ISLANDS = [['drone-1', 'drone-2', 'team-1'], ['drone-3', 'team-2'], ['drone-4', 'team-3']];
export const islandOf = (a, islands = ISLANDS) => islands.findIndex((g) => g.includes(a));
const result = (problems, extra = {}) => ({ ok: problems.length === 0, problems, ...extra });

// One agreed allocation: equal digests, every task has at most one holder, the holder
// matches the agreed owner, and no team holds more than bundleMax tasks.
export function agreement(views, { bundleMax = 3 } = {}) {
  const problems = [];
  const digests = [...new Set(views.map((v) => v.digest))];
  if (digests.length !== 1) problems.push(`digests differ: ${views.map((v) => `${v.actor_id}=${v.digest}`).join(' ')}`);
  const owners = views[0]?.owners || {};
  const held = {};
  for (const v of views.filter((x) => x.role === 'team')) {
    if (v.bundle.length > bundleMax) problems.push(`${v.actor_id} holds ${v.bundle.length} tasks (max ${bundleMax})`);
    for (const t of v.bundle) {
      if (held[t]) problems.push(`${t} held by both ${held[t]} and ${v.actor_id}`);
      held[t] = v.actor_id;
      if (t in owners && owners[t] !== v.actor_id) problems.push(`${t} in ${v.actor_id}'s bundle but agreed owner is ${owners[t]}`);
    }
  }
  return result(problems, { digests, pending: Object.keys(owners).length });
}

// Every rescue record across all views (deduplicated by survivor).
export function rescues(views) {
  const all = {};
  for (const v of views) for (const r of v.rescues || []) all[r.survivor_id] ||= r;
  return Object.values(all);
}

// Hour-8 check 1: a drone found someone and a team rescued them.
export function droneFoundTeamRescued(views) {
  const hit = rescues(views).find((r) => r.found_by?.startsWith('drone') && r.by?.startsWith('team'));
  return result(hit ? [] : ['no survivor that a drone found and a team rescued'], { example: hit });
}

// Island progress during a blackout: rescues by tick window, attributed by rescuer's island.
export function islandProgress(views, fromTick, toTick, islands = ISLANDS) {
  const per = islands.map(() => 0);
  for (const r of rescues(views)) if (r.tick > fromTick && r.tick <= toTick) { const i = islandOf(r.by, islands); if (i >= 0) per[i] += 1; }
  const problems = per.map((n, i) => (n === 0 ? `island ${i + 1} {${islands[i].join(', ')}} rescued nobody` : null)).filter(Boolean);
  return result(problems, { perIsland: per });
}

// Zero cross-island deliveries in the proxy log (entries with status "delivered").
export function noCrossIsland(logEntries, islands = ISLANDS) {
  const bad = logEntries.filter((e) => e.status === 'delivered' && islandOf(e.from, islands) >= 0 && islandOf(e.to, islands) >= 0 && islandOf(e.from, islands) !== islandOf(e.to, islands));
  return result(bad.length ? [`${bad.length} cross-island deliveries, e.g. ${bad[0].from} → ${bad[0].to}`] : [], { crossDelivered: bad.length });
}

// A cut actor keeps emitting but nobody else learns: others' vv for it doesn't advance.
export function isolated(viewsBefore, viewsAfter, actor) {
  const problems = [];
  const before = Object.fromEntries(viewsBefore.map((v) => [v.actor_id, v]));
  const after = Object.fromEntries(viewsAfter.map((v) => [v.actor_id, v]));
  if (!((after[actor]?.seq ?? 0) > (before[actor]?.seq ?? 0))) problems.push(`${actor} emitted no new events while cut`);
  for (const [id, v] of Object.entries(after)) {
    if (id === actor) continue;
    const was = before[id]?.vv?.[actor] ?? 0, now = v.vv?.[actor] ?? 0;
    if (now > was) problems.push(`${id} learned ${actor}'s events ${was} → ${now} through a cut link`);
  }
  return result(problems);
}

// No lost updates: every store reports conflicts: 0 (views carry conflicts from /health).
export function noConflicts(views) {
  const bad = views.filter((v) => (v.conflicts ?? 0) !== 0);
  return result(bad.map((v) => `${v.actor_id}: ${v.conflicts} conflicts`));
}

// Event IDs stay unique across a restart: an actor's own seq never goes backwards and the
// version vectors everyone holds for it never exceed what it has emitted.
export function seqMonotonic(viewsBefore, viewsAfter) {
  const problems = [];
  const after = Object.fromEntries(viewsAfter.map((v) => [v.actor_id, v]));
  for (const b of viewsBefore) {
    const a = after[b.actor_id];
    if (a && a.seq < b.seq) problems.push(`${b.actor_id} seq went back ${b.seq} → ${a.seq}: event IDs would repeat`);
  }
  for (const v of viewsAfter) for (const [origin, n] of Object.entries(v.vv || {})) {
    if (after[origin] && n > after[origin].seq) problems.push(`${v.actor_id} has ${origin}:${n} but ${origin} is only at seq ${after[origin].seq}`);
  }
  return result(problems);
}

// Rescue count agrees between the world's metrics and the actors (after convergence).
export function rescueCountsAgree(views, metrics) {
  const n = rescues(views).length;
  const problems = [];
  if (metrics && typeof metrics.rescued === 'number' && metrics.rescued !== n) problems.push(`metrics.rescued=${metrics.rescued} but actors know ${n}`);
  if (metrics && (metrics.duplicate_rescues ?? 0) !== 0) problems.push(`metrics.duplicate_rescues=${metrics.duplicate_rescues}`);
  return result(problems, { known: n });
}
