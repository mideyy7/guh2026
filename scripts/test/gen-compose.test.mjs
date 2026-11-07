import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate, parseArgs } from '../gen-compose.mjs';

const params = JSON.parse(readFileSync(new URL('../../contracts/params.json', import.meta.url), 'utf8'));
const none = () => false;
const allSvc = () => true;

// Tiny extractor: the services block of each top-level service, keyed by name.
function services(yaml) {
  const out = {}; let cur = null;
  for (const line of yaml.split('\n')) {
    const m = line.match(/^  ([a-z0-9-]+):$/);
    if (m && !line.startsWith('    ')) { cur = m[1]; out[cur] = []; continue; }
    if (/^\S/.test(line)) cur = null;
    if (cur) out[cur].push(line);
  }
  return out;
}
const netsOf = (lines) => {
  const inline = lines.find((l) => l.startsWith('    networks: ['));
  if (inline) return inline.replace(/.*\[|\].*/g, '').split(',').map((s) => s.trim());
  const i = lines.indexOf('    networks:');
  return lines.slice(i + 1).filter((l) => /^      net-/.test(l)).map((l) => l.trim().split(':')[0]);
};

test('default: 7 n8n + 7 stores, fixed host ports 5671-5677', () => {
  const { yaml, actors } = generate(params, { hasService: none });
  const s = services(yaml);
  assert.equal(actors.length, 7);
  const n8n = Object.keys(s).filter((k) => k.startsWith('n8n-'));
  const stores = Object.keys(s).filter((k) => k.startsWith('store-'));
  assert.equal(n8n.length, 7); assert.equal(stores.length, 7);
  const ports = n8n.map((k) => s[k].find((l) => l.includes('ports:')).match(/"(\d+):/)[1]);
  assert.deepEqual(ports, ['5671', '5672', '5673', '5674', '5675', '5676', '5677']);
});

test('isolation: each actor is on exactly its own network, and no two actors share one', () => {
  const s = services(generate(params, { hasService: allSvc }).yaml);
  const seen = new Map();
  for (const a of [...params.actors.drones, ...params.actors.teams]) {
    assert.deepEqual(netsOf(s[`n8n-${a}`]), [`net-${a}`]);
    assert.deepEqual(netsOf(s[`store-${a}`]), [`net-${a}`]);
    assert.ok(s[`store-${a}`].some((l) => l.includes('aliases: [store]')), `${a} store alias`);
    assert.ok(!seen.has(`net-${a}`)); seen.set(`net-${a}`, a);
  }
  // hq is reachable only via the proxy's net-hq, never on an actor network.
  assert.deepEqual(netsOf(s.hq), ['net-hq']);
  assert.ok(netsOf(s.proxy).includes('net-hq'));
  assert.ok(!netsOf(s.sim).includes('net-hq'));
  assert.ok(!netsOf(s.dashboard).includes('net-hq'));
});

test('stores get role, mode and the peer list (everyone but themselves)', () => {
  const s = services(generate(params, { hasService: none }).yaml);
  const t1 = s['store-team-1'].join('\n');
  assert.match(t1, /ROLE: team/);
  assert.match(t1, /PEERS: "drone-1,drone-2,drone-3,drone-4,team-2,team-3"/);
  assert.match(s['store-drone-3'].join('\n'), /ROLE: drone/);
});

test('--actors subset keeps each actor on its own fixed port', () => {
  const { yaml, actors } = generate(params, { actors: ['drone-2', 'team-1'], hasService: none });
  assert.deepEqual(actors, ['drone-2', 'team-1']);
  const s = services(yaml);
  assert.ok(s['n8n-drone-2'].some((l) => l.includes('"5672:5678"')));
  assert.ok(s['n8n-team-1'].some((l) => l.includes('"5675:5678"')));
  assert.equal(s['n8n-drone-1'], undefined);
  assert.match(s['store-team-1'].join('\n'), /PEERS: "drone-2"/);
});

test('rejects unknown and duplicate actors', () => {
  assert.throws(() => generate(params, { actors: ['drone-9'], hasService: none }), /unknown actor/);
  assert.throws(() => generate(params, { actors: ['team-1', 'team-1'], hasService: none }), /duplicate/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('shared services appear only when their Dockerfile exists', () => {
  const s = services(generate(params, { hasService: (n) => n === 'proxy' }).yaml);
  assert.ok(s.proxy); assert.equal(s.sim, undefined); assert.equal(s.dashboard, undefined);
});

test('secrets are never written into the file', () => {
  const { yaml } = generate(params, { hasService: allSvc, withProbe: true });
  assert.doesNotMatch(yaml, /sk-ant-/);
  assert.match(yaml, /\$\{N8N_ENCRYPTION_KEY:\?/);
});

test('n8n boots one at a time: each waits for the previous to be READY', () => {
  const s = services(generate(params, { hasService: none }).yaml);
  const order = [...params.actors.drones, ...params.actors.teams];
  order.forEach((a, i) => {
    const block = s[`n8n-${a}`].join('\n');
    assert.match(block, /healthz\/readiness/, `${a} uses the readiness check`);
    if (i === 0) assert.doesNotMatch(block, /n8n-[a-z0-9-]+: \{ condition: service_healthy \}/, 'first has no n8n dependency');
    else assert.match(block, new RegExp(`n8n-${order[i - 1]}: \\{ condition: service_healthy \\}`), `${a} waits for ${order[i - 1]}`);
  });
});
