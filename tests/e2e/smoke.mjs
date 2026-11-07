// Phase 2 workflow smoke test (live): seed 1, 10 ticks → every store at tick >= 9, 0 conflicts.
//   node tests/e2e/smoke.mjs
import { loadLib, check, done, fact, K } from './common.mjs';

const l = await loadLib();
await l.reset(1);
await l.start();
await l.waitTicks(10);
await l.pause();
const v = await l.actors();
const behind = v.filter((x) => !(x.tick >= 9));
check('every actor processed ticks (view.tick >= 9)', fact(behind.length === 0, behind.map((x) => `${x.actor_id} at ${x.tick}`).join(', ')));
check('no lost updates (conflicts: 0)', K.noConflicts(v));
done('smoke');
