import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { serve, send } from '../http.mjs';

// Send a raw request line (fetch would normalise the path).
function raw(port, line) {
  return new Promise((resolve) => {
    const c = net.connect(port, '127.0.0.1', () => c.write(`${line}\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let buf = ''; c.on('data', (d) => (buf += d)); c.on('end', () => resolve(buf)); c.on('error', () => resolve(buf));
  });
}

test('a malformed URL gets 400 and never crashes the service', async () => {
  const server = await serve(0, { 'GET /ok': (req, res) => send(res, 200, { ok: true }) });
  const port = server.address().port;
  for (const path of ['//', '//evil.example/x', '///']) {
    const r = await raw(port, `GET ${path} HTTP/1.1`);
    assert.match(r, /^HTTP\/1\.1 (400|404)/, `${path} → ${r.split('\r\n')[0]}`);
  }
  assert.equal((await fetch(`http://127.0.0.1:${port}/ok`)).status, 200, 'still alive afterwards');
  server.close();
});

test('a handler that throws returns 500, the service stays up', async () => {
  const server = await serve(0, { 'GET /boom': () => { throw new Error('boom'); }, 'GET /ok': (req, res) => send(res, 200, {}) });
  const port = server.address().port;
  assert.equal((await fetch(`http://127.0.0.1:${port}/boom`)).status, 500);
  assert.equal((await fetch(`http://127.0.0.1:${port}/ok`)).status, 200);
  server.close();
});
