// The 90-second demo (hack.md §8), scripted. The presenter can click the dashboard instead; this is
// the rehearsal tool and the backup. It only uses the dashboard API.
//
//   node tests/e2e/demo.mjs            # run the demo timeline live
//   node tests/e2e/demo.mjs --dry      # print the timeline without touching the stack
//   DEMO_SEED=3 node tests/e2e/demo.mjs
import * as hive from './lib.mjs';

const SEED = Number(process.env.DEMO_SEED || 1);
const STORY = { cell: '3-0', people: 3, urgency: 5, text: 'stuck on roof w/ 2 kids near the Irwell, water rising' };
const TIMELINE = [
  { at: 0, say: 'Seven independent n8n instances. No server tells them what to do.', run: async () => { await hive.reset(SEED); await hive.preset('all-up'); await hive.start(); } },
  { at: 15, say: 'A distress text arrives. It only gets through when a drone is in range.', run: () => hive.inject(STORY) },
  { at: 25, say: 'SIMULATE NETWORK BLACKOUT: three islands, no HQ.', run: () => hive.preset('blackout-3') },
  { at: 60, say: 'Restore links. Gossip floods back; conflicts resolve.', run: () => hive.preset('all-up') },
  { at: 62, say: 'Pause new incidents and time the convergence.', run: () => hive.pause() },
];

if (process.argv.includes('--dry')) {
  for (const s of TIMELINE) console.log(`${String(s.at).padStart(3)} s  ${s.say}`);
  console.log('then: wait for convergence (budget 10 gossip intervals), print the measured results');
  process.exit(0);
}

const t0 = Date.now();
const at = (s) => hive.sleep(Math.max(0, t0 + s * 1000 - Date.now()));
for (const step of TIMELINE) {
  await at(step.at);
  await step.run();
  const st = await hive.status();
  console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)} s · tick ${st.tick}] ${step.say}`);
}
const views = Object.values(await hive.views());
if (views.every((v) => !v)) {
  console.log('\nNo actor state yet: the n8n workflows are not running. This was an infrastructure-only rehearsal.');
} else {
  const c = await hive.waitConverged({ budgetMs: 40000 });
  console.log(c.converged ? `\nShared views converged ${(c.ms / 1000).toFixed(1)} s after restore.` : `\nNOT converged within 40 s. Diverged: ${(c.diverged || []).join(', ')}`);
}
const m = await hive.metrics();
console.log(`Rescued ${m.rescued}, mission score ${m.score.toFixed(1)}, duplicate attempts ${m.duplicate_attempts}, wasted travel ${m.wasted_travel_total}, texts still sending ${m.distress.waiting}.`);
