// The central dispatcher used by BOTH central baselines (live HQ service and headless benchmark).
// Pure. It assigns tasks greedily with the SAME score function the HIVE actors use (injected), so
// the comparison is fair: the only difference is who decides, not how tasks are valued.
//
// Report body (from HiveCore.hqRequest): {actor, role, tick, pos:{x,y}, detections:[{task_id, survivor_id, cell, urgency, people}], done:[survivor_id]}
// Response: {assignment: task_id | null, task: {id, survivor_id, cell, urgency, people} | null} for teams;
//           {assignment: null, task: null} for drones. The task details are needed because a team
//           only knows tasks it detected itself; HQ's knowledge comes from every reporter.
export function createHQ(score, params) {
  const st = { tick: 0, teams: {}, tasks: {}, done: new Set() };

  function report(body) {
    const { actor, role, tick, pos, detections = [], done = [] } = body || {};
    if (!actor || !role || !pos) throw Object.assign(new Error('report needs actor, role, pos'), { status: 400 });
    st.tick = Math.max(st.tick, Number(tick) || 0);
    for (const sid of done) st.done.add(sid);
    for (const d of detections) {
      if (!d.task_id || st.done.has(d.survivor_id)) continue;
      st.tasks[d.task_id] ??= { id: d.task_id, survivor_id: d.survivor_id, cell: d.cell, urgency: d.urgency, people: d.people, created_tick: st.tick };
    }
    if (role === 'team') {
      const t = (st.teams[actor] ??= { id: actor, pos, assignment: null });
      t.pos = pos;
      if (t.assignment && st.done.has(st.tasks[t.assignment]?.survivor_id)) t.assignment = null;
      assign();
      const task = t.assignment ? st.tasks[t.assignment] : null;
      return { assignment: t.assignment, task: task && { id: task.id, survivor_id: task.survivor_id, cell: task.cell, urgency: task.urgency, people: task.people } };
    }
    assign();
    return { assignment: null, task: null };
  }

  // Greedy: repeatedly give the highest-scoring (free team, unassigned task) pair. Ties → lower ids.
  function assign() {
    const taken = new Set(Object.values(st.teams).map((t) => t.assignment).filter(Boolean));
    const open = Object.values(st.tasks).filter((x) => !st.done.has(x.survivor_id) && !taken.has(x.id));
    const free = Object.values(st.teams).filter((t) => !t.assignment);
    for (;;) {
      let best = null;
      for (const team of free) {
        if (team.assignment) continue;
        for (const task of open) {
          if (taken.has(task.id)) continue;
          const v = score(team.pos, task, [], st.tick, params);
          if (!best || v > best.v || (v === best.v && (team.id < best.team.id || (team.id === best.team.id && task.id < best.task.id)))) best = { v, team, task };
        }
      }
      if (!best) return;
      best.team.assignment = best.task.id;
      taken.add(best.task.id);
    }
  }

  const snapshot = () => ({ tick: st.tick, teams: st.teams, tasks: Object.values(st.tasks), done: [...st.done] });
  return { report, snapshot };
}
