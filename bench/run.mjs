// Headless benchmark: the same world and the same core functions as the live system, in one process
// with simulated time. One run = one (mode, topology, seed). Fast enough for 270 runs in seconds.
//
//   node bench/run.mjs --mode hive --topology blackout-3 --seed 1
//   node bench/run.mjs --mode central-strong --topology percent --percent 50 --seed 3 --json
//
// Per tick (mirrors the live system):
//   1. messages queued last tick are delivered (merge), if their link is still up
//   2. the world steps; distress texts reach drones in range
//   3. each actor, in id order, does exactly what the n8n hive-tick workflow does:
//      sense → perceive → bid → [hq sync] → act → world actions → applyReceipts
//   4. every gossip_ms / tick_ms ticks, each actor gossips; a message is queued only if its link is up
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createWorld } from '../world/world.mjs';
import { preset } from '../world/links.mjs';
import { createHQ } from '../world/central.mjs';
import { makeRng } from '../world/rng.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
export const PARAMS = JSON.parse(readFileSync(join(ROOT, 'contracts/params.json'), 'utf8'));
export const MODES = ['hive', 'central-naive', 'central-strong'];

export function loadCore(path) {
  const real = join(ROOT, 'core/dist/hive-core.js');
  const p = path ? resolve(path) : existsSync(real) ? real : join(ROOT, 'bench/stub-core.cjs');
  const core = require(p);
  for (const fn of ['init', 'perceive', 'bid', 'act', 'applyReceipts', 'hqRequest', 'gossip', 'merge', 'interpret', 'score', 'sharedDigest'])
    if (typeof core[fn] !== 'function') throw new Error(`core at ${p} is missing ${fn}() (contract C6)`);
  return { core, path: p, stub: !!core.STUB || p.endsWith('stub-core.cjs') };
}

