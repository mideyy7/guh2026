// The live e2e checks (tests/e2e/checks.mjs) run here against the in-memory 7-actor system,
// so each check is proven to pass on a good run and to fail on a broken one before the
// live stack exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as K from '../../tests/e2e/checks.mjs';

const require = createRequire(import.meta.url);
const { makeRun, allUp, islandsOf, ISLANDS, ACTORS } = require('./helpers/sim.js');
const views = (run) => ACTORS.map((a) => JSON.parse(JSON.stringify({ ...run.state[a].view, conflicts: 0 })));

test('checks pass on a healthy run: blackout → restore → agreement, island progress, provenance', () => {
  const run = makeRun({ seed: 2 });
  for (let t = 0; t < 30; t++) run.tick(allUp());
  for (let t = 0; t < 50; t++) run.tick(islandsOf(ISLANDS));
  for (let k = 0; k < 10 && new Set(run.digests()).size > 1; k++) run.pausedRounds(1, allUp());
  const v = views(run);
  assert.deepEqual(K.agreement(v).problems, []);
  assert.deepEqual(K.droneFoundTeamRescued(v).problems, []);
  const prog = K.islandProgress(v, 30, 80);
  assert.deepEqual(prog.problems, [], JSON.stringify(prog.perIsland));
  assert.deepEqual(K.noConflicts(v).problems, []);
  assert.deepEqual(K.rescueCountsAgree(v, { rescued: Object.keys(run.world.rescued).length, duplicate_rescues: run.world.duplicate_rescues }).problems, []);
});

test('checks fail on broken data', () => {
  const run = makeRun({ seed: 2 });
  for (let t = 0; t < 30; t++) run.tick(islandsOf(ISLANDS));     // partitioned, not reconnected
  const v = views(run);
  assert.equal(K.agreement(v).ok, false, 'digests differ while partitioned');
  const doubled = v.map((x) => ({ ...x }));
  const t1 = doubled.find((x) => x.actor_id === 'team-1'), t2 = doubled.find((x) => x.actor_id === 'team-2');
  t2.bundle = [...t2.bundle, 'T-shared']; t1.bundle = [...t1.bundle, 'T-shared'];
  assert.ok(K.agreement(doubled).problems.some((p) => p.includes('held by both')));
  t1.bundle = ['a', 'b', 'c', 'd'];
  assert.ok(K.agreement(doubled).problems.some((p) => p.includes('holds 4')));
  assert.equal(K.noConflicts([{ actor_id: 'x', conflicts: 2 }]).ok, false);
  assert.equal(K.noCrossIsland([{ from: 'drone-1', to: 'team-2', status: 'delivered' }]).ok, false);
  assert.equal(K.noCrossIsland([{ from: 'drone-1', to: 'team-2', status: 'refused' }, { from: 'drone-1', to: 'team-1', status: 'delivered' }]).ok, true);
  assert.equal(K.rescueCountsAgree(v, { rescued: 99, duplicate_rescues: 0 }).ok, false);
});

test('isolated(): a cut actor keeps emitting, nobody learns; seqMonotonic catches repeated IDs', () => {
  const run = makeRun({ seed: 5 });
  for (let t = 0; t < 10; t++) run.tick(allUp());
  const before = views(run);
  const cut = (a, b) => a !== 'drone-1' && b !== 'drone-1';
  for (let t = 0; t < 10; t++) run.tick(cut);
  const after = views(run);
  assert.deepEqual(K.isolated(before, after, 'drone-1').problems, []);
  for (let t = 0; t < 4; t++) run.tick(allUp());
  assert.equal(K.isolated(before, views(run), 'drone-1').ok, false, 'once reconnected, others learn');
  assert.deepEqual(K.seqMonotonic(before, after).problems, []);
  const reset = after.map((x) => (x.actor_id === 'team-1' ? { ...x, seq: 0 } : x));
  assert.equal(K.seqMonotonic(before, reset).ok, false);
});
