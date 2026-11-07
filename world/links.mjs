// Link presets: who can reach whom. Pure; shared by the chaos proxy and the headless benchmark so
// both use exactly the same outage shapes.
//
// HQ policy (documented for benchmark fairness): HQ is reached over the phone network.
//   all-up          peers all up,                         HQ up for everyone
//   blackout-3      peers only within the 3 islands,      HQ down for everyone   (the demo)
//   drones-vs-teams peers only within drones / teams,     HQ down for everyone
//   isolate-one     team-1 has no links at all,           HQ up for everyone else
//   flapping        blackout-3, cross-island links up on odd phases, HQ down
//   percent         seeded random p% of peer links up,    each actor's HQ link up with probability p
import { makeRng } from './rng.mjs';

export const PRESETS = ['all-up', 'blackout-3', 'drones-vs-teams', 'isolate-one', 'flapping', 'percent'];

export function nodesFor(actors) { return [...actors, 'hq']; }

function matrix(nodes, fn) {
  const allowed = {};
  for (const a of nodes) { allowed[a] = {}; for (const b of nodes) if (a !== b) allowed[a][b] = !!fn(a, b); }
  return allowed;
}

export function islandOf(params, actor) {
  const isl = params.islands['blackout-3'];
  const i = isl.findIndex((group) => group.includes(actor));
  return i;
}

// opts: { seed, percent (0-100), phase (integer, for flapping), isolated (actor for isolate-one) }
export function preset(name, actors, params, opts = {}) {
  const nodes = nodesFor(actors);
  const isHq = (x) => x === 'hq';
  const role = (x) => (params.actors.drones.includes(x) ? 'drone' : 'team');
  const sameIsland = (a, b) => islandOf(params, a) === islandOf(params, b);
  switch (name) {
    case 'all-up':
      return matrix(nodes, () => true);
    case 'blackout-3':
      return matrix(nodes, (a, b) => !isHq(a) && !isHq(b) && sameIsland(a, b));
    case 'drones-vs-teams':
      return matrix(nodes, (a, b) => !isHq(a) && !isHq(b) && role(a) === role(b));
    case 'isolate-one': {
      const lone = opts.isolated ?? 'team-1';
      return matrix(nodes, (a, b) => a !== lone && b !== lone);
    }
    case 'flapping': {
      const crossUp = (opts.phase ?? 0) % 2 === 1;
      return matrix(nodes, (a, b) => !isHq(a) && !isHq(b) && (sameIsland(a, b) || crossUp));
    }
    case 'percent': {
      const p = Math.max(0, Math.min(100, Number(opts.percent ?? 100))) / 100;
      const rng = makeRng(opts.seed ?? 1);
      const up = {};
      // Undirected: decide each unordered pair once, in a fixed order, so the result is seed-stable.
      const sorted = [...actors].sort();
      for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) up[`${sorted[i]}|${sorted[j]}`] = rng.next() < p;
      for (const a of sorted) up[`${a}|hq`] = rng.next() < p;
      const key = (a, b) => (isHq(b) ? `${a}|hq` : isHq(a) ? `${b}|hq` : a < b ? `${a}|${b}` : `${b}|${a}`);
      return matrix(nodes, (a, b) => up[key(a, b)]);
    }
    default:
      throw Object.assign(new Error(`unknown preset "${name}" (known: ${PRESETS.join(', ')})`), { status: 400 });
  }
}

// Connected components over links that are up in BOTH directions. Used by the dashboard and tests.
export function islands(allowed, { includeHq = false } = {}) {
  const nodes = Object.keys(allowed).filter((n) => includeHq || n !== 'hq');
  const seen = new Set(), out = [];
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const comp = [], stack = [start]; seen.add(start);
    while (stack.length) {
      const n = stack.pop(); comp.push(n);
      for (const m of nodes) if (!seen.has(m) && allowed[n]?.[m] && allowed[m]?.[n]) { seen.add(m); stack.push(m); }
    }
    out.push(comp.sort());
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export const upCount = (allowed) => Object.values(allowed).reduce((s, row) => s + Object.values(row).filter(Boolean).length, 0);
