// Gate 4.1: inject 5 distress texts live → 5 provisional tasks appear within 3 ticks of
// delivery, and at least 4 are later confirmed by a drone's sensor.
//   node tests/e2e/ai.mjs
import { readFileSync } from 'node:fs';
import { loadLib, check, done, fact } from './common.mjs';

const fx = JSON.parse(readFileSync(new URL('../ai/fixtures.json', import.meta.url), 'utf8'));
const G = JSON.parse(readFileSync(new URL('../../contracts/gazetteer.json', import.meta.url), 'utf8')).districts;
const l = await loadLib();
const best = (v, k) => Math.max(0, ...v.map((x) => x[k] ?? 0));   // the best-informed actor

await l.reset(4);
await l.preset('all-up');
await l.start();
await l.waitTicks(3);
for (const f of fx.generated.slice(0, 5)) await l.distress({ text: f.text, cell: G[f.district].landmark.cell });

// Delivery waits until a drone is within distress_radius, so allow a little longer than 3 ticks overall.
let seen = 0, ticks = 0;
while (seen < 5 && ticks < 15) { await l.waitTicks(1); ticks += 1; seen = best(await l.actors(), 'text_tasks'); }
check(`5 provisional tasks appear (after ${ticks} ticks)`, fact(seen >= 5, `only ${seen}/5`));
await l.waitTicks(60);
const conf = best(await l.actors(), 'text_confirmed');
check('at least 4 later confirmed by a drone sensor', fact(conf >= 4, `only ${conf}/5 confirmed`));
done('ai');
