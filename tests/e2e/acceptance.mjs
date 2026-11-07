// Gate 5: the full acceptance suite (hack.md §6.6 / implementation.md Phase 5), live.
// Every check must pass TWICE IN A ROW, so the suite runs itself twice.
//   node tests/e2e/acceptance.mjs                 # both rounds
//   ROUNDS=1 CONFLICT_SEED=7 node tests/e2e/acceptance.mjs
// CONFLICT_SEED: a seed where two islands commit to the same survivor during blackout-3.
// Find one headless (bench/run.mjs, Dev A) and set it here; the default is a guess.
import { execSync } from 'node:child_process';
import { loadLib, check, done, fact, waitConverged, failuresSoFar, K } from './common.mjs';

const l = await loadLib();
const ROUNDS = Number(process.env.ROUNDS || 2);
const CONFLICT_SEED = Number(process.env.CONFLICT_SEED || 7);
const sh = (cmd) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });

async function connectedAgreement() {
  await l.reset(3); await l.preset('all-up'); await l.start(); await l.waitTicks(60);
  const c = await waitConverged(l);
  check('connected agreement: seed 3, 60 ticks → one owner per task, <= 3 each, digests equal',
    c.ok ? K.agreement(c.views) : fact(false, 'digests never matched'));
}

async function islandsAndReconnect() {
  await l.reset(2); await l.preset('all-up'); await l.start(); await l.waitTicks(20);
  const t0 = (await l.world()).tick;
  const from = (await l.log(0)).at(-1)?.n ?? 0;
  await l.preset('blackout-3'); await l.waitTicks(50);
  const t1 = (await l.world()).tick;
  const during = await l.log(from);
  await l.preset('all-up');
  const c = await waitConverged(l, { timeoutMs: 40_000 });
  check('3-island progress: every island rescues at least once', K.islandProgress(c.views, t0, t1));
  check('3-island progress: zero cross-island deliveries', K.noCrossIsland(during));
  check(`reconnection: digests equal within 10 gossip intervals (${(c.ms / 1000).toFixed(1)} s)`, fact(c.ok, 'timed out after 40 s'));
  if (c.ok) check('reconnection: one agreed allocation', K.agreement(c.views));
}

async function duplicateAndReordered() {
  const runSeed = async (chaos) => {
    await l.reset(8); await l.preset('all-up');
    if (chaos) await l.setLinks({ duplicate_rate: 0.5, reorder: true });
    await l.start(); await l.waitTicks(60);
    await l.setLinks({ duplicate_rate: 0, reorder: false });
    const c = await waitConverged(l);
    return { c, m: await l.metrics() };
  };
  const clean = await runSeed(false);
  const noisy = await runSeed(true);
  const diff = Math.abs((noisy.m.rescued ?? 0) - (clean.m.rescued ?? 0));
  check(`duplicate + reordered gossip: rescues within ±1 of a clean run (${noisy.m.rescued} vs ${clean.m.rescued})`, fact(diff <= 1, `differ by ${diff}`));
  check('duplicate + reordered gossip: no duplicate rescues', fact((noisy.m.duplicate_rescues ?? 0) === 0, `duplicate_rescues=${noisy.m.duplicate_rescues}`));
  check('duplicate + reordered gossip: converges', fact(noisy.c.ok, 'did not converge'));
}

async function conflictingCommitments() {
  await l.reset(CONFLICT_SEED); await l.preset('all-up'); await l.start(); await l.waitTicks(10);
  await l.preset('blackout-3'); await l.waitTicks(60);
  await l.preset('all-up');
  const c = await waitConverged(l);
  const m = await l.metrics();
  const rescuedTwice = K.rescues(c.views).length !== new Set(K.rescues(c.views).map((r) => r.survivor_id)).size;
  check('conflicting commitments: no survivor rescued twice', fact(!rescuedTwice && (m.duplicate_rescues ?? 0) === 0, `duplicate_rescues=${m.duplicate_rescues}`));
  const attempts = Math.max(0, ...c.views.map((v) => v.attempts ?? 0));
  check(`conflicting commitments: duplicated work is reported (failed attempts=${attempts}, wasted travel=${JSON.stringify(m.wasted_travel ?? '?')})`,
    fact(attempts > 0 || (m.wasted_travel && Object.values(m.wasted_travel).some((x) => x > 0)), `no duplicated work seen with seed ${CONFLICT_SEED}: pick a seed where islands collide (CONFLICT_SEED)`));
}

async function actorRestart() {
  for (const svc of ['n8n-team-1', 'store-team-1']) {
    await l.reset(6); await l.preset('all-up'); await l.start(); await l.waitTicks(25);
    const before = await l.actors();
    sh(`docker compose restart ${svc}`);
    const tick0 = (await l.world()).tick;
    let resumed = false;
    for (let i = 0; i < 20 && !resumed; i++) {
      await l.waitTicks(1);
      const t1 = (await l.actors()).find((v) => v.actor_id === 'team-1');
      resumed = t1 && !t1.stale && t1.tick >= (await l.world()).tick - 1;
    }
    const resumedAt = (await l.world()).tick - tick0;
    await l.waitTicks(15);
    const c = await waitConverged(l);
    check(`actor restart (${svc}): event IDs stay unique (no repeated origin:seq)`, K.seqMonotonic(before, c.views));
    check(`actor restart (${svc}): no survivor rescued twice`, fact(((await l.metrics()).duplicate_rescues ?? 0) === 0, 'duplicate rescue after restart'));
    check(`actor restart (${svc}): resumes within 3 ticks of being healthy (took ${resumedAt})`, fact(resumed, 'team-1 never caught up'));
  }
}

function isolation() {
  try { sh('bash scripts/check-isolation.sh'); check('network isolation: scripts/check-isolation.sh exits 0', fact(true, '')); }
  catch (e) { check('network isolation: scripts/check-isolation.sh exits 0', fact(false, (e.stdout || e.message).slice(-500))); }
}

for (let round = 1; round <= ROUNDS; round++) {
  console.log(`\n=== acceptance round ${round}/${ROUNDS} ===`);
  const failedBefore = failuresSoFar();
  await connectedAgreement();
  await islandsAndReconnect();
  await duplicateAndReordered();
  await conflictingCommitments();
  await actorRestart();
  isolation();
  check('no lost updates: conflicts 0 on every store after the whole suite', K.noConflicts(await l.actors()));
  if (failuresSoFar() > failedBefore) break;          // "twice in a row": stop at the first failing round
}
done('acceptance');
