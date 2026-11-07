import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preset, islands, PRESETS } from '../links.mjs';

const params = JSON.parse(readFileSync(new URL('../../contracts/params.json', import.meta.url), 'utf8'));
const ALL = [...params.actors.drones, ...params.actors.teams];
const sym = (m) => Object.keys(m).every((a) => Object.keys(m[a]).every((b) => m[a][b] === m[b][a]));

test('every preset is symmetric and never links a node to itself', () => {
  for (const name of PRESETS) {
    const m = preset(name, ALL, params, { seed: 3, percent: 50, phase: 1 });
    assert.ok(sym(m), `${name} symmetric`);
    for (const a of Object.keys(m)) assert.equal(m[a][a], undefined);
  }
});

test('all-up: one island of 7 actors, HQ reachable', () => {
  const m = preset('all-up', ALL, params);
  assert.deepEqual(islands(m), [ALL.slice().sort()]);
  assert.ok(ALL.every((a) => m[a].hq));
});

test('blackout-3: exactly the 3 demo islands, every link to HQ cut', () => {
  const m = preset('blackout-3', ALL, params);
  assert.deepEqual(islands(m), [['drone-1', 'drone-2', 'team-1'], ['drone-3', 'team-2'], ['drone-4', 'team-3']]);
  assert.ok(ALL.every((a) => !m[a].hq && !m.hq[a]));
  // The allowed set is exactly the within-island links.
  assert.equal(m['drone-1']['drone-2'], true);
  assert.equal(m['drone-1']['team-2'], false);
});

test('drones-vs-teams: drones in one island, teams in another', () => {
  assert.deepEqual(islands(preset('drones-vs-teams', ALL, params)), [params.actors.drones, params.actors.teams]);
});

test('isolate-one: team-1 alone with no HQ; everyone else connected with HQ', () => {
  const m = preset('isolate-one', ALL, params);
  const isl = islands(m);
  assert.ok(isl.some((i) => i.length === 1 && i[0] === 'team-1'));
  assert.equal(m['team-1'].hq, false);
  assert.equal(m['team-2'].hq, true);
});

test('flapping: even phase = blackout-3, odd phase = everyone connected; HQ always down', () => {
  assert.equal(islands(preset('flapping', ALL, params, { phase: 0 })).length, 3);
  assert.equal(islands(preset('flapping', ALL, params, { phase: 1 })).length, 1);
  assert.ok(ALL.every((a) => !preset('flapping', ALL, params, { phase: 1 })[a].hq));
});

test('percent: 100 → all up, 0 → all down, same seed → same links, ~p on average', () => {
  const up = (m) => Object.values(m).reduce((s, r) => s + Object.values(r).filter(Boolean).length, 0);
  const n = ALL.length + 1;
  assert.equal(up(preset('percent', ALL, params, { percent: 100, seed: 1 })), n * (n - 1));
  assert.equal(up(preset('percent', ALL, params, { percent: 0, seed: 1 })), 0);
  assert.deepEqual(preset('percent', ALL, params, { percent: 50, seed: 9 }), preset('percent', ALL, params, { percent: 50, seed: 9 }));
  let total = 0;
  for (let s = 1; s <= 400; s++) total += up(preset('percent', ALL, params, { percent: 50, seed: s }));
  const frac = total / (400 * n * (n - 1));
  assert.ok(frac > 0.45 && frac < 0.55, `average up fraction ${frac}`);
});

test('presets work on the 4-actor dev stack', () => {
  const dev = ['drone-1', 'drone-2', 'team-1', 'team-2'];
  const m = preset('blackout-3', dev, params);
  assert.deepEqual(islands(m), [['drone-1', 'drone-2', 'team-1'], ['team-2']]);
});

test('unknown preset is rejected', () => {
  assert.throws(() => preset('nope', ALL, params), /unknown preset/);
});
