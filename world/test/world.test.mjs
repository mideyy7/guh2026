import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld } from '../world.mjs';
import { makeScenario } from '../scenario.mjs';
import { DISTRICTS, districtOf, districtCells, HQ_CELL, GEO, cellToLngLat } from '../gazetteer.mjs';
import { parseCell } from '../grid.mjs';

const params = JSON.parse(readFileSync(new URL('../../contracts/params.json', import.meta.url), 'utf8'));

// A fixed "script" of moves driven by a seeded pattern, to exercise the world deterministically.
function drive(seed) {
  const w = createWorld(seed, params);
  for (let t = 0; t < 240; t++) {
    for (const id of w.actorIds) {
      const tx = (t * 3 + id.length * 5) % params.grid, ty = (t * 7 + id.charCodeAt(id.length - 1)) % params.grid;
      if (t % 4 === 0) w.move(id, { x: tx, y: ty }, `T-s0${t % 9}`, `${id}:${t}:move`);
      if (id.startsWith('team')) for (const d of w.sense(id).detections) w.rescue(id, d.survivor_id, `${id}:${d.survivor_id}:rescue`);
    }
    w.step();
  }
  return w;
}

test('gazetteer: 8 districts tile the 8×8 grid exactly once', () => {
  const cells = DISTRICTS.flatMap(districtCells);
  assert.equal(cells.length, 64);
  assert.equal(new Set(cells).size, 64);
  for (const d of DISTRICTS) assert.equal(districtOf(d.landmark.cell).name, d.name, `${d.name} landmark inside it`);
});

test('scenario: same seed → identical; different seed → different', () => {
  assert.deepEqual(makeScenario(7, params), makeScenario(7, params));
  assert.notDeepEqual(makeScenario(7, params).survivors, makeScenario(8, params).survivors);
});

test('scenario: 30 survivors, a third present at tick 0, all appear by tick 150, valid values', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const sc = makeScenario(seed, params);
    assert.equal(sc.survivors.length, params.survivors);
    assert.equal(sc.survivors.filter((s) => s.appear_tick === 0).length, Math.ceil(params.survivors / 3));
    for (const s of sc.survivors) {
      assert.ok(s.appear_tick >= 0 && s.appear_tick <= params.appear_by_tick);
      assert.ok(s.urgency >= 1 && s.urgency <= 5 && s.people >= 1 && s.people <= 5);
      assert.equal(districtOf(s.cell).name, s.district);
    }
    for (const m of sc.distress) {
      assert.ok(m.text.length > 10 && !m.text.includes('{'), `template filled: ${m.text}`);
      assert.ok(sc.survivors.find((s) => s.id === m.survivor_id));
    }
    assert.ok(sc.distress.length > 0);
  }
});

test('determinism: same seed and inputs → identical world after 240 ticks, 3 runs', () => {
  const h = [drive(5).hash(), drive(5).hash(), drive(5).hash()];
  assert.equal(h[0], h[1]); assert.equal(h[1], h[2]);
  assert.notEqual(drive(5).hash(), drive(6).hash());
});

test('speeds: drone 1 cell/tick, team 1 cell per 2 ticks, stops exactly on target (diagonals allowed)', () => {
  const w = createWorld(1, params);
  const trace = [];
  for (let i = 0; i < 9; i++) {
    // Commands last one tick, so actors re-send each tick (as the n8n Act stage does).
    w.move('drone-1', { x: 7, y: 7 }, null, `k1-${i}`); // from 3-3: 4 diagonal steps
    w.move('team-1', { x: 1, y: 6 }, null, `k2-${i}`);  // from 1-2: 4 steps
    w.step(); trace.push([w.sense('drone-1').pos, w.sense('team-1').pos]);
  }
  assert.deepEqual(trace[0][0], { x: 4, y: 4 });
  assert.deepEqual(trace[3][0], { x: 7, y: 7 });
  assert.deepEqual(trace[8][0], { x: 7, y: 7 }, 'drone stays on target');
  assert.deepEqual(trace[0][1], { x: 1, y: 2 }, 'team has not moved after 1 tick');
  assert.deepEqual(trace[1][1], { x: 1, y: 3 });
  assert.deepEqual(trace[7][1], { x: 1, y: 6 });
  assert.deepEqual(trace[8][1], { x: 1, y: 6 }, 'team stays on target');
});