// opts: {mode, topology, seed, percent, ticks, actors, core, schedule:[{at, preset, ...opts}], quietRounds,
//        onTick(t, world, state), onDeliver(t, from, to)}  (hooks are for tests)
export function runOne(opts) {
  const params = PARAMS;
  const mode = opts.mode ?? 'hive';
  if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`);
  const { core, stub, path: corePath } = opts.core ?? loadCore();
  const actors = opts.actors ?? [...params.actors.drones, ...params.actors.teams];
  const seed = Number(opts.seed ?? 1);
  const ticks = Number(opts.ticks ?? params.horizon_ticks);
  const G = Math.max(1, Math.round(params.gossip_ms / params.tick_ms));
  const flapEvery = 5;
  const rng = makeRng(seed * 7919 + 17);
  const world = createWorld(seed, params, actors);
  const hq = createHQ(core.score, params);
  const linkOpts = { seed, percent: opts.percent, isolated: opts.isolated };
  let topology = opts.topology ?? 'all-up';
  let allowed = preset(topology, actors, params, { ...linkOpts, phase: 0 });
  const schedule = [...(opts.schedule ?? [])].sort((a, b) => a.at - b.at);
  const runStats = { attempted: 0, refused: 0, delivered: 0, dropped_in_flight: 0, bytes: 0, hq_ok: 0, hq_refused: 0 };
  const recoveryStats = { attempted: 0, refused: 0, delivered: 0, dropped_in_flight: 0, bytes: 0 };
  let stats = runStats; // switched to recoveryStats after the horizon, so the two are never mixed

  const state = {};
  actors.forEach((id, i) => {
    const config = { actor_id: id, role: params.actors.drones.includes(id) ? 'drone' : 'team', mode, peers: actors.filter((a) => a !== id) };
    state[id] = core.init(config, i);
  });
  const nowMs = (t, i) => t * params.tick_ms + i; // distinct, increasing per actor within a tick
  let inbox = [];

  function deliverInbox(t) {
    const batch = inbox; inbox = [];
    for (let k = batch.length - 1; k > 0; k--) { const j = Math.floor(rng.next() * (k + 1)); [batch[k], batch[j]] = [batch[j], batch[k]]; }
    for (const m of batch) {
      if (!allowed[m.from]?.[m.to]) { stats.dropped_in_flight += 1; continue; }
      state[m.to] = core.merge(state[m.to], m.body, nowMs(t, actors.indexOf(m.to)));
      stats.delivered += 1;
      if (stats === runStats) opts.onDeliver?.(t, m.from, m.to);
    }
  }
  function gossipAll(t) {
    actors.forEach((id, i) => {
      const r = core.gossip(state[id], nowMs(t, i));
      state[id] = r.state;
      for (const msg of r.messages) {
        stats.attempted += 1;
        if (!allowed[id]?.[msg.to]) { stats.refused += 1; continue; }
        stats.bytes += JSON.stringify(msg.body).length;
        inbox.push({ from: id, to: msg.to, body: msg.body });
      }
    });
  }

  for (let t = 1; t <= ticks; t++) {
    while (schedule.length && schedule[0].at <= t) { const s = schedule.shift(); topology = s.preset; allowed = preset(topology, actors, params, { ...linkOpts, ...s, phase: 0 }); }
    if (topology === 'flapping') allowed = preset('flapping', actors, params, { ...linkOpts, phase: Math.floor(t / flapEvery) });
    deliverInbox(t);
    const deliveries = world.step();
    for (const d of deliveries) {
      const i = actors.indexOf(d.to);
      state[d.to] = core.interpret(state[d.to], null, { msg_id: d.msg_id, text: d.text, sent_tick: d.sent_tick, delivered_tick: d.delivered_tick }, nowMs(t, i));
    }
    actors.forEach((id, i) => {
      const now = nowMs(t, i);
      let s = core.perceive(state[id], { tick: t, sense: world.sense(id) }, now);
      s = core.bid(s, now);
      let hqReply = null;
      if (mode !== 'hive') {
        const body = core.hqRequest(s);
        if (body && allowed[id]?.hq && allowed.hq?.[id]) { hqReply = hq.report(body); stats.hq_ok += 1; }
        else if (body) stats.hq_refused += 1;
      }
      const r = core.act(s, { hq: hqReply }, now);
      s = r.state;
      const receipts = [];
      for (const a of r.actions) {
        if (a.kind === 'move') receipts.push({ key: a.key, kind: 'move', response: world.move(id, a.target, a.task_id, a.key) });
        else if (a.kind === 'rescue') receipts.push({ key: a.key, kind: 'rescue', response: world.rescue(id, a.survivor_id, a.key) });
      }
      state[id] = core.applyReceipts(s, receipts, now);
    });
    if (t % G === 0) gossipAll(t);
    opts.onTick?.(t, world, state);
  }

  // Recovery: links back up, time frozen, gossip only. How many gossip rounds until every actor's
  // shared state digest matches? (hack.md §6.6 budget: 10 gossip intervals.)
  let convergenceRounds = null;
  const quiet = opts.quietRounds ?? 10;
  if (mode === 'hive') {
    allowed = preset('all-up', actors, params);
    stats = recoveryStats;
    const same = () => new Set(actors.map((id) => core.sharedDigest(state[id]))).size === 1;
    if (same()) convergenceRounds = 0;
    for (let k = 1; k <= quiet && convergenceRounds === null; k++) {
      gossipAll(ticks + k); deliverInbox(ticks + k);
      if (same()) convergenceRounds = k;
    }
  }

  const m = world.metrics();
  return {
    mode, topology: opts.topology ?? 'all-up', percent: opts.percent ?? null, seed, ticks, actors: actors.length,
    core: stub ? 'STUB (not real HIVE results)' : corePath.replace(ROOT + '/', ''),
    score: m.score, rescued: m.rescued, unrescued: m.unrescued, unrescued_urgency: m.unrescued_urgency, not_yet_appeared: m.not_yet_appeared,
    urgency_weighted_time_to_rescue: m.urgency_weighted_time_to_rescue,
    duplicate_attempts: m.duplicate_attempts, wasted_travel: m.wasted_travel_total,
    messages: runStats, recovery_messages: recoveryStats, convergence_rounds: convergenceRounds, converged: mode === 'hive' ? convergenceRounds !== null : null,
  };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = argv[i].startsWith('--') && argv[i].includes('=') ? argv[i].slice(2).split('=') : [argv[i].slice(2), argv[i + 1]];
    if (!argv[i].includes('=') && k !== 'json') i++;
    o[k] = k === 'json' ? true : v;
  }
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  const res = runOne({ mode: a.mode, topology: a.topology, seed: a.seed, percent: a.percent && Number(a.percent), ticks: a.ticks, core: a.core && loadCore(a.core) });
  if (a.out) { mkdirSync(dirname(resolve(a.out)), { recursive: true }); writeFileSync(a.out, JSON.stringify(res, null, 2)); }
  console.log(a.json ? JSON.stringify(res) : res);
}
