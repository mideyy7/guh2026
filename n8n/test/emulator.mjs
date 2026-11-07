// A tiny n8n interpreter, for tests only. It executes a built workflow JSON the way n8n's
// "v1" execution order does, for the node types HIVE uses: Webhook, Schedule Trigger,
// Code (run once for all items), HTTP Request, IF. HTTP calls go to a caller-supplied
// handler, so each actor can have its own in-memory store/sim/proxy (one network each).
// It is NOT n8n: node-schema details are only proven by spike S2 on real containers.
// What it does prove: the wiring, the expressions and the Code nodes work together.
import vm from 'node:vm';

const items = (arr) => arr.map((json) => ({ json }));

function makeDollar(outputs) {
  return (name) => {
    const out = outputs[name];
    return {
      get isExecuted() { return out !== undefined; },
      first: () => { if (!out) throw new Error(`Node '${name}' hasn't been executed`); return out[0]; },
      all: () => { if (!out) throw new Error(`Node '${name}' hasn't been executed`); return out; },
    };
  };
}

function evalExpr(value, ctx) {
  if (typeof value !== 'string' || !value.startsWith('=')) return value;
  const s = value.slice(1);
  const run = (src) => vm.runInNewContext(`(${src})`, { ...ctx, JSON, Math, Date, String, Number });
  const whole = s.match(/^\{\{([\s\S]*)\}\}$/);
  if (whole && !whole[1].includes('}}')) return run(whole[1]);
  return s.replace(/\{\{([\s\S]+?)\}\}/g, (_, e) => String(run(e)));
}

const scripts = new Map();   // compile each Code node once; run it in a fresh context each time
async function runCode(node, input, outputs) {
  const ctx = vm.createContext({ $: makeDollar(outputs), $input: { all: () => input, first: () => input[0] }, console, Date, JSON, Math });
  const js = node.parameters.jsCode;
  if (!scripts.has(js)) scripts.set(js, new vm.Script(`(async () => {\n${js}\n})()`));
  const res = await scripts.get(js).runInContext(ctx);
  if (!Array.isArray(res)) throw new Error(`Code node '${node.name}' must return an array`);
  return res.map((r) => ({ json: JSON.parse(JSON.stringify(r.json)) }));   // n8n serialises items
}

async function runHttp(node, input, outputs, http) {
  const p = node.parameters;
  const out = [];
  for (const item of input) {
    const ctx = { $json: item.json, $: makeDollar(outputs) };
    const url = evalExpr(p.url, ctx);
    const method = p.method || 'GET';
    const body = p.sendBody ? JSON.parse(evalExpr(p.jsonBody, ctx)) : undefined;
    let res;
    try { res = await http(method, url, body); } catch (e) { res = { status: 599, json: { message: String(e.message) } }; }
    if (res.status >= 400) {
      if (node.onError === 'continueRegularOutput') { out.push({ json: { error: { status: res.status, message: res.json?.error || 'error' } } }); continue; }
      const err = new Error(`${node.name}: HTTP ${res.status} ${JSON.stringify(res.json)}`); err.status = res.status; throw err;
    }
    out.push({ json: res.json ?? {} });
  }
  return out;
}

function runIf(node, input, outputs) {
  const t = [], f = [];
  const { conditions, combinator } = node.parameters.conditions;
  for (const item of input) {
    const ctx = { $json: item.json, $: makeDollar(outputs) };
    const results = conditions.map((c) => {
      const left = evalExpr(c.leftValue, ctx);
      const op = c.operator;
      if (op.type === 'boolean' && op.operation === 'true') return left === true;
      if (op.type === 'boolean' && op.operation === 'false') return left === false;
      if (op.type === 'string' && op.operation === 'equals') return left === evalExpr(c.rightValue, ctx);
      throw new Error(`emulator: unsupported IF operator ${JSON.stringify(op)}`);
    });
    (combinator === 'or' ? results.some(Boolean) : results.every(Boolean)) ? t.push(item) : f.push(item);
  }
  return [t, f];
}

// trigger: the JSON for the trigger node's single output item.
// Returns { outputs: {nodeName: items}, order: [nodeName] }. Throws if a node errors.
export async function execute(workflow, trigger, http) {
  const byName = Object.fromEntries(workflow.nodes.map((n) => [n.name, n]));
  const start = workflow.nodes.find((n) => /webhook|scheduleTrigger/.test(n.type));
  const outputs = {}, order = [];
  outputs[start.name] = items([trigger]); order.push(start.name);

  async function fire(name) {
    for (const [idx, targets] of (workflow.connections[name]?.main || []).entries()) {
      const data = idx === 0 && outputs[name].__branches === undefined ? outputs[name] : outputs[name].__branches?.[idx];
      if (!data || data.length === 0) continue;
      for (const t of targets) await runNode(byName[t.node], data);
    }
  }
  async function runNode(node, input) {
    let out;
    if (node.type === 'n8n-nodes-base.code') out = await runCode(node, input, outputs);
    else if (node.type === 'n8n-nodes-base.httpRequest') out = await runHttp(node, input, outputs, http);
    else if (node.type === 'n8n-nodes-base.if') { const [t, f] = runIf(node, input, outputs); out = [...t]; out.__branches = [t, f]; }
    else throw new Error(`emulator: unsupported node type ${node.type}`);
    outputs[node.name] = out; order.push(node.name);
    await fire(node.name);
  }
  await fire(start.name);
  return { outputs, order };
}

// ---- in-memory services, matching contracts C1 (store) and C3 (proxy) ----
export function makeStore(config) {
  let version = 0, state = null, conflicts = 0;
  return {
    get conflicts() { return conflicts; },
    get state() { return state; },
    handle(method, path, body) {
      if (method === 'GET' && path === '/state') return { status: 200, json: JSON.parse(JSON.stringify({ config, version, state })) };
      if (method === 'GET' && path === '/config') return { status: 200, json: config };
      if (method === 'GET' && path === '/health') return { status: 200, json: { ok: true, conflicts, ...config } };
      if (method === 'PUT' && path === '/state') {
        if (body.version !== version) { conflicts += 1; return { status: 409, json: { error: 'stale version', current: version } }; }
        version += 1; state = JSON.parse(JSON.stringify(body.state)); return { status: 200, json: { version } };
      }
      if (method === 'POST' && path === '/reset') { version = 0; state = null; return { status: 200, json: { version: 0 } }; }
      return { status: 404, json: { error: 'not found' } };
    },
  };
}
