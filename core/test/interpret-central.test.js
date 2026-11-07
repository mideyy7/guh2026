// Phase 4 tests: distress-text interpretation and the central baselines. Pure, no Docker.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { H } = require('./helpers/sim.js');

const fx = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'tests', 'ai', 'fixtures.json'), 'utf8'));
const NOW = 1_700_000_000_000;
const drone = () => H.perceive(H.init({ actor_id: 'drone-1', role: 'drone', mode: 'hive', peers: ['team-1'] }, NOW),
  { tick: 5, sense: { tick: 5, pos: { x: 3, y: 3 }, footprint: [], detections: [] } }, NOW);

test('regex fallback: correct district for >= 15 of the 20 generated texts (gate)', () => {
  const ok = fx.generated.filter((f) => H.Text.parse(f.text, H.GAZETTEER)?.district === f.district).length;
  assert.ok(ok >= 15, `regex placed ${ok}/20`);
});

test('fallback path: with the AI unavailable, interpret still creates provisional tasks for >= 15 of 20', () => {
  let s = drone();
  fx.generated.forEach((f, i) => { s = H.interpret(s, null, { msg_id: `m${i}`, text: f.text, sent_tick: 1, delivered_tick: 2 }, NOW); });
  const prov = Object.values(s.tasks).filter((t) => t.provisional);
  assert.ok(prov.length >= 15, `${prov.length} provisional tasks`);
  for (const t of prov) {
    const f = fx.generated[+t.task_id.slice(3)];
    assert.equal(t.cell, H.GAZETTEER[f.district].landmark.cell, `${t.task_id} at its district's landmark`);
  }
  assert.equal(s.view.provisional, prov.length);
});

test('interpret: AI result → P-<msg_id> at the landmark; redelivery is idempotent; nothing placeable → counted', () => {
  let s = drone();
  const raw = { msg_id: 'm7', text: 'whatever', sent_tick: 3, delivered_tick: 5 };
  s = H.interpret(s, { district: 'Hulme', landmark: null, people: 3, urgency: 9, hazards: [] }, raw, NOW);
  const t = s.tasks['P-m7'];
  assert.equal(t.cell, '5-6');
  assert.equal(t.urgency, 5, 'urgency clamped to 1-5');
  assert.equal(t.provisional, true);
  assert.equal(t.source, 'text');
  const ev = Object.values(s.log.events).find((e) => e.data.task_id === 'P-m7');
  assert.equal(ev.data.via, 'ai');
  const seq = s.log.seq;
  s = H.interpret(s, { district: 'Hulme', urgency: 3 }, raw, NOW);
  assert.equal(s.log.seq, seq, 'same msg_id twice → no second event');
  s = H.interpret(s, null, { msg_id: 'm8', text: 'please help us' }, NOW);
  assert.equal(s.tasks['P-m8'], undefined);
  assert.equal(s.text_failures, 1);
  // An AI answer naming an unknown district falls back to the regex.
  s = H.interpret(s, { district: 'Narnia', urgency: 3 }, { msg_id: 'm9', text: 'stuck by the Lowry' }, NOW);
  assert.equal(s.tasks['P-m9'].cell, H.GAZETTEER['Salford Quays'].landmark.cell);
});

test('teams never bid on a provisional task; a sensor detection within 2 cells resolves it', () => {
  let t = H.init({ actor_id: 'team-1', role: 'team', mode: 'hive', peers: [] }, NOW);
  t = H.perceive(t, { tick: 1, sense: { tick: 1, pos: { x: 0, y: 0 }, footprint: [], detections: [] } }, NOW);
  t = H.interpret(t, { district: 'Piccadilly', landmark: null, people: 2, urgency: 5, hazards: [] }, { msg_id: 'm1', text: 'x' }, NOW);
  assert.equal(t.view.provisional, 1);
  t = H.bid(t, NOW);
  assert.deepEqual(t.view.bundle, [], 'no bid on a provisional task');
  t = H.perceive(t, { tick: 2, sense: { tick: 2, pos: { x: 6, y: 6 }, footprint: [], detections: [{ survivor_id: 's9', cell: '7-6', people: 2, urgency: 5 }] } }, NOW);
  assert.equal(t.view.provisional, 0);
  assert.equal(t.resolved['P-m1'], 'T-s9');
  t = H.bid(t, NOW);
  assert.deepEqual(t.view.bundle, ['T-s9']);
});

