// Gate 4.2: central baselines. Run once per mode, after restarting the stores in that mode:
//   MODE=central-naive  docker compose up -d && MODE=central-naive  node tests/e2e/central.mjs
//   MODE=central-strong docker compose up -d && MODE=central-strong node tests/e2e/central.mjs
import { loadLib, check, done, fact } from './common.mjs';

const mode = process.env.MODE;
if (!['central-naive', 'central-strong'].includes(mode)) { console.error('set MODE=central-naive or MODE=central-strong'); process.exit(2); }
const l = await loadLib();
const teams = (v) => v.filter((x) => x.role === 'team');

await l.reset(5);
await l.start();
await l.waitTicks(40);
const wrong = (await l.actors()).filter((x) => x.mode && x.mode !== mode);
if (wrong.length) { console.error(`stores are not in ${mode}: run MODE=${mode} docker compose up -d first`); process.exit(2); }

// Cut every link to HQ.
const links = await l.links();
for (const a of Object.keys(links.allowed)) {
  if (a === 'hq') continue;
  links.allowed[a].hq = false;
  if (links.allowed.hq) links.allowed.hq[a] = false;
}
await l.setLinks({ allowed: links.allowed });
const cutTick = (await l.world()).tick;
const busy = teams(await l.actors()).filter((t) => t.action === 'travelling' || t.action === 'rescuing').map((t) => t.actor_id);

await l.waitTicks(2);
const atCut = Object.fromEntries(teams(await l.actors()).map((t) => [t.actor_id, JSON.stringify(t.pos)]));
await l.waitTicks(20);
const later = teams(await l.actors());

if (mode === 'central-naive') {
  const moved = later.filter((t) => JSON.stringify(t.pos) !== atCut[t.actor_id]).map((t) => t.actor_id);
  check(`naive: teams stop moving within 2 ticks of the HQ cut (tick ${cutTick})`, fact(moved.length === 0, `still moving: ${moved}`));
} else {
  const after = later.flatMap((x) => x.rescues || []).filter((r) => r.tick > cutTick);
  const unfinished = busy.filter((b) => !after.some((r) => r.by === b));
  check('strong: teams that were busy at the cut finish that task', fact(unfinished.length === 0, `busy at cut but no rescue after: ${unfinished}`));
  const notIdle = later.filter((t) => t.action !== 'idle').map((t) => `${t.actor_id}: ${t.action}`);
  check('strong: and then go idle', fact(notIdle.length === 0, notIdle.join(', ')));
}
done(`central (${mode})`);
