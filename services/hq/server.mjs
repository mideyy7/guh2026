// HIVE central dispatcher (HQ) for the two central baselines. Reachable by actors ONLY through the
// proxy's /rpc, so a cut HQ link really fails. It scores tasks with the SAME function the HIVE
// actors use (HiveCore.score), so the comparison is fair.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, send, readJson, loadParams, isMain } from '../lib/http.mjs';
import { createHQ } from '../../world/central.mjs';

const require = createRequire(import.meta.url);

export function loadScore(corePath) {
  const real = fileURLToPath(new URL('../../core/dist/hive-core.js', import.meta.url));
  const stub = fileURLToPath(new URL('../../bench/stub-core.cjs', import.meta.url));
  const p = corePath || (existsSync(real) ? real : stub);
  const core = require(p);
  if (typeof core.score !== 'function') throw new Error(`${p} has no score()`);
  return { score: core.score, stub: p === stub || !!core.STUB };
}

export async function startHQ(env = process.env) {
  const params = await loadParams();
  const PORT = Number(env.PORT || params.ports.hq);
  const { score, stub } = loadScore(env.CORE_PATH);
  let hq = createHQ(score, params);
  let reports = 0;

  const routes = {
    'GET /health': (req, res) => send(res, 200, { ok: true, mode: env.MODE || 'hive', core: stub ? 'STUB score (not real HIVE)' : 'core/dist/hive-core.js', reports }),
    'POST /report': async (req, res) => { const body = await readJson(req); reports += 1; send(res, 200, hq.report(body)); },
    'GET /state': (req, res) => send(res, 200, hq.snapshot()),
    'POST /reset': (req, res) => { hq = createHQ(score, params); reports = 0; send(res, 200, { ok: true }); },
  };
  const server = await serve(PORT, routes, env.QUIET ? null : `hq on :${PORT}${stub ? ' (STUB score)' : ''}`);
  return { server, port: server.address().port, close: () => server.close() };
}

if (isMain(import.meta.url)) startHQ();
