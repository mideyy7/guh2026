// Spike S7 (API half, no Docker): prove the exact request the §12.5 fallback HTTP Request
// node will send. Pass: valid JSON with district "Piccadilly" in under 5 s.
// Also checks the gotcha that sending `temperature` returns a 400 on this API version.
// Reads ANTHROPIC_API_KEY from ../.env (or the environment). Never prints the key.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1); }

const DISTRICTS = ['Piccadilly', 'Northern Quarter', 'Ancoats', 'Deansgate', 'Castlefield', 'Hulme', 'Salford Quays', 'Lower Broughton'];
const body = (text, extra = {}) => ({
  model: 'claude-haiku-5-5',
  max_tokens: 1024,
  system: `You turn flood distress texts into JSON. Districts: ${DISTRICTS.join(', ')}. Urgency 1-5: raise it for children, elderly, injury or rising water.`,
  messages: [{ role: 'user', content: text }],
  output_config: { format: { type: 'json_schema', schema: {
    type: 'object', additionalProperties: false,
    required: ['district', 'landmark', 'people', 'urgency', 'hazards'],
    properties: {
      district: { type: 'string', enum: DISTRICTS },
      landmark: { type: ['string', 'null'] },
      people: { type: ['integer', 'null'] },
      urgency: { type: 'integer' },
      hazards: { type: 'array', items: { type: 'string' } },
    } } } },
  ...extra,
});
const call = (b) => fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2026-10-21' },
  body: JSON.stringify(b),
});

const t0 = performance.now();
const res = await call(body('stuck on roof w/ 2 kids near Piccadilly, water rising'));
const ms = performance.now() - t0;
const json = await res.json();
if (!res.ok) { console.log('S7 HTTP', res.status, JSON.stringify(json.error ?? json)); process.exit(1); }
// Select the text block by type: a thinking block may come first.
const parsed = JSON.parse(json.content.find((b) => b.type === 'text').text);
console.log(`S7 reply in ${ms.toFixed(0)} ms, stop_reason=${json.stop_reason}:`, JSON.stringify(parsed));
const pass = parsed.district === 'Piccadilly' && ms < 5000 && json.stop_reason !== 'refusal';

const bad = await call(body('test', { temperature: 0 }));
console.log(`Gotcha check: with temperature set → HTTP ${bad.status}${bad.status === 400 ? ' (as documented: never set it)' : ' (unexpected; note it in contracts)'}`);

console.log(pass ? 'S7 API PASS' : 'S7 API FAIL');
process.exit(pass ? 0 : 1);
