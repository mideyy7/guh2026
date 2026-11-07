// Phase 4 AI accuracy check (live API, no Docker): send every fixture through the SAME
// request the hive-interpret workflow builds (HiveCore.aiRequest) and read the reply with
// HiveCore.aiParse. Pass: correct district for >= 18 of the 20 generated texts.
// Also reports the 5 messy texts and the regex fallback's score on the same fixtures.
//   node core/build.mjs && node tests/ai/accuracy.mjs
// Reads ANTHROPIC_API_KEY from the environment or ../../.env. Never prints the key.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const H = require('../../core/dist/hive-core.js');
const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));

let KEY = process.env.ANTHROPIC_API_KEY;
const envFile = new URL('../../.env', import.meta.url);
if (!KEY && existsSync(envFile)) {
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('ANTHROPIC_API_KEY='));
  KEY = line && line.slice('ANTHROPIC_API_KEY='.length).trim();
}
if (!KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(2); }

async function ask(text) {
  const t0 = performance.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2026-10-21' },
    body: JSON.stringify(H.aiRequest(text)),
  });
  const json = await res.json();
  return { parsed: res.ok ? H.aiParse(json) : null, ms: performance.now() - t0, status: res.status, error: json.error?.message };
}

async function score(set, label) {
  const rows = await Promise.all(set.map(async (f) => ({ f, ai: await ask(f.text), rx: H.Text.parse(f.text, H.GAZETTEER) })));
  let ai = 0, rx = 0, ppl = 0, pplN = 0;
  console.log(`\n${label}`);
  for (const { f, ai: a, rx: r } of rows) {
    const okA = a.parsed?.district === f.district, okR = r?.district === f.district;
    ai += okA; rx += okR;
    if (f.people != null) { pplN += 1; ppl += a.parsed?.people === f.people; }
    console.log(`  ${okA ? 'ok ' : 'BAD'} ai=${(a.parsed?.district ?? `null(${a.status}${a.error ? ': ' + a.error : ''})`).padEnd(17)} regex=${(r?.district ?? 'null').padEnd(17)} ${a.ms.toFixed(0).padStart(5)} ms  ${f.text}`);
  }
  console.log(`  district: AI ${ai}/${set.length}, regex ${rx}/${set.length}; people (AI, where labelled): ${ppl}/${pplN}`);
  return { ai, rx };
}

const g = await score(fx.generated, 'Generated (20)');
const m = await score(fx.messy, 'Messy (5)');
const pass = g.ai >= 18;
console.log(`\nAI accuracy ${g.ai}/20 (need >= 18): ${pass ? 'PASS' : 'FAIL'}.  Messy: ${m.ai}/5.  Regex fallback on generated: ${g.rx}/20 (need >= 15).`);
process.exit(pass ? 0 : 1);
