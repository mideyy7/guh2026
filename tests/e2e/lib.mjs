// Helpers for end-to-end scripts (checkpoint8, checkpoint14, acceptance, demo).
// They talk ONLY to the dashboard API on the host (http://localhost:8000/api by default), exactly as
// a judge's browser would. Nothing here can reach an actor directly.
//
//   import * as hive from './lib.mjs';
//   await hive.reset(1); await hive.start(); await hive.waitTicks(30); ...
//
// Env: HIVE_API (default http://localhost:8000/api)

export const API = process.env.HIVE_API || 'http://localhost:8000/api';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let j = text; try { j = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${typeof j === 'object' ? j.error || JSON.stringify(j) : j}`);
  return j;
}

// ── scenario control ───────────────────────────────────────────────────
export const reset = (seed = 1) => req('POST', '/reset', { seed });
export const start = () => req('POST', '/sim/control/start');
export const pause = () => req('POST', '/sim/control/pause');
export const step = (n = 1) => req('POST', '/sim/control/step', { n });
export const setTickMs = (tick_ms) => req('POST', '/sim/control/speed', { tick_ms });
export const status = () => req('GET', '/sim/status');
export const world = () => req('GET', '/sim/world');
export const metrics = () => req('GET', '/sim/metrics');
export const events = (since = 0) => req('GET', `/sim/events?since=${since}`);

// ── outages ────────────────────────────────────────────────────────────
export const preset = (name, opts = {}) => req('POST', '/proxy/preset', { name, ...opts });
export const links = () => req('GET', '/proxy/links');
export const setLinks = (settings) => req('PUT', '/proxy/links', settings);
export const toggle = (a, b, up) => req('POST', '/proxy/toggle', { a, b, ...(up === undefined ? {} : { up }) });
export const log = (since = 0) => req('GET', `/proxy/log?since=${since}`);

// ── actor beliefs (from each store) ────────────────────────────────────
export const actors = () => req('GET', '/actors');
export const convergence = () => req('GET', '/convergence');
export const views = async () => Object.fromEntries((await actors()).map((a) => [a.actor_id, a.view]));

// Wait until the simulator has advanced n ticks from now (it must be running).
export async function waitTicks(n, { timeoutMs } = {}) {
  const s0 = await status();
  const target = s0.tick + n;
  const limit = Date.now() + (timeoutMs ?? (n + 5) * s0.tick_ms * 2);
  for (;;) {
    const s = await status();
    if (s.tick >= target) return s.tick;
    if (!s.running) throw new Error(`waitTicks: simulator is paused at tick ${s.tick} (wanted ${target})`);
    if (Date.now() > limit) throw new Error(`waitTicks: timed out at tick ${s.tick} (wanted ${target})`);
    await sleep(Math.min(500, s.tick_ms / 2));
  }
}

// Poll until every actor's digest matches. Resolves {converged, ms, digests}.
export async function waitConverged({ budgetMs = 40000, pollMs = 500 } = {}) {
  const t0 = Date.now();
  let c;
  while (Date.now() - t0 <= budgetMs) {
    c = await convergence();
    if (c.converged) return { converged: true, ms: Date.now() - t0, digests: c.digests };
    await sleep(pollMs);
  }
  return { converged: false, ms: Date.now() - t0, digests: c?.digests, diverged: c?.diverged };
}

// Proxy log entries that crossed between different blackout islands with status 'delivered'.
export function crossIslandDeliveries(entries, islandGroups) {
  const islandOf = (id) => islandGroups.findIndex((g) => g.includes(id));
  return entries.filter((e) => e.status === 'delivered' && !e.rpc && islandOf(e.from) !== islandOf(e.to));
}

// Store health for every actor: {actor_id: conflicts}. Acceptance requires all 0.
export async function conflicts() {
  return Object.fromEntries((await actors()).map((a) => [a.actor_id, a.conflicts]));
}

// Tiny assertion helper that prints a clear PASS/FAIL line and tracks the result.
export function checker(name) {
  const results = [];
  const check = (label, ok, detail = '') => { results.push({ label, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); return !!ok; };
  check.done = () => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${name}: ${results.length - failed.length}/${results.length} checks passed`);
    process.exitCode = failed.length ? 1 : 0;
    return failed.length === 0;
  };
  return check;
}
