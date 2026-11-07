// Spike S4 pre-check (no Docker): run the core the way an n8n 2.x Code node does.
// The task runner wraps user code in an async function inside a sandbox with no
// `module`, no `require` and no `process`. We reproduce that with node:vm, then:
//   1. check HiveCBBA/HiveEvents are usable (the plan's pass expression), and
//   2. time a ~300 KB JSON round-trip through the "node" (must be < 200 ms).
// The real S4 pass still has to be confirmed in a live n8n Code node.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const core = ['events.js', 'cbba.js']
  .map((f) => readFileSync(new URL(`../core/src/${f}`, import.meta.url), 'utf8'))
  .join('\n');

function runCodeNode(userCode, items) {
  const sandbox = { $input: { all: () => items }, console };
  const ctx = vm.createContext(sandbox);
  const wrapped = `(async () => {\n${userCode}\n})()`;
  return vm.runInContext(wrapped, ctx, { timeout: 5000 });
}

// 1. The plan's pass expression.
const check = await runCodeNode(
  `${core}\nreturn [{ json: { ok: typeof HiveCBBA.receive === 'function' && typeof HiveEvents.receive === 'function',
     moduleDefined: typeof module !== 'undefined', requireDefined: typeof require !== 'undefined' } }];`,
  [],
);
console.log('S4 check:', JSON.stringify(check[0].json));

// 2. A ~300 KB state through the node: parse in, mutate with the core, serialise out.
const E = (await import('../core/src/events.js')).default;
const log = E.emptyLog();
let i = 0;
while (JSON.stringify(log).length < 300_000) E.emit(log, `drone-${(i % 4) + 1}`, 'CELL_SEARCHED', { cell: `${i % 8}-${(i >> 3) % 8}` }, i++);
const payload = JSON.stringify({ version: 1, state: { log } });

const runs = [];
for (let r = 0; r < 20; r++) {
  const t0 = performance.now();
  const out = await runCodeNode(
    `${core}\nconst s = JSON.parse(JSON.stringify($input.all()[0].json));\nHiveEvents.emit(s.state.log, 'drone-1', 'CELL_SEARCHED', { cell: '0-0' }, 999);\nreturn [{ json: s }];`,
    [{ json: JSON.parse(payload) }],
  );
  JSON.stringify(out[0].json);
  runs.push(performance.now() - t0);
}
runs.sort((a, b) => a - b);
const p50 = runs[10].toFixed(1), worst = runs.at(-1).toFixed(1);
console.log(`S4 round-trip: ${(payload.length / 1024).toFixed(0)} KB, ${i} events, p50 ${p50} ms, worst ${worst} ms`);

const pass = check[0].json.ok && !check[0].json.moduleDefined && runs.at(-1) < 200;
console.log(pass ? 'S4 PRE-CHECK PASS' : 'S4 PRE-CHECK FAIL');
process.exit(pass ? 0 : 1);
