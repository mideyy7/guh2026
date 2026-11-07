import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOne, loadCore, PARAMS } from '../run.mjs';
import { islandOf } from '../../world/links.mjs';

// These tests prove the HARNESS, using the stub core. They say nothing about HIVE's quality.
const stub = loadCore(new URL('../stub-core.cjs', import.meta.url).pathname);

test('deterministic: same options → identical result', () => {
  const o = { mode: 'hive', topology: 'blackout-3', seed: 4, core: stub };
  assert.deepEqual(runOne(o), runOne(o));
  assert.notDeepEqual(runOne(o).score, runOne({ ...o, seed: 5 }).score);
});

test('results are labelled when the stub core is used', () => {
  assert.match(runOne({ mode: 'hive', seed: 1, ticks: 10, core: stub }).core, /STUB/);
});

test('loadCore rejects a core that does not implement contract C6', () => {
  const dir = mkdtempSync(join(tmpdir(), 'core-'));
  const bad = join(dir, 'bad.cjs');
  writeFileSync(bad, 'module.exports = { init(){}, perceive(){} };');
  assert.throws(() => loadCore(bad), /missing bid\(\)/);
});

test('blackout-3: no message is ever delivered across islands; cross-island sends are refused', () => {
  const cross = [];
  const r = runOne({ mode: 'hive', topology: 'blackout-3', seed: 2, core: stub, onDeliver: (t, from, to) => { if (islandOf(PARAMS, from) !== islandOf(PARAMS, to)) cross.push([t, from, to]); } });
  assert.deepEqual(cross, []);
  assert.ok(r.messages.refused > 0 && r.messages.delivered > 0);
});

test('central-naive idles the moment HQ is lost; central-strong finishes its cached task', () => {
  const teams = PARAMS.actors.teams;
  // Cut HQ at a moment when some team is mid-journey on an assignment (found from an uncut run).
  let cutAt = null;
  runOne({ mode: 'central-strong', topology: 'all-up', seed: 3, ticks: 120, core: stub,
    onTick: (t, world, state) => { if (cutAt === null && t >= 20 && teams.some((id) => state[id].view.action === 'travelling')) cutAt = t + 1; } });
  assert.ok(cutAt, 'found a tick with a travelling team');
  const traces = {};
  for (const mode of ['central-naive', 'central-strong']) {
    const pos = {};
    runOne({ mode, topology: 'all-up', seed: 3, ticks: 120, core: stub, schedule: [{ at: cutAt, preset: 'blackout-3' }],
      onTick: (t, world) => { if (t >= cutAt) for (const id of teams) (pos[id] ||= []).push(JSON.stringify(world.sense(id).pos)); } });
    traces[mode] = pos;
  }
  for (const id of teams) {
    const moves = traces['central-naive'][id].slice(1).filter((p, i) => p !== traces['central-naive'][id][i]).length;
    assert.equal(moves, 0, `naive ${id} must not move after HQ is cut (moved ${moves} times)`);
  }
  const strongMoves = teams.reduce((n, id) => n + traces['central-strong'][id].slice(1).filter((p, i) => p !== traces['central-strong'][id][i]).length, 0);
  assert.ok(strongMoves > 0, 'strong teams keep working on cached assignments');
});

test('central modes send no gossip; hive sends no HQ reports', () => {
  const c = runOne({ mode: 'central-strong', topology: 'all-up', seed: 1, ticks: 30, core: stub });
  assert.equal(c.messages.attempted, 0); assert.ok(c.messages.hq_ok > 0);
  const h = runOne({ mode: 'hive', topology: 'all-up', seed: 1, ticks: 30, core: stub });
  assert.equal(h.messages.hq_ok + h.messages.hq_refused, 0); assert.ok(h.messages.attempted > 0);
});

test('percent 0: no peer or HQ links at all', () => {
  const r = runOne({ mode: 'hive', topology: 'percent', percent: 0, seed: 1, ticks: 20, core: stub });
  assert.equal(r.messages.delivered, 0);
  assert.equal(r.messages.refused, r.messages.attempted);
});

test('speed: a full 240-tick, 7-actor run takes well under 5 s', () => {
  const t0 = performance.now();
  runOne({ mode: 'hive', topology: 'flapping', seed: 1, core: stub });
  assert.ok(performance.now() - t0 < 5000);
});
