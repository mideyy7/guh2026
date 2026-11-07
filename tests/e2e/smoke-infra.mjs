// Infrastructure smoke test (Dev A). Runs against the live stack through the dashboard API.
// Proves the plumbing every later gate depends on, without needing Dev B's workflows:
//   reset, ticking, pause, BLACKOUT islands, click-to-cut, restore, and observer isolation.
//   node tests/e2e/smoke-infra.mjs
import * as hive from './lib.mjs';
import { readFileSync } from 'node:fs';

const params = JSON.parse(readFileSync(new URL('../../contracts/params.json', import.meta.url), 'utf8'));
const check = hive.checker('infra smoke');

await hive.reset(1);
await hive.setTickMs(500);
let s = await hive.status();
check('reset → tick 0, paused', s.tick === 0 && !s.running, `tick ${s.tick}`);
const acts = await hive.actors();
check('every actor store reachable', acts.every((a) => a.reachable), acts.filter((a) => !a.reachable).map((a) => a.actor_id).join(', '));
check('no store conflicts', Object.values(await hive.conflicts()).every((c) => c === 0));

await hive.start();
const t = await hive.waitTicks(3);
check('simulator ticks when started', t >= 3, `tick ${t}`);
await hive.sleep(1200); // tick webhooks are fire-and-forget; give their replies time to be counted
s = await hive.status();
check('every actor receives tick webhooks (attempted)', s.actors.every((a) => (s.tick_failures[a] || 0) + (s.last_tick_ok[a] ? 1 : 0) > 0));
await hive.pause();
const p1 = (await hive.status()).tick; await hive.sleep(1200);
check('pause stops time', (await hive.status()).tick === p1);

const b = await hive.preset('blackout-3');
const want = params.islands['blackout-3'].map((g) => g.filter((a) => s.actors.includes(a))).filter((g) => g.length);
check('BLACKOUT → the 3 demo islands', JSON.stringify(b.islands) === JSON.stringify(want.map((g) => [...g].sort()).sort()), JSON.stringify(b.islands));
check('BLACKOUT cuts every HQ link', s.actors.every((a) => !b.allowed[a].hq));

const before = (await hive.log(0)).length;
for (let i = 0; i < 5; i++) await hive.actors();
check('observing does not create proxy traffic', (await hive.log(0)).length === before);

const tg = await hive.toggle('drone-1', 'drone-2');
check('click-to-cut cuts both directions', !tg.allowed['drone-1']['drone-2'] && !tg.allowed['drone-2']['drone-1']);
const r = await hive.preset('all-up');
check('RESTORE → one island', r.islands.length === 1);

await hive.setTickMs(params.tick_ms);
await hive.reset(1);
check.done();
