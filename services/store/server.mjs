// HIVE actor-store: one per actor, reachable only on that actor's private network.
// A versioned JSON document store. n8n workflows GET the state, compute, then PUT it back
// with the version they read. A stale version gets 409, so lost updates are impossible.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const ACTOR_ID = process.env.ACTOR_ID;
const ROLE = process.env.ROLE;               // 'drone' | 'team'
const MODE = process.env.MODE || 'hive';     // 'hive' | 'central-naive' | 'central-strong'
const PEERS = (process.env.PEERS || '').split(',').filter(Boolean);
const DB_PATH = process.env.DB_PATH || '/data/store.db';
const PORT = Number(process.env.PORT || 4000);
if (!ACTOR_ID || !ROLE) { console.error('ACTOR_ID and ROLE are required'); process.exit(1); }

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('CREATE TABLE IF NOT EXISTS doc (id TEXT PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL)');
const getDoc = db.prepare('SELECT version, body FROM doc WHERE id = ?');
const insDoc = db.prepare('INSERT OR IGNORE INTO doc (id, version, body) VALUES (?, 0, ?)');
const updDoc = db.prepare('UPDATE doc SET version = version + 1, body = ? WHERE id = ? AND version = ?');
const delDoc = db.prepare('DELETE FROM doc WHERE id = ?');
insDoc.run('state', 'null'); // version 0 + null state = "not initialised yet"

const config = { actor_id: ACTOR_ID, role: ROLE, mode: MODE, peers: PEERS };
let conflicts = 0; // stale-version writes since start; acceptance requires 0

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, conflicts, ...config });
    if (req.method === 'GET' && url.pathname === '/config') return send(res, 200, config);
    if (req.method === 'GET' && url.pathname === '/state') {
      const row = getDoc.get('state');
      return send(res, 200, { config, version: row.version, state: JSON.parse(row.body) });
    }
    if (req.method === 'PUT' && url.pathname === '/state') {
      const { version, state } = await readJson(req);
      if (!Number.isInteger(version) || state === undefined) return send(res, 400, { error: 'need {version:int, state}' });
      const r = updDoc.run(JSON.stringify(state), 'state', version);
      if (r.changes !== 1) { conflicts += 1; return send(res, 409, { error: 'stale version', current: getDoc.get('state').version }); }
      return send(res, 200, { version: version + 1 });
    }
    if (req.method === 'POST' && url.pathname === '/reset') { // used by the scenario runner between runs
      delDoc.run('state'); insDoc.run('state', 'null');
      return send(res, 200, { version: 0 });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});
server.listen(PORT, () => console.log(`store ${ACTOR_ID} (${ROLE}, ${MODE}) on :${PORT}`));
