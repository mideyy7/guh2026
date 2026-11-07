// Gate 3, the hour-14 checkpoint: the full live 7-actor system, blackout and reconnection.
// Seed 2: all links up for 30 ticks → blackout-3 for 50 ticks → all-up, then pause.
//   node tests/e2e/checkpoint14.mjs
import { loadLib, check, done, fact, waitConverged, K } from './common.mjs';

const l = await loadLib();
await l.reset(2);
await l.preset('all-up');
await l.start();
await l.waitTicks(30);

const t0 = (await l.world()).tick;
const logFrom = (await l.log(0)).at(-1)?.n ?? 0;
await l.preset('blackout-3');
await l.waitTicks(50);
const t1 = (await l.world()).tick;
const during = await l.log(logFrom);
await l.preset('all-up');
const conv = await waitConverged(l, { timeoutMs: 40_000 });
const v = conv.views;

check('1. every island completes a rescue during the blackout', K.islandProgress(v, t0, t1));
check('   zero cross-island deliveries during the blackout', K.noCrossIsland(during));
check(`2. all 7 digests equal within 10 gossip intervals (${(conv.ms / 1000).toFixed(1)} s)`, fact(conv.ok, 'timed out after 40 s'));
check('3. one owner per pending task, no team holds more than 3', K.agreement(v));
const m = await l.metrics();
console.log(`INFO  4. duplicated work: duplicate_rescues=${m.duplicate_rescues ?? '?'}, wasted travel=${JSON.stringify(m.wasted_travel ?? '?')}`);
check('5. conflicts: 0 everywhere', K.noConflicts(v));
done('checkpoint14');
