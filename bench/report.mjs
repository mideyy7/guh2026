// Renders the benchmark summary as one self-contained HTML page (inline SVG, no dependencies).
const MODE_LABEL = { hive: 'HIVE', 'central-strong': 'Central (finishes cached work)', 'central-naive': 'Central (idles when cut off)' };
const MODE_VAR = { hive: '--c-hive', 'central-strong': '--c-strong', 'central-naive': '--c-naive' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v, d = 1) => (v === null || v === undefined ? '–' : Number(v).toFixed(d));

function lineChart(summary) {
  const W = 640, H = 300, L = 48, R = 16, T = 16, B = 40;
  const pts = summary.filter((s) => s.topology === 'percent');
  const maxY = Math.max(1, ...pts.map((s) => (s.score.mean ?? 0) + (s.score.sd ?? 0))) * 1.08;
  const x = (p) => L + (p / 100) * (W - L - R), y = (v) => T + (1 - v / maxY) * (H - T - B);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(f * maxY)}" y2="${y(f * maxY)}" class="grid"/><text x="${L - 6}" y="${y(f * maxY) + 4}" class="tick" text-anchor="end">${fmt(f * maxY, 0)}</text>`).join('');
  const xt = [0, 25, 50, 75, 100].map((p) => `<text x="${x(p)}" y="${H - B + 18}" class="tick" text-anchor="middle">${p}%</text>`).join('');
  const series = Object.keys(MODE_LABEL).map((mode) => {
    const s = pts.filter((q) => q.mode === mode).sort((a, b) => a.percent - b.percent);
    if (!s.length) return '';
    const d = s.map((q, i) => `${i ? 'L' : 'M'}${x(q.percent)},${y(q.score.mean)}`).join(' ');
    const bars = s.map((q) => `<line x1="${x(q.percent)}" x2="${x(q.percent)}" y1="${y(Math.max(0, q.score.mean - q.score.sd))}" y2="${y(q.score.mean + q.score.sd)}" class="err" style="stroke:var(${MODE_VAR[mode]})"/><circle cx="${x(q.percent)}" cy="${y(q.score.mean)}" r="4" style="fill:var(${MODE_VAR[mode]})"><title>${esc(MODE_LABEL[mode])} at ${q.percent}%: ${fmt(q.score.mean)} ± ${fmt(q.score.sd)} (n=${q.runs})</title></circle>`).join('');
    return `<path d="${d}" fill="none" style="stroke:var(${MODE_VAR[mode]})" stroke-width="2.5"/>${bars}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mission score against percentage of links up, by mode">${grid}${xt}<text x="${(W + L) / 2}" y="${H - 4}" class="axis" text-anchor="middle">links up</text><text x="12" y="${H / 2}" class="axis" transform="rotate(-90 12 ${H / 2})" text-anchor="middle">mission score</text>${series}</svg>`;
}

function barChart(summary, topologies) {
  const tops = topologies.filter((t) => t.topology !== 'percent');
  const modes = Object.keys(MODE_LABEL);
  const W = 640, rowH = 22 * modes.length + 18, H = tops.length * rowH + 24, L = 190, R = 60;
  const maxV = Math.max(1, ...summary.filter((s) => s.topology !== 'percent').map((s) => s.score.mean ?? 0));
  let out = '';
  tops.forEach((t, i) => {
    const y0 = 8 + i * rowH;
    out += `<text x="0" y="${y0 + 14}" class="tlabel">${esc(t.label)}</text>`;
    modes.forEach((m, j) => {
      const s = summary.find((q) => q.topology === t.topology && q.mode === m);
      if (!s) return;
      const w = ((s.score.mean ?? 0) / maxV) * (W - L - R), yy = y0 + j * 22;
      out += `<rect x="${L}" y="${yy}" width="${Math.max(1, w)}" height="16" rx="3" style="fill:var(${MODE_VAR[m]})"><title>${esc(MODE_LABEL[m])}: ${fmt(s.score.mean)} ± ${fmt(s.score.sd)}</title></rect><text x="${L + w + 6}" y="${yy + 12}" class="tick">${fmt(s.score.mean)}</text>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mission score by outage shape and mode">${out}</svg>`;
}

export function renderReport({ summary, seeds, core, topologies }) {
  const stub = /STUB/.test(core);
  const legend = Object.entries(MODE_LABEL).map(([m, l]) => `<span><i style="background:var(${MODE_VAR[m]})"></i>${esc(l)}</span>`).join('');
  const rows = summary.map((s) => `<tr><td>${esc(MODE_LABEL[s.mode])}</td><td>${esc(s.topology)}${s.percent !== null && s.percent !== undefined ? ` ${s.percent}%` : ''}</td><td>${fmt(s.score.mean)} ± ${fmt(s.score.sd)}</td><td>${fmt(s.rescued.mean)}</td><td>${fmt(s.unrescued_urgency.mean)}</td><td>${fmt(s.duplicate_attempts.mean)}</td><td>${fmt(s.wasted_travel.mean)}</td><td>${s.converged_fraction === null ? '–' : `${Math.round(s.converged_fraction * 100)}%`}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HIVE Benchmark</title>
<style>
:root{--bg:#fff;--ink:#14181f;--muted:#5d6675;--line:#e3e7ee;--c-hive:#2563eb;--c-strong:#d97706;--c-naive:#9ca3af;--warn:#b91c1c}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1218;--ink:#e7eaf0;--muted:#98a1b0;--line:#2a303b;--c-hive:#60a5fa;--c-strong:#fbbf24;--c-naive:#6b7280;--warn:#f87171}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}.muted{color:var(--muted)}
.banner{border:2px solid var(--warn);color:var(--warn);border-radius:8px;padding:10px 12px;font-weight:600;margin:12px 0}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
svg{width:100%;height:auto;display:block}svg .grid{stroke:var(--line)}svg .tick,svg .axis,svg .tlabel{fill:var(--muted);font-size:12px}svg .tlabel{fill:var(--ink)}svg .err{stroke-width:2;opacity:.6}
.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:13px;width:100%;min-width:620px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}th{color:var(--muted);font-weight:600}
</style></head><body><main>
<h1>HIVE benchmark</h1>
<p class="muted">Same seeded scenarios, same actors, sensors and scoring in every mode. ${seeds.length} seeds per configuration (${seeds[0]}–${seeds.at(-1)}), 240 ticks each. Error bars show ±1 standard deviation across seeds.</p>
${stub ? '<div class="banner">STUB CORE: these numbers come from a placeholder actor, not HIVE. They only show that the harness works. Rerun after core/dist/hive-core.js exists.</div>' : `<p class="muted">Core: ${esc(core)}</p>`}
<div class="legend">${legend}</div>
<h2>Mission score as links fail</h2>${lineChart(summary)}
<h2>Mission score by outage shape</h2>${barChart(summary, topologies)}
<h2>All results</h2><div class="scroll"><table><thead><tr><th>Mode</th><th>Outage</th><th>Score (mean ± sd)</th><th>Rescued</th><th>Unrescued urgency</th><th>Duplicate attempts</th><th>Wasted travel</th><th>Converged after</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">"Converged after" applies to HIVE only: after the run, links are restored and gossip runs with time frozen; the share of seeds whose actors all agree within 10 gossip rounds.</p>
</main></body></html>`;
}
