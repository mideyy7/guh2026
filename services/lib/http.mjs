// Tiny HTTP helpers shared by HIVE services (no dependencies).
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const isMain = (metaUrl) => !!process.argv[1] && metaUrl === pathToFileURL(resolve(process.argv[1])).href;

export function send(res, code, obj, extraHeaders = {}) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': typeof obj === 'string' ? 'text/plain' : 'application/json', 'content-length': Buffer.byteLength(body), 'access-control-allow-origin': '*', ...extraHeaders });
  res.end(body);
}

export async function readJson(req, limit = 4 * 1024 * 1024) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > limit) throw Object.assign(new Error('body too large'), { status: 413 }); }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

// routes: { 'GET /path': async (req, res, url) => ... }. Errors with .status map to that status.
export function serve(port, routes, name) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204, '', { 'access-control-allow-methods': 'GET,POST,PUT', 'access-control-allow-headers': 'content-type' });
    const h = routes[`${req.method} ${url.pathname}`];
    if (!h) return send(res, 404, { error: `no route ${req.method} ${url.pathname}` });
    try { await h(req, res, url); }
    catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: String(e.message || e) }); }
  });
  server.keepAliveTimeout = 5000;
  return new Promise((resolve) => server.listen(port, () => { if (name) console.log(`${name} listening on :${port}`); resolve(server); }));
}

// POST JSON with a timeout. Resolves {ok, status, body} or {ok:false, error}; never throws.
export async function postJson(url, body, timeoutMs = 5000) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    let parsed = text; try { parsed = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, body: parsed };
  } catch (e) {
    return { ok: false, status: 0, error: e.cause?.code || e.name || String(e) };
  }
}

export function loadParams() {
  return import('node:fs').then(({ readFileSync }) => JSON.parse(readFileSync(new URL('../../contracts/params.json', import.meta.url), 'utf8')));
}