test('sensing: drone sees a 5×5 block, team a 3×3 block, clipped at the edges', () => {
  const w = createWorld(1, params);
  assert.equal(w.sense('drone-1').footprint.length, 25); // at 3-3
  assert.equal(w.sense('team-1').footprint.length, 9);   // at 1-2
  for (let i = 0; i < 3; i++) { w.move('drone-1', { x: 0, y: 0 }, null, `k${i}`); w.step(); }
  assert.equal(w.sense('drone-1').footprint.length, 9);  // corner: 3×3 survives clipping
});

test('sensing: survivors that have not appeared, or are rescued, are never detected', () => {
  const w = createWorld(3, params);
  const sc = w.scenario;
  const late = sc.survivors.find((s) => s.appear_tick > 5);
  const all = Object.fromEntries(sc.survivors.map((s) => [s.id, s]));
  // Every detection anywhere on the map at tick 0 must have appear_tick 0.
  for (const id of w.actorIds) for (const d of w.sense(id).detections) assert.equal(all[d.survivor_id].appear_tick, 0);
  assert.ok(late);
});

test('rescue: idempotent per key, exactly once per survivor, duplicates measured', () => {
  const w = createWorld(2, params);
  const s = w.scenario.survivors.find((x) => x.appear_tick === 0);
  const p = parseCell(s.cell);
  // Teleport-free: walk team-1 and team-2 there.
  for (let i = 0; i < 20; i++) { w.move('team-1', p, `T-${s.id}`, `a${i}`); w.move('team-2', p, `T-${s.id}`, `b${i}`); w.step(); }
  assert.equal(w.rescue('team-1', s.id, 'team-1:r').result, 'rescued');
  assert.deepEqual(w.rescue('team-1', s.id, 'team-1:r'), w.rescue('team-1', s.id, 'team-1:r'), 'same key → same receipt');
  assert.equal(w.rescue('team-1', s.id, 'team-1:r').result, 'rescued', 'replay does not turn into already_rescued');
  assert.equal(w.rescue('team-2', s.id, 'team-2:r').result, 'already_rescued');
  for (const id of w.actorIds) assert.ok(!w.sense(id).detections.some((d) => d.survivor_id === s.id), `${id} must not detect a rescued survivor`);
  const m = w.metrics();
  assert.equal(m.rescued, 1);
  assert.equal(m.duplicate_attempts, 1);
  assert.equal(m.rescues_by['team-1'], 1);
  assert.ok(m.wasted_travel['team-2'] > 0, 'team-2 travel to a survivor it did not rescue is wasted');
  assert.equal(m.wasted_travel['team-1'], 0);
});

test('rescue: not_here when not on the cell; drones cannot rescue', () => {
  const w = createWorld(2, params);
  const s = w.scenario.survivors.find((x) => x.appear_tick === 0 && x.cell !== '1-2');
  assert.equal(w.rescue('team-1', s.id, 'x').result, 'not_here');
  assert.throws(() => w.rescue('drone-1', s.id, 'y'), /only rescue teams/);
});

test('move: repeated key ignored; bad target rejected', () => {
  const w = createWorld(1, params);
  w.move('drone-1', { x: 7, y: 3 }, null, 'same');
  w.move('drone-1', { x: 0, y: 3 }, null, 'same'); // ignored: same key
  w.step();
  assert.deepEqual(w.sense('drone-1').pos, { x: 4, y: 3 });
  assert.throws(() => w.move('drone-1', { x: 8, y: 0 }, null, 'z'), /inside the grid/);
  assert.throws(() => w.sense('drone-9'), /unknown actor/);
});

