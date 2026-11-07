import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startProxy } from '../server.mjs';

// A fake "n8n" for every actor and a fake HQ, on one local port. Records what arrives.
let received = [];
let mock, proxy, base;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const sendMsg = (from, to, body = { hello: from }) => call('POST', '/send', { from, to, path: 'merge', body });

before(async () => {
  mock = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    if (req.url.startsWith('/hq/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ assignment: 'T-s01', got: JSON.parse(raw) })); }
    received.push({ url: req.url, body: JSON.parse(raw) });
    res.writeHead(200); res.end('{}');
  }).listen(0);
  const mp = mock.address().port;
  proxy = await startProxy({ PORT: '0', QUIET: '1', SEED: '1', FLAP_MS: '150', TARGET_TEMPLATE: `http://127.0.0.1:${mp}/{to}/{path}`, HQ_URL: `http://127.0.0.1:${mp}/hq` });
  base = `http://127.0.0.1:${proxy.port}`;
});
after(() => { proxy.close(); mock.close(); });
const reset = async () => { await call('POST', '/reset'); received = []; };

test('link up: 202 at once, then delivered to the peer webhook with the body intact', async () => {
  await reset();
  const r = await sendMsg('drone-1', 'team-1', { vv: { 'drone-1': 3 } });
  assert.equal(r.status, 202); assert.equal(r.body.status, 'queued');
  await wait(100);
  assert.deepEqual(received, [{ url: '/team-1/merge', body: { vv: { 'drone-1': 3 } } }]);
  const log = (await call('GET', '/log?since=0')).body;
  assert.deepEqual(log.map((e) => e.status), ['queued', 'delivered']);
  assert.ok(log[1].bytes > 0);
});

test('cut link: 503 refused immediately, nothing delivered', async () => {
  await reset();
  await call('POST', '/links/toggle', { a: 'drone-1', b: 'team-1' });
  const r = await sendMsg('drone-1', 'team-1');
  assert.equal(r.status, 503); assert.equal(r.body.status, 'refused');
  const back = await sendMsg('team-1', 'drone-1');
  assert.equal(back.status, 503, 'toggle cuts both directions');
  await wait(80);
  assert.equal(received.length, 0);
});

test('drop_rate=1: queued then dropped, nothing delivered', async () => {
  await reset();
  await call('PUT', '/links', { drop_rate: 1 });
  assert.equal((await sendMsg('drone-2', 'team-2')).status, 202);
  await wait(80);
  assert.equal(received.length, 0);
  assert.deepEqual((await call('GET', '/log?since=0')).body.map((e) => e.status), ['queued', 'dropped']);
});

test('duplicate_rate=1: the same message is delivered twice', async () => {
  await reset();
  await call('PUT', '/links', { duplicate_rate: 1 });
  await sendMsg('drone-3', 'team-2', { x: 1 });
  await wait(100);
  assert.equal(received.length, 2);
  assert.deepEqual(received[0].body, received[1].body);
});

test('delay: delivery waits delay_ms; a link cut in flight drops the message', async () => {
  await reset();
  await call('PUT', '/links', { delay_ms: 150 });
  await sendMsg('drone-1', 'drone-2');
  await wait(60);
  assert.equal(received.length, 0, 'not yet delivered');
  await wait(160);
  assert.equal(received.length, 1, 'delivered after delay');
  await sendMsg('drone-1', 'drone-2');
  await call('POST', '/links/toggle', { a: 'drone-1', b: 'drone-2', up: false });
  await wait(220);
  assert.equal(received.length, 1, 'in-flight message dropped');
  const last = (await call('GET', '/log?since=0')).body.at(-1);
  assert.equal(last.status, 'dropped'); assert.match(last.reason, /in flight/);
});

test('reorder: with jitter, a burst can arrive out of order but none is lost', async () => {
  await reset();
  await call('PUT', '/links', { delay_ms: 20, reorder: true });
  for (let i = 0; i < 20; i++) await sendMsg('drone-4', 'team-3', { i });
  await wait(400);
  const order = received.map((r) => r.body.i);
  assert.equal(order.length, 20);
  assert.deepEqual([...order].sort((a, b) => a - b), [...Array(20).keys()]);
  assert.notDeepEqual(order, [...Array(20).keys()], 'jitter reordered at least one message (seeded)');
});

test('blackout-3 preset: within-island delivered, cross-island refused, islands reported', async () => {
  await reset();
  const v = (await call('POST', '/links/preset', { name: 'blackout-3' })).body;
  assert.deepEqual(v.islands, [['drone-1', 'drone-2', 'team-1'], ['drone-3', 'team-2'], ['drone-4', 'team-3']]); // hq is not a peer, so not in islands
  assert.equal((await sendMsg('drone-1', 'team-1')).status, 202);
  assert.equal((await sendMsg('drone-1', 'team-2')).status, 503);
  assert.equal((await sendMsg('drone-3', 'team-2')).status, 202);
  await wait(80);
  assert.deepEqual(received.map((r) => r.url).sort(), ['/team-1/merge', '/team-2/merge']);
});

test('flapping preset: cross-island links come and go on a timer', async () => {
  await reset();
  await call('POST', '/links/preset', { name: 'flapping' });
  const seen = new Set();
  for (let i = 0; i < 8; i++) { seen.add((await sendMsg('drone-1', 'team-2')).status); await wait(60); }
  assert.ok(seen.has(202) && seen.has(503), `saw ${[...seen]}`);
});

test('rpc to HQ: passes through when up, 503 when the HQ link is down', async () => {
  await reset();
  const ok = await call('POST', '/rpc', { from: 'team-1', to: 'hq', path: 'report', body: { pos: '1-2' } });
  assert.equal(ok.status, 200); assert.equal(ok.body.assignment, 'T-s01'); assert.deepEqual(ok.body.got, { pos: '1-2' });
  await call('POST', '/links/preset', { name: 'blackout-3' });
  assert.equal((await call('POST', '/rpc', { from: 'team-1', to: 'hq', path: 'report', body: {} })).status, 503);
});

test('validation: unknown actors, self-send, sending to hq via /send, bad settings', async () => {
  await reset();
  assert.equal((await sendMsg('drone-9', 'team-1')).status, 400);
  assert.equal((await sendMsg('team-1', 'team-1')).status, 400);
  assert.equal((await call('POST', '/send', { from: 'team-1', to: 'hq', body: {} })).status, 400);
  assert.equal((await call('PUT', '/links', { drop_rate: 2 })).status, 400);
  assert.equal((await call('POST', '/links/preset', { name: 'nope' })).status, 400);
});

test('log?since returns only newer entries', async () => {
  await reset();
  await sendMsg('drone-1', 'team-1'); await wait(60);
  const all = (await call('GET', '/log?since=0')).body;
  const newer = (await call('GET', `/log?since=${all[0].n}`)).body;
  assert.equal(newer.length, all.length - 1);
});
