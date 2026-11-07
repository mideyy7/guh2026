// Full benchmark matrix: modes × topologies × seeds, then summary.csv/.json and an HTML report.
//
//   node bench/matrix.mjs                 # reported seeds 1-10 (hack.md §7)
//   node bench/matrix.mjs --seeds 11-20   # tuning seeds, kept separate from the reported ones
//   node bench/matrix.mjs --quick         # 2 seeds, for a smoke check
//
// Outputs (bench/results/): raw/<mode>__<topology>__s<seed>.json, summary.json, summary.csv, report.html
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOne, loadCore, MODES } from './run.mjs';
import { renderReport } from './report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TOPOLOGIES = [
  { topology: 'blackout-3', label: 'Balanced islands (blackout-3)' },
  { topology: 'drones-vs-teams', label: 'Drones cut off from teams' },
  { topology: 'isolate-one', label: 'One team isolated' },
  { topology: 'flapping', label: 'Flapping links' },
  ...[100, 75, 50, 25, 0].map((p) => ({ topology: 'percent', percent: p, label: `${p}% of links up` })),
];
const METRICS = ['score', 'rescued', 'unrescued', 'unrescued_urgency', 'urgency_weighted_time_to_rescue', 'duplicate_attempts', 'wasted_travel', 'bytes', 'convergence_rounds'];

const stat = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  if (!v.length) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
  const r = (x) => Math.round(x * 100) / 100;
  return { n: v.length, mean: r(mean), sd: r(sd), min: r(Math.min(...v)), max: r(Math.max(...v)) };
};

export function summarize(results) {
  const groups = {};
  for (const r of results) {
    const key = `${r.mode}|${r.topology}|${r.percent ?? ''}`;
    (groups[key] ||= []).push(r);
  }
  return Object.values(groups).map((rs) => {
    const s = { mode: rs[0].mode, topology: rs[0].topology, percent: rs[0].percent, runs: rs.length, core: rs[0].core };
    for (const m of METRICS) s[m] = stat(rs.map((r) => (m === 'bytes' ? r.messages.bytes : r[m])));
    s.converged_fraction = rs[0].mode === 'hive' ? Math.round((rs.filter((r) => r.converged).length / rs.length) * 100) / 100 : null;
    s.seeds = rs.map((r) => r.seed);
    s.per_seed_score = rs.map((r) => r.score);
    return s;
  });
}

export function toCsv(summary) {
  const cols = ['mode', 'topology', 'percent', 'runs', ...METRICS.flatMap((m) => [`${m}_mean`, `${m}_sd`, `${m}_min`, `${m}_max`]), 'converged_fraction', 'core'];
  const rows = summary.map((s) => cols.map((c) => {
    const m = c.match(/^(.*)_(mean|sd|min|max)$/);
    const v = m && s[m[1]] && typeof s[m[1]] === 'object' ? s[m[1]][m[2]] : s[c];
    return v === null || v === undefined ? '' : String(v).includes(',') ? `"${v}"` : v;
  }).join(','));
  return [cols.join(','), ...rows].join('\n') + '\n';
}

function parseSeeds(spec) {
  const [a, b] = String(spec).split('-').map(Number);
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/^(?!\/)/, process.cwd() + '/')) {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const seedsArg = args[args.indexOf('--seeds') + 1];
  const seeds = args.includes('--seeds') ? parseSeeds(seedsArg) : quick ? [1, 2] : parseSeeds('1-10');
  const out = join(ROOT, 'bench/results', args.includes('--seeds') && seeds[0] > 10 ? 'tuning' : '');
  mkdirSync(join(out, 'raw'), { recursive: true });
  const core = loadCore();
  console.log(`core: ${core.stub ? 'STUB (results are NOT real HIVE numbers)' : core.path}`);
  const t0 = Date.now(), results = [];
  const total = MODES.length * TOPOLOGIES.length * seeds.length;
  for (const mode of MODES) for (const t of TOPOLOGIES) for (const seed of seeds) {
    const r = runOne({ mode, topology: t.topology, percent: t.percent, seed, core });
    r.label = t.label;
    results.push(r);
    writeFileSync(join(out, 'raw', `${mode}__${t.topology}${t.percent !== undefined ? t.percent : ''}__s${seed}.json`), JSON.stringify(r, null, 2));
    if (results.length % 30 === 0) console.log(`  ${results.length}/${total} runs (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const summary = summarize(results);
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ generated_at: new Date().toISOString(), seeds, core: results[0].core, summary }, null, 2));
  writeFileSync(join(out, 'summary.csv'), toCsv(summary));
  writeFileSync(join(out, 'report.html'), renderReport({ summary, seeds, core: results[0].core, topologies: TOPOLOGIES }));
  console.log(`${results.length} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${out.replace(ROOT + '/', '')}/summary.csv, summary.json, report.html`);
}