test('distress: delivered once, to the nearest drone in range; waits ("Sending…") when none is', () => {
  const w = createWorld(11, params);
  const msgs = w.scenario.distress;
  const delivered = [];
  for (let t = 0; t < 200; t++) {
    // Sweep drone-1 across the map so it passes every district.
    w.move('drone-1', { x: Math.floor(t / 8) % 8, y: (Math.floor(t / 64) * 3) % 8 }, null, `sweep${t}`);
    delivered.push(...w.step());
  }
  const ids = delivered.map((d) => d.msg_id);
  assert.equal(new Set(ids).size, ids.length, 'each message delivered at most once');
  for (const d of delivered) {
    const m = msgs.find((x) => x.msg_id === d.msg_id);
    assert.ok(d.delivered_tick >= m.sent_tick, 'never before it was sent');
    assert.ok(d.to.startsWith('drone'), 'only drones receive texts');
  }
  const snap = w.snapshot();
  for (const m of snap.distress) if (m.state === 'sending') assert.equal(m.delivered_to, null);
  assert.ok(delivered.length > 0);
});

test('subset of actors (dev stack): only those actors exist', () => {
  const w = createWorld(1, params, ['drone-1', 'team-1']);
  assert.deepEqual(w.actorIds, ['drone-1', 'team-1']);
  assert.equal(w.sense('drone-1').pos.x, parseCell(HQ_CELL).x);
});

test('snapshot exposes ground truth; metrics add up', () => {
  const w = drive(9);
  const snap = w.snapshot(), m = w.metrics();
  const rescued = snap.survivors.filter((s) => s.state === 'rescued').length;
  assert.equal(rescued, m.rescued);
  assert.equal(m.rescued + m.unrescued + m.not_yet_appeared, params.survivors);
  assert.ok(m.score >= 0);
});

test('distress: with two drones in range, the nearer one receives it (ties → lower id)', () => {
  const w = createWorld(11, params);
  const m = w.scenario.distress[0];
  const c = parseCell(m.cell);
  // Park drone-2 on the sender's cell and drone-1 two cells away, before the message is sent.
  const near = { x: c.x, y: c.y }, far0 = { x: Math.min(7, c.x + 2), y: c.y };
  const far = far0.x === c.x ? { x: Math.max(0, c.x - 2), y: c.y } : far0;
  let got = null;
  for (let t = 0; t < 30 && !got; t++) {
    w.move('drone-2', near, null, `n${t}`); w.move('drone-1', far, null, `f${t}`);
    w.move('drone-3', { x: 7, y: 7 }, null, `g3${t}`); w.move('drone-4', { x: 7, y: 7 }, null, `g4${t}`);
    for (const d of w.step()) if (d.msg_id === m.msg_id) got = d;
  }
  assert.ok(got, 'delivered');
  const snapActors = Object.fromEntries(w.snapshot().actors.map((a) => [a.id, a.pos]));
  const dd = (id) => Math.max(Math.abs(snapActors[id].x - c.x), Math.abs(snapActors[id].y - c.y));
  const inRange = ['drone-1', 'drone-2', 'drone-3', 'drone-4'].filter((id) => dd(id) <= params.distress_radius);
  const best = inRange.sort((a, b) => dd(a) - dd(b) || (a < b ? -1 : 1))[0];
  assert.equal(got.to, best);
});

