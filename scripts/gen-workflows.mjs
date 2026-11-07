// Generate n8n/workflows-src/*.json: the 4 HIVE workflows, identical on every actor.
// Code nodes start with the //@@HIVE_CORE@@ marker; scripts/build-workflows.mjs replaces
// it with core/dist/hive-core.js. Every node does I/O only through the actor's own store,
// the simulator or the proxy (D1, D4): no env access, no npm modules.
//   node scripts/gen-workflows.mjs
// After spike S2 (Docker) you may instead edit these in drone-1's editor and re-export.
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../n8n/workflows-src/', import.meta.url);
const CORE = '//@@HIVE_CORE@@';
const STORE = 'http://store:4000', SIM = 'http://sim:3000', PROXY = 'http://proxy:8080';

// Stable UUID-shaped ids so re-generating gives identical files.
const uuid = (name) => {
  let h = 0x811c9dc5; const hex = [];
  for (let r = 0; r < 4; r++) for (const ch of `${r}:${name}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; hex.push(h.toString(16).padStart(8, '0')); }
  const s = hex.join('').slice(0, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
};

function wf(id, name, nodes, edges) {
  const connections = {};
  for (const [from, to, output = 0] of edges) {
    const main = ((connections[from] ||= { main: [] }).main);
    while (main.length <= output) main.push([]);
    main[output].push({ node: to, type: 'main', index: 0 });
  }
  nodes.forEach((n, i) => { n.position ||= [i * 220, n.row ? n.row * 200 : 0]; delete n.row; n.id = uuid(`${id}:${n.name}`); });
  return { id, name, active: false, nodes, connections, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none' }, pinData: {}, tags: [] };
}

const webhook = (name, path) => ({
  name, type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: uuid(`webhook:${path}`),
  parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} },
});
const get = (name, url) => ({
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: { url, options: { timeout: 3000 } },
});
const send = (name, method, url, jsonBody, { continueOnFail = false } = {}) => ({
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: { method, url, sendBody: true, specifyBody: 'json', jsonBody, options: { timeout: 3000 } },
  ...(continueOnFail ? { onError: 'continueRegularOutput' } : {}),
});
const code = (name, body) => ({
  name, type: 'n8n-nodes-base.code', typeVersion: 2,
  parameters: { jsCode: `${CORE}\n${body.trim()}\n` },
});
// Put State: a 409 must fail the execution loudly, so never "continue on fail" here.
const putState = (name) => send(name, 'PUT', `${STORE}/state`, '={{ JSON.stringify({ version: $json.version, state: $json.state }) }}');

// ---------------- hive-tick ----------------
const tick = wf('hiveTick00000001', 'hive-tick', [
  webhook('Webhook', 'tick'),
  get('Get State', `${STORE}/state`),
  get('Sense', `=${SIM}/sense?actor={{ $json.config.actor_id }}`),
  code('Perceive', `
const s = $('Get State').first().json;
const now = Date.now();
let state = s.state ?? HiveCore.init(s.config, now);
const tick = $('Webhook').first().json.body.tick;
const sense = $('Sense').first().json;
if (typeof tick !== 'number' || tick < sense.tick - 1) return [];   // stale queued tick: drop it
if (tick <= state.tick) return [];                                   // already handled (replayed tick)
state = HiveCore.perceive(state, { tick, sense }, now);
const hq_body = HiveCore.hqRequest(state);
return [{ json: { version: s.version, state, central: state.config.mode !== 'hive', hq_body } }];`),
  {
    name: 'Central mode?', type: 'n8n-nodes-base.if', typeVersion: 2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ id: uuid('if:central'), leftValue: '={{ $json.central }}', rightValue: true,
          operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
  },
  { ...send('HQ Sync', 'POST', `${PROXY}/rpc`,
    "={{ JSON.stringify({ from: $json.state.config.actor_id, to: 'hq', path: 'report', body: $json.hq_body }) }}",
    { continueOnFail: true }), row: 1 },
  code('Bid (CBBA)', `
const p = $('Perceive').first().json;
let hq = null;
if ($('HQ Sync').isExecuted) {
  const r = $('HQ Sync').first().json;
  hq = r && !r.error && 'assignment' in r ? r : null;               // 503 / timeout → null
}
const state = HiveCore.bid(p.state, Date.now());
return [{ json: { version: p.version, state, hq } }];`),
  code('Act', `
const b = $input.first().json;
const out = HiveCore.act(b.state, { hq: b.hq }, Date.now());
return [{ json: { version: b.version, state: out.state, actions: out.actions } }];`),
  putState('Put State'),                               // intents saved BEFORE acting
  code('Split actions', `
const a = $('Act').first().json;
const actor = a.state.config.actor_id;
return a.actions.map((action) => {
  const body = action.kind === 'move'
    ? { actor, target: action.target, task_id: action.task_id, key: action.key }
    : { actor, survivor_id: action.survivor_id, key: action.key };
  return { json: { action, path: action.kind, body } };
});`),
  send('Do Action', 'POST', `=${SIM}/{{ $json.path }}`, '={{ JSON.stringify($json.body) }}', { continueOnFail: true }),
  code('Apply receipts', `
const sent = $('Split actions').all();
const receipts = $input.all().map((it, i) => ({
  action: sent[i].json.action,
  response: it.json && !it.json.error ? it.json : null,
}));
const state = HiveCore.applyReceipts($('Act').first().json.state, receipts, Date.now());
return [{ json: { version: $('Put State').first().json.version, state } }];`),
  putState('Put State 2'),
], [
  ['Webhook', 'Get State'], ['Get State', 'Sense'], ['Sense', 'Perceive'], ['Perceive', 'Central mode?'],
  ['Central mode?', 'HQ Sync', 0], ['Central mode?', 'Bid (CBBA)', 1], ['HQ Sync', 'Bid (CBBA)'],
  ['Bid (CBBA)', 'Act'], ['Act', 'Put State'], ['Put State', 'Split actions'], ['Split actions', 'Do Action'],
  ['Do Action', 'Apply receipts'], ['Apply receipts', 'Put State 2'],
]);

// ---------------- hive-gossip ----------------
// gossip() never changes the state, so there is no Put State: one less write, one less 409 risk.
const gossip = wf('hiveGossip000001', 'hive-gossip', [
  {
    name: 'Every 4s', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: 'seconds', secondsInterval: 4 }] } },
  },
  get('Get State', `${STORE}/state`),
  code('Gossip', `
const s = $('Get State').first().json;
if (!s.state) return [];                                             // no tick yet
const { messages } = HiveCore.gossip(s.state, Date.now());
const from = s.state.config.actor_id;
return messages.map((m) => ({ json: { from, to: m.to, path: 'merge', body: m.body } }));`),
  send('Send via proxy', 'POST', `${PROXY}/send`, '={{ JSON.stringify({ from: $json.from, to: $json.to, path: $json.path, body: $json.body }) }}',
    { continueOnFail: true }),                                       // 503 = link down: normal
], [['Every 4s', 'Get State'], ['Get State', 'Gossip'], ['Gossip', 'Send via proxy']]);

// ---------------- hive-merge ----------------
const merge = wf('hiveMerge0000001', 'hive-merge', [
  webhook('Webhook', 'merge'),
  get('Get State', `${STORE}/state`),
  code('Merge', `
const s = $('Get State').first().json;
const now = Date.now();
const state = HiveCore.merge(s.state ?? HiveCore.init(s.config, now), $('Webhook').first().json.body, now);
return [{ json: { version: s.version, state } }];`),
  putState('Put State'),
], [['Webhook', 'Get State'], ['Get State', 'Merge'], ['Merge', 'Put State']]);

// ---------------- hive-interpret (Phase 2 stub; Phase 4 adds the AI call) ----------------
const interpret = wf('hiveInterpret001', 'hive-interpret', [webhook('Webhook', 'distress')], []);

mkdirSync(OUT, { recursive: true });
for (const w of [tick, gossip, merge, interpret]) {
  writeFileSync(new URL(`${w.name}.json`, OUT), JSON.stringify(w, null, 2) + '\n');
  console.log(`n8n/workflows-src/${w.name}.json  (${w.nodes.length} nodes)`);
}