test('drones are pulled toward an unconfirmed distress text', () => {
  let s = drone();                                      // drone-1 at 3-3, its own sector is the NW quadrant
  const before = H.act(JSON.parse(JSON.stringify(s)), { hq: null }, NOW).state.search_target;
  s = H.interpret(s, { district: 'Piccadilly', urgency: 5 }, { msg_id: 'm1', text: 'x' }, NOW);
  const after = H.act(s, { hq: null }, NOW).state.search_target;
  const d = (c) => { const [x, y] = c.split('-').map(Number); return Math.max(Math.abs(x - 6), Math.abs(y - 5)); };
  assert.ok(d(after) <= 2, `target ${after} should be near Piccadilly Gardens (6-5); before it was ${before}`);
});

test('aiRequest never sets sampling params; aiParse reads the text block and rejects bad replies', () => {
  const body = H.aiRequest('help');
  for (const k of ['temperature', 'top_p', 'top_k']) assert.equal(k in body, false, k);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.deepEqual(body.output_config.format.schema.properties.district.enum, Object.keys(H.GAZETTEER));
  const reply = (extra) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: JSON.stringify({ district: 'Hulme', landmark: null, people: 1, urgency: 4, hazards: [] }) }], ...extra });
  assert.equal(H.aiParse(reply()).district, 'Hulme', 'select the text block by type, not position');
  assert.equal(H.aiParse(reply({ stop_reason: 'refusal' })), null);
  assert.equal(H.aiParse(reply({ stop_reason: 'max_tokens' })), null);
  assert.equal(H.aiParse({ error: { status: 401 } }), null);
  assert.equal(H.aiParse({ content: [{ type: 'text', text: 'not json' }] }), null);
  assert.equal(H.aiParse(null), null);
});

// ---------------- central baselines ----------------
function centralTeam(mode) {
  let t = H.init({ actor_id: 'team-1', role: 'team', mode, peers: ['drone-1'] }, NOW);
  t = H.perceive(t, { tick: 1, sense: { tick: 1, pos: { x: 0, y: 0 }, footprint: ['0-0'], detections: [] } }, NOW);
  return t;
}
const assignment = { task_id: 'T-s1', survivor_id: 's1', cell: '3-0', urgency: 4, people: 2 };

test('central modes: gossip sends nothing, hqRequest reports position, detections and finished work', () => {
  const t = centralTeam('central-naive');
  assert.deepEqual(H.gossip(t, NOW).messages, []);
  const r = H.hqRequest(t);
  assert.deepEqual(Object.keys(r).sort(), ['actor', 'detections', 'done', 'pos', 'role', 'tick']);
  assert.equal(H.hqRequest(H.init({ actor_id: 'team-1', role: 'team', mode: 'hive', peers: [] }, NOW)), null);
});

test('central-naive: follows HQ, and does nothing at all when HQ is unreachable', () => {
  let t = centralTeam('central-naive');
  let out = H.act(t, { hq: { assignment } }, NOW);
  assert.equal(out.actions[0].kind, 'move');
  assert.deepEqual(out.actions[0].target, { x: 3, y: 0 });
  out = H.act(out.state, { hq: null }, NOW);
  assert.deepEqual(out.actions, [], 'HQ link cut → zero moves');
  assert.equal(out.state.view.action, 'idle');
});

test('central-strong: with HQ cut, finishes the cached assignment, then goes idle', () => {
  let t = centralTeam('central-strong');
  t = H.act(t, { hq: { assignment } }, NOW).state;
  let out = H.act(t, { hq: null }, NOW);
  assert.equal(out.actions[0]?.kind, 'move', 'keeps going to the cached job');
  // Arrive and rescue, still without HQ.
  let s = H.perceive(out.state, { tick: 9, sense: { tick: 9, pos: { x: 3, y: 0 }, footprint: ['3-0'], detections: [{ survivor_id: 's1', cell: '3-0', people: 2, urgency: 4 }] } }, NOW);
  out = H.act(s, { hq: null }, NOW);
  const rescue = out.actions.find((a) => a.kind === 'rescue');
  assert.equal(rescue.survivor_id, 's1');
  s = H.applyReceipts(out.state, [{ action: rescue, response: { result: 'rescued', tick: 9 } }], NOW);
  assert.deepEqual(s.hq_done, ['s1'], 'reported to HQ next time');
  assert.equal(s.hq_cached, null);
  out = H.act(s, { hq: null }, NOW);
  assert.deepEqual(out.actions, [], 'then idle');
  assert.deepEqual(H.hqRequest(out.state).done, ['s1']);
});

test('central: HQ answering "no assignment" clears the cached one', () => {
  let t = centralTeam('central-strong');
  t = H.act(t, { hq: { assignment } }, NOW).state;
  t = H.act(t, { hq: { assignment: null } }, NOW).state;
  assert.deepEqual(H.act(t, { hq: null }, NOW).actions, []);
});
