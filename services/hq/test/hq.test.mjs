import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHQ } from '../server.mjs';

let hq, base;
const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
before(async () => { hq = await startHQ({ PORT: '0', QUIET: '1' }); base = `http://127.0.0.1:${hq.port}`; });
after(() => hq.close());

const det = (sid, cell, urgency = 3) => ({ task_id: `T-${sid}`, survivor_id: sid, cell, urgency, people: 2 });

test('a drone report teaches HQ about tasks; a team report gets an assignment WITH its details', async () => {
  await post('/reset', {});
  const d = await post('/report', { actor: 'drone-1', role: 'drone', tick: 5, pos: { x: 3, y: 3 }, detections: [det('s01', '1-1', 5), det('s02', '6-6', 2)], done: [] });
  assert.deepEqual(d.body, { assignment: null, task: null });
  const t1 = await post('/report', { actor: 'team-1', role: 'team', tick: 5, pos: { x: 1, y: 2 }, detections: [], done: [] });
  assert.equal(t1.body.assignment, 'T-s01', 'nearest, most urgent');
  assert.deepEqual(t1.body.task, { id: 'T-s01', survivor_id: 's01', cell: '1-1', urgency: 5, people: 2 });
});

test('no task is given to two teams; a finished task frees the team', async () => {
  const t2 = await post('/report', { actor: 'team-2', role: 'team', tick: 6, pos: { x: 6, y: 5 }, detections: [], done: [] });
  assert.equal(t2.body.assignment, 'T-s02');
  const t3 = await post('/report', { actor: 'team-3', role: 'team', tick: 6, pos: { x: 5, y: 6 }, detections: [], done: [] });
  assert.equal(t3.body.assignment, null, 'nothing left to assign');
  const again = await post('/report', { actor: 'team-1', role: 'team', tick: 7, pos: { x: 1, y: 1 }, detections: [], done: [] });
  assert.equal(again.body.assignment, 'T-s01', 'keeps its assignment until done');
  const doneR = await post('/report', { actor: 'team-1', role: 'team', tick: 8, pos: { x: 1, y: 1 }, detections: [], done: ['s01'] });
  assert.equal(doneR.body.assignment, null, 'freed after rescue');
  const state = (await (await fetch(base + '/state')).json());
  assert.ok(state.done.includes('s01'));
});

test('bad report → 400; health names the score source', async () => {
  assert.equal((await post('/report', { role: 'team' })).status, 400);
  const h = await (await fetch(base + '/health')).json();
  assert.match(h.core, /STUB|hive-core/);
});
