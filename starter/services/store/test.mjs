import { spawn } from 'node:child_process';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4999;
const base = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'store-'));
let proc;
const env = { ...process.env, ACTOR_ID: 'team-1', ROLE: 'team', PEERS: 'drone-1,drone-2', DB_PATH: join(dir, 's.db'), PORT: String(PORT) };

function start() {
  proc = spawn(process.execPath, [new URL('./server.mjs', import.meta.url).pathname], { env, stdio: 'ignore' });
  return waitUp();
}
async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('store did not start');
}
const put = (version, state) => fetch(base + '/state', { method: 'PUT', body: JSON.stringify({ version, state }) });

before(start);
after(() => proc.kill());

test('fresh store returns version 0 and null state', async () => {
  const s = await (await fetch(base + '/state')).json();
  assert.equal(s.version, 0); assert.equal(s.state, null);
  assert.deepEqual(s.config.peers, ['drone-1', 'drone-2']);
});
test('write with the version you read succeeds; stale write gets 409', async () => {
  assert.equal((await put(0, { n: 1 })).status, 200);
  const stale = await put(0, { n: 999 });
  assert.equal(stale.status, 409);
  const s = await (await fetch(base + '/state')).json();
  assert.equal(s.version, 1); assert.deepEqual(s.state, { n: 1 });
  assert.equal((await (await fetch(base + '/health')).json()).conflicts, 1);
});
test('state survives a restart (durability)', async () => {
  proc.kill(); await new Promise(r => setTimeout(r, 200));
  await start();
  const s = await (await fetch(base + '/state')).json();
  assert.equal(s.version, 1); assert.deepEqual(s.state, { n: 1 });
});