test('distress: a failed delivery goes back to "Sending…" and is retried', () => {
  const w = createWorld(11, params);
  const m = w.scenario.distress[0];
  let first = null;
  for (let t = 0; t < 30 && !first; t++) { w.move('drone-1', parseCell(m.cell), null, `go${t}`); first = w.step().find((d) => d.msg_id === m.msg_id); }
  assert.ok(first);
  assert.equal(w.requeueDistress(m.msg_id), true);
  assert.equal(w.snapshot().distress.find((x) => x.msg_id === m.msg_id).state, 'sending');
  const again = w.step().find((d) => d.msg_id === m.msg_id);
  assert.ok(again, 'first retry on the next tick');
  // Repeated failures back off: retries at +1, +2, +4, +8, then every 16 ticks — never every tick.
  const retryTicks = [];
  for (let t = 0; t < 60; t++) {
    w.move('drone-1', parseCell(m.cell), null, `stay${t}`);
    for (const d of w.step()) if (d.msg_id === m.msg_id) { retryTicks.push(w.tick); w.requeueDistress(m.msg_id); }
  }
  const gaps = retryTicks.slice(1).map((t, i) => t - retryTicks[i]);
  assert.deepEqual(gaps.slice(0, 4), [2, 4, 8, 16], `gaps ${gaps}`);
  assert.ok(gaps.every((g) => g <= 16));
});

test('a move lasts one tick: an actor that sends nothing holds position', () => {
  const w = createWorld(1, params);
  w.move('drone-1', { x: 7, y: 3 }, null, 'once');
  w.step(); w.step(); w.step();
  assert.deepEqual(w.sense('drone-1').pos, { x: 4, y: 3 }, 'moved one step, then held');
  // A team re-commanding the same target keeps its half-speed progress; switching resets it.
  w.move('team-1', { x: 1, y: 6 }, null, 't1'); w.step();
  w.move('team-1', { x: 1, y: 6 }, null, 't2'); w.step();
  assert.deepEqual(w.sense('team-1').pos, { x: 1, y: 3 });
});

test('inject (demo control): new survivor appears now; its text waits until a drone is in range', () => {
  const w = createWorld(1, params);
  w.step();
  const r = w.inject({ cell: '2-1', people: 3, urgency: 5, text: 'stuck on roof w/ 2 kids near the Irwell, water rising' });
  assert.equal(r.district, 'Lower Broughton');
  const snap = w.snapshot();
  assert.equal(snap.survivors.find((x) => x.id === r.survivor_id).state, 'waiting');
  // Drones start at 3-3; send the others away first so only drone-1 comes within range.
  for (const d of ['drone-2', 'drone-3', 'drone-4']) w.move(d, { x: 7, y: 7 }, null, `away-${d}`);
  let got = null;
  for (let t = 0; t < 6 && !got; t++) { w.move('drone-1', { x: 2, y: 1 }, null, `inj${t}`); for (const d of ['drone-2', 'drone-3', 'drone-4']) w.move(d, { x: 7, y: 7 }, null, `away-${d}-${t}`); got = w.step().find((d) => d.msg_id === r.msg_id); }
  assert.equal(got?.to, 'drone-1');
  assert.throws(() => w.inject({ cell: '9-9', text: 'x' }), /inside the grid/);
  assert.throws(() => w.inject({ cell: '1-1', text: '' }), /1-280/);
});

test('gazetteer: every district\'s real centre lies inside its own grid rectangle', () => {
  // Approximate real centres (lon, lat) of each neighbourhood.
  const real = { 'Pendleton': [-2.282, 53.4895], 'Lower Broughton': [-2.262, 53.4945], 'Greengate': [-2.249, 53.487], 'Northern Quarter': [-2.236, 53.4835],
    'Ordsall': [-2.276, 53.4745], 'Castlefield': [-2.258, 53.4745], 'Deansgate': [-2.249, 53.478], 'Piccadilly': [-2.232, 53.477] };
  for (const d of DISTRICTS) {
    const [lon, lat] = real[d.name];
    const x = Math.floor(((lon - GEO.west) / (GEO.east - GEO.west)) * 8), y = Math.floor(((GEO.north - lat) / (GEO.north - GEO.south)) * 8);
    assert.equal(districtOf(`${x}-${y}`).name, d.name, `${d.name} real centre maps to cell ${x}-${y}`);
  }
  const [lon, lat] = cellToLngLat('0-0');
  assert.ok(lon > GEO.west && lon < GEO.east && lat < GEO.north && lat > GEO.south);
});
