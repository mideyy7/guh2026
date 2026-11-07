import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCsv, TOPOLOGIES } from '../matrix.mjs';
import { renderReport } from '../report.mjs';

const fake = (mode, topology, percent, seed, score, converged = true) => ({
  mode, topology, percent, seed, score, rescued: score / 3, unrescued: 1, unrescued_urgency: 2, urgency_weighted_time_to_rescue: 10,
  duplicate_attempts: 0, wasted_travel: 4, messages: { bytes: 100 }, convergence_rounds: converged ? 2 : null, converged: mode === 'hive' ? converged : null, core: 'STUB (x)',
});

test('summarize: mean, sample sd, min, max per (mode, topology, percent)', () => {
  const s = summarize([fake('hive', 'percent', 50, 1, 10), fake('hive', 'percent', 50, 2, 20), fake('hive', 'percent', 50, 3, 30, false), fake('central-naive', 'percent', 50, 1, 5)]);
  const h = s.find((x) => x.mode === 'hive');
  assert.deepEqual(h.score, { n: 3, mean: 20, sd: 10, min: 10, max: 30 });
  assert.equal(h.converged_fraction, 0.67);
  assert.deepEqual(h.seeds, [1, 2, 3]);
  assert.equal(s.find((x) => x.mode === 'central-naive').converged_fraction, null);
});

test('csv: header + one row per group, no NaN/undefined', () => {
  const csv = toCsv(summarize([fake('hive', 'blackout-3', null, 1, 10), fake('central-strong', 'blackout-3', null, 1, 4)]));
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^mode,topology,percent,runs,score_mean,score_sd/);
  assert.doesNotMatch(csv, /NaN|undefined/);
});

test('report: STUB banner when the stub core was used, none for the real core', () => {
  const summary = summarize(TOPOLOGIES.flatMap((t) => ['hive', 'central-strong', 'central-naive'].map((m) => fake(m, t.topology, t.percent ?? null, 1, 12))));
  const stub = renderReport({ summary, seeds: [1], core: 'STUB (not real HIVE results)', topologies: TOPOLOGIES });
  assert.match(stub, /STUB CORE/);
  const real = renderReport({ summary, seeds: [1, 2], core: 'core/dist/hive-core.js', topologies: TOPOLOGIES });
  assert.doesNotMatch(real, /STUB CORE/);
  assert.match(real, /<title>HIVE Benchmark<\/title>/);
  assert.doesNotMatch(real, /NaN|undefined/);
  assert.equal((real.match(/<svg/g) || []).length, 2, 'line chart + bar chart');
});

test('topologies cover hack.md §7: balanced islands, drones vs teams, isolated actor, flapping, 100/75/50/25/0%', () => {
  assert.deepEqual(TOPOLOGIES.map((t) => t.topology + (t.percent ?? '')), ['blackout-3', 'drones-vs-teams', 'isolate-one', 'flapping', 'percent100', 'percent75', 'percent50', 'percent25', 'percent0']);
});
