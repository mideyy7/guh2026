// Build n8n/build/*.json from n8n/workflows-src/*.json:
//   1. replace //@@HIVE_CORE@@ in every Code node with core/dist/hive-core.js
//   2. lint: every HTTP Request URL must target the actor's own store, the simulator or the
//      proxy (plus the Anthropic API for hive-interpret). Dashboard-only sim endpoints
//      (/world, /metrics, /control) and host.docker.internal are rejected, and so is env access.
//   node core/build.mjs && node scripts/build-workflows.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ALLOWED = ['http://store:4000', 'http://sim:3000', 'http://proxy:8080'];
export const ALLOWED_EXTERNAL = { 'hive-interpret': ['https://api.anthropic.com/v1/messages'] };
const FORBIDDEN = [/\/world\b/, /\/metrics\b/, /\/control\b/, /host\.docker\.internal/];
const MARKER = '//@@HIVE_CORE@@';

// Returns a list of problems (empty = OK).
export function lint(workflow) {
  const errs = [];
  const extra = ALLOWED_EXTERNAL[workflow.name] || [];
  for (const n of workflow.nodes || []) {
    if (n.type === 'n8n-nodes-base.httpRequest') {
      const url = String(n.parameters?.url ?? '').replace(/^=/, '');
      if (![...ALLOWED, ...extra].some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`))) {
        errs.push(`${workflow.name} / ${n.name}: URL not allowed: ${url}`);
      }
      for (const f of FORBIDDEN) if (f.test(url)) errs.push(`${workflow.name} / ${n.name}: forbidden endpoint: ${url}`);
    }
    if (n.type === 'n8n-nodes-base.code') {
      const js = n.parameters?.jsCode ?? '';
      if (!js.includes(MARKER) && !js.includes('const HiveCore')) errs.push(`${workflow.name} / ${n.name}: Code node without ${MARKER}`);
      if (/\$env\b|process\.env/.test(js)) errs.push(`${workflow.name} / ${n.name}: env access is blocked in n8n 2.x (read config from the store)`);
    }
    if (n.type === 'n8n-nodes-base.wait') errs.push(`${workflow.name} / ${n.name}: Wait nodes break concurrency=1 (S3)`);
  }
  return errs;
}

export function inject(workflow, core) {
  const w = JSON.parse(JSON.stringify(workflow));
  for (const n of w.nodes || []) {
    if (n.type === 'n8n-nodes-base.code' && n.parameters?.jsCode?.includes(MARKER)) {
      n.parameters.jsCode = n.parameters.jsCode.replace(MARKER, () => core);
    }
  }
  return w;
}

export function buildAll({ src, out, corePath }) {
  const core = readFileSync(corePath, 'utf8');
  const files = readdirSync(src).filter((f) => f.endsWith('.json')).sort();
  const errs = [];
  const built = [];
  for (const f of files) {
    const w = JSON.parse(readFileSync(new URL(f, src), 'utf8'));
    errs.push(...lint(w));
    built.push([f, inject(w, core)]);
  }
  if (errs.length) { const e = new Error(`workflow lint failed:\n  ${errs.join('\n  ')}`); e.errors = errs; throw e; }
  mkdirSync(out, { recursive: true });
  for (const [f, w] of built) writeFileSync(new URL(f, out), JSON.stringify(w, null, 2) + '\n');
  return built.map(([f, w]) => ({ file: f, id: w.id, name: w.name }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL('../', import.meta.url);
  try {
    const out = buildAll({ src: new URL('n8n/workflows-src/', root), out: new URL('n8n/build/', root), corePath: new URL('core/dist/hive-core.js', root) });
    for (const w of out) console.log(`n8n/build/${w.file}  id=${w.id}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
