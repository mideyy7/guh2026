// Gate 2, the hour-8 checkpoint (implementation.md Phase 2). Seed 1, all links up.
//   node tests/e2e/checkpoint8.mjs
import { loadLib, check, done, fact, waitConverged, cutActor, K } from './common.mjs';

const l = await loadLib();
await l.reset(1);
await l.preset('all-up');
await l.start();
await l.waitTicks(60);

const v = await l.actors();
check('1. a drone detection reaches a team, and the team rescues the survivor', K.droneFoundTeamRescued(v));
check('   metrics.rescued >= 1', fact((await l.metrics()).rescued >= 1, 'no rescues in 60 ticks'));

const before = await l.actors();
await cutActor(l, 'drone-1');
await l.waitTicks(10);
check('2. a cut link stops sync: drone-1 keeps emitting, nobody else learns', K.isolated(before, await l.actors(), 'drone-1'));

await l.preset('all-up');
await l.setLinks({ duplicate_rate: 1 });
await l.waitTicks(20);
await l.setLinks({ duplicate_rate: 0 });
const conv = await waitConverged(l);
check('3. replay is harmless: converges, 0 duplicate rescues, rescue counts agree',
  conv.ok ? K.rescueCountsAgree(conv.views, await l.metrics()) : fact(false, 'did not converge in 40 s'));
check('4. every store reports conflicts: 0', K.noConflicts(await l.actors()));
done('checkpoint8');
