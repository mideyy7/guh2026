// Preliminary commit_radius experiment (implementation.md Phase 5) on the TEST mini world,
// tuning seeds 11-20 (kept apart from the reported seeds 1-10). Re-run on Dev A's
// bench/run.mjs once it exists; the real world model can change the numbers.
//   node core/build.mjs && node scripts/experiment-commit-radius.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { H, P, makeRun, allUp, islandsOf, ISLANDS } = require('../core/test/helpers/sim.js');

const topologies = { 'all-up': allUp(), 'blackout-3': islandsOf(ISLANDS) };
const rows = [];
for (const radius of [0, 2]) {
  H.PARAMS.commit_radius = radius;                       // the shared params object the core reads
  for (const [topo, links] of Object.entries(topologies)) {
    let rescued = 0, dup = 0, failed = 0, urgencyLeft = 0;
    for (let seed = 11; seed <= 20; seed++) {
      const run = makeRun({ seed });
      for (let t = 0; t < P.horizon_ticks; t++) run.tick(links);
      rescued += Object.keys(run.world.rescued).length;
      dup += run.world.duplicate_rescues;
      failed += run.world.failed_attempts;
      urgencyLeft += run.world.survivors.filter((s) => !run.world.rescued[s.survivor_id]).reduce((a, s) => a + s.urgency, 0);
    }
    rows.push({ commit_radius: radius, topology: topo, rescued_avg: rescued / 10, duplicate_rescues: dup, failed_attempts: failed, unrescued_urgency_avg: urgencyLeft / 10 });
  }
}
H.PARAMS.commit_radius = 0;
console.table(rows);
