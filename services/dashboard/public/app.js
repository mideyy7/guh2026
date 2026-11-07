// HIVE dashboard UI. Read-only observer: renders /api/snapshot; the only writes are scenario
// controls and outage settings (never assignments).
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('map'), ctx = canvas.getContext('2d');
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const ISL = ['--i0', '--i1', '--i2', '--i3', '--i4', '--i5', '--i6'];
  const short = (id) => (id.startsWith('drone') ? 'D' : 'T') + id.split('-')[1];

  let config = null, snap = null, logSince = 0, evSince = 0;
  const flashes = []; // {a, b, until}
  const feed = [];
  let prevViews = {};
  let convCheck = null; // {started, done, ms}
  let linkHit = [];     // [{a, b, x1, y1, x2, y2}]

  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) addFeed(null, `${path}: ${j.error || r.status}`, 'bad');
    return j;
  }

  function addFeed(tick, text, cls = '') {
    feed.unshift({ tick, text, cls });
    if (feed.length > 200) feed.length = 200;
  }

  function islandIndex(id) {
    const isl = snap?.links?.islands || [];
    const i = isl.findIndex((g) => g.includes(id));
    return i < 0 ? 5 : i % ISL.length;
  }

  // ── map ───────────────────────────────────────────────────────────────
  function cellXY(cell, G, S) { const [x, y] = typeof cell === 'string' ? cell.split('-').map(Number) : [cell.x, cell.y]; return { cx: (x + 0.5) * S, cy: (y + 0.5) * S, x, y }; }

  function draw() {
    if (!config || !snap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth; canvas.width = W * dpr; canvas.height = W * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const G = config.grid, S = W / G;
    ctx.clearRect(0, 0, W, W);
    // Districts: flood shading + names.
    for (const d of config.districts) {
      ctx.fillStyle = css('--water'); ctx.globalAlpha = 0.06 + d.flood * 0.16;
      ctx.fillRect(d.x[0] * S, d.y[0] * S, (d.x[1] - d.x[0] + 1) * S, (d.y[1] - d.y[0] + 1) * S);
      ctx.globalAlpha = 1; ctx.fillStyle = css('--muted'); ctx.font = `${Math.max(9, S * 0.16)}px system-ui`;
      ctx.fillText(d.name, d.x[0] * S + 4, d.y[0] * S + Math.max(11, S * 0.2));
    }
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
    for (let i = 0; i <= G; i++) { ctx.beginPath(); ctx.moveTo(i * S, 0); ctx.lineTo(i * S, W); ctx.moveTo(0, i * S); ctx.lineTo(W, i * S); ctx.stroke(); }

    const w = snap.world;
    if (w) {
      // Survivors (ground truth): waiting = red ring with urgency; rescued = faded green.
      const sending = new Set(w.distress.filter((m) => m.state === 'sending').map((m) => m.survivor_id));
      for (const s of w.survivors) {
        if (s.state === 'not_yet') continue;
        const { cx, cy } = cellXY(s.cell, G, S);
        const r = S * 0.18;
        ctx.beginPath(); ctx.arc(cx + S * 0.22, cy + S * 0.22, r, 0, Math.PI * 2);
        if (s.state === 'rescued') { ctx.fillStyle = css('--ok'); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; }
        else { ctx.lineWidth = 2; ctx.strokeStyle = css('--bad'); ctx.stroke(); ctx.fillStyle = css('--bad'); ctx.font = `bold ${S * 0.18}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(String(s.urgency), cx + S * 0.22, cy + S * 0.28); ctx.textAlign = 'left'; }
        if (sending.has(s.id)) { ctx.fillStyle = css('--warn'); ctx.font = `${S * 0.16}px system-ui`; ctx.fillText('…', cx + S * 0.34, cy + S * 0.08); }
      }
      // Actor positions, offset when several share a cell.
      const pos = {}, perCell = {};
      for (const a of w.actors) { const k = `${a.pos.x}-${a.pos.y}`; const i = (perCell[k] = (perCell[k] || 0) + 1) - 1; const p = cellXY(a.pos, G, S); pos[a.id] = { x: p.cx - S * 0.18 + (i % 3) * S * 0.18, y: p.cy - S * 0.18 + Math.floor(i / 3) * S * 0.2, a }; }
      // Links between actors: faint when up, red dashed when cut, bright when a message was just delivered.
      linkHit = [];
      const allowed = snap.links?.allowed || {};
      const ids = w.actors.map((a) => a.id);
      const now = Date.now();
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j], p = pos[a], q = pos[b];
        const up = allowed[a]?.[b] && allowed[b]?.[a];
        const flash = flashes.some((f) => f.until > now && ((f.a === a && f.b === b) || (f.a === b && f.b === a)));
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
        ctx.setLineDash(up ? [] : [5, 4]);
        ctx.strokeStyle = flash ? css('--ok') : up ? css('--line') : css('--bad');
        ctx.lineWidth = flash ? 3 : up ? 1 : 1.5;
        ctx.globalAlpha = up && !flash ? 0.7 : 1; ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
        linkHit.push({ a, b, x1: p.x, y1: p.y, x2: q.x, y2: q.y });
      }
      // Targets and actors.
      for (const { x, y, a } of Object.values(pos)) {
        if (a.target) { const t = cellXY(a.target, G, S); ctx.setLineDash([3, 3]); ctx.strokeStyle = css(a.role === 'drone' ? '--drone' : '--team'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t.cx, t.cy); ctx.stroke(); ctx.setLineDash([]); }
        const view = snap.actors.find((v) => v.actor_id === a.id);
        ctx.fillStyle = css(ISL[islandIndex(a.id)]);
        ctx.strokeStyle = css(a.role === 'drone' ? '--drone' : '--team'); ctx.lineWidth = 2;
        const r = S * 0.13;
        ctx.beginPath();
        if (a.role === 'drone') ctx.arc(x, y, r, 0, Math.PI * 2); else ctx.rect(x - r, y - r, r * 2, r * 2);
        ctx.fill(); ctx.stroke();
        if (view?.stale) { ctx.strokeStyle = css('--warn'); ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        ctx.fillStyle = '#fff'; ctx.font = `bold ${S * 0.12}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(short(a.id), x, y + S * 0.045); ctx.textAlign = 'left';
      }
    }
  }

  // Click-to-cut: nearest link segment within 10px.
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best = null;
    for (const l of linkHit) {
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0.15, Math.min(0.85, ((px - l.x1) * dx + (py - l.y1) * dy) / len2));
      const d = Math.hypot(px - (l.x1 + t * dx), py - (l.y1 + t * dy));
      if (d < 10 && (!best || d < best.d)) best = { ...l, d };
    }
    if (best) api('POST', '/api/proxy/toggle', { a: best.a, b: best.b }).then(() => addFeed(snap?.world?.tick, `link ${best.a} ↔ ${best.b} toggled by observer`, 'warn'));
  });

  // ── panels ────────────────────────────────────────────────────────────
  function renderPanels() {
    const w = snap.world, m = snap.metrics, l = snap.links;
    $('tick').textContent = `tick ${w?.tick ?? '–'}`;
    const rs = $('runstate'); rs.textContent = w ? (w.running ? 'running' : 'paused') : 'sim offline'; rs.className = 'pill ' + (w ? (w.running ? 'ok' : '') : 'bad');
    const pr = $('preset'); pr.textContent = l ? `links: ${l.preset}${l.preset === 'flapping' ? ` (phase ${l.phase})` : ''} · ${l.islands.length} island${l.islands.length === 1 ? '' : 's'}` : 'proxy offline'; pr.className = 'pill ' + (l ? (l.islands.length > 1 ? 'warn' : 'ok') : 'bad');
    const cv = $('conv'), c = snap.convergence;
    if (convCheck && !convCheck.done) {
      const el = (Date.now() - convCheck.started) / 1000;
      if (c.converged) { convCheck.done = true; convCheck.ms = Date.now() - convCheck.started; addFeed(w?.tick, `converged in ${(convCheck.ms / 1000).toFixed(1)} s`, 'ok'); }
      else if (el > (config.gossip_ms * 10) / 1000) { convCheck.done = true; convCheck.ms = null; addFeed(w?.tick, `NOT converged within 10 gossip intervals (${el.toFixed(0)} s)`, 'bad'); }
      cv.textContent = convCheck.done ? (convCheck.ms ? `converged in ${(convCheck.ms / 1000).toFixed(1)} s` : 'convergence TIMEOUT') : `checking… ${el.toFixed(0)} s`;
      cv.className = 'pill ' + (convCheck.done ? (convCheck.ms ? 'ok' : 'bad') : 'warn');
    } else if (!convCheck) {
      const n = snap.actors.filter((a) => a.view?.digest).length;
      cv.textContent = n === 0 ? 'no actor state yet' : c.converged ? 'views agree' : `${c.diverged.length} diverged`;
      cv.className = 'pill ' + (n === 0 ? '' : c.converged ? 'ok' : 'warn');
    }

    const metric = (label, value) => `<div class="metric"><b>${value}</b><span>${label}</span></div>`;
    $('metrics').innerHTML = m ? [
      metric('mission score', m.score.toFixed(1)), metric('rescued', m.rescued), metric('waiting (urgency)', `${m.unrescued} (${m.unrescued_urgency})`),
      metric('duplicate attempts', m.duplicate_attempts), metric('wasted travel', m.wasted_travel_total),
      metric('texts sending / delivered', `${m.distress.waiting} / ${m.distress.delivered}`),
    ].join('') : metric('simulator', 'offline');

    $('cards').innerHTML = snap.actors.map((a) => {
      const v = a.view;
      const div = v?.digest && snap.convergence.majority && v.digest !== snap.convergence.majority;
      const badges = [a.stale ? '<span class="badge stale">stale</span>' : '', v?.digest ? (div ? '<span class="badge div">diverged</span>' : '<span class="badge same">agrees</span>') : '', a.conflicts ? `<span class="badge div">${a.conflicts} conflicts</span>` : ''].join(' ');
      const row = (k, val) => `<div class="row"><span>${k}</span><span>${val}</span></div>`;
      const owners = v?.owners ? Object.entries(v.owners).filter(([, o]) => o).length : 0;
      return `<article class="card" style="--isl: var(${ISL[islandIndex(a.actor_id)]})">
        <h3><span>${a.actor_id}</span><span>${badges}</span></h3>
        ${v ? [row('action', `${v.action}${v.target ? ` → ${v.target.x}-${v.target.y}` : ''}`), row('bundle', v.bundle?.join(', ') || '–'), row('known tasks', `${v.known_tasks ?? 0} (${v.provisional ?? 0} provisional)`), row('owned tasks it knows of', owners), row('digest', v.digest || '–')].join('')
            : `<div class="muted">${a.reachable ? 'no state yet (workflows not running)' : 'store unreachable'}</div>`}
      </article>`;
    }).join('');

    $('feed').innerHTML = feed.slice(0, 120).map((f) => `<li class="${f.cls}"><span class="t">${f.tick ?? ''}</span><span>${f.text.replace(/</g, '&lt;')}</span></li>`).join('');
    $('errors').textContent = [snap.errors.sim && `sim: ${snap.errors.sim}`, snap.errors.proxy && `proxy: ${snap.errors.proxy}`].filter(Boolean).join(' · ');
  }

  function ingest(next) {
    const tick = next.world?.tick;
    for (const e of next.log) {
      logSince = Math.max(logSince, e.n);
      if (e.status === 'delivered' && !e.rpc) flashes.push({ a: e.from, b: e.to, until: Date.now() + 1200 });
      if (e.status === 'refused' || e.status === 'dropped') addFeed(tick, `${e.from} → ${e.to} ${e.status}${e.reason ? ` (${e.reason})` : ''}`, 'bad');
    }
    while (flashes.length && flashes[0].until < Date.now() - 2000) flashes.shift();
    for (const e of next.events) {
      evSince = Math.max(evSince, e.n);
      if (e.kind === 'distress_delivered') addFeed(e.tick, `text reached ${e.to}: "${e.text}"`, 'warn');
      else if (e.kind === 'rescue_attempt') addFeed(e.tick, `${e.actor} rescue ${e.survivor_id}: ${e.result}`, e.result === 'rescued' ? 'ok' : 'bad');
      else if (e.kind === 'distress_retry') addFeed(e.tick, `text to ${e.to} failed, still sending (${e.reason})`, 'bad');
      else if (e.kind === 'horizon_reached') addFeed(e.tick, 'horizon reached, run complete', 'ok');
    }
    for (const a of next.actors) {
      const v = a.view, p = prevViews[a.actor_id];
      if (v && p && (v.action !== p.action || JSON.stringify(v.bundle) !== JSON.stringify(p.bundle)))
        addFeed(tick, `${a.actor_id}: ${v.action}${v.bundle?.length ? ` · bundle [${v.bundle.join(', ')}]` : ''}`);
      prevViews[a.actor_id] = v;
    }
    snap = next;
  }

  async function poll() {
    try {
      const next = await (await fetch(`/api/snapshot?log_since=${logSince}&events_since=${evSince}`)).json();
      ingest(next); renderPanels(); draw();
    } catch (e) { $('errors').textContent = `dashboard server unreachable: ${e.message}`; }
  }

  // ── controls ──────────────────────────────────────────────────────────
  $('btn-start').onclick = () => { convCheck = null; api('POST', '/api/sim/control/start'); };
  $('btn-pause').onclick = () => api('POST', '/api/sim/control/pause');
  $('btn-step').onclick = () => api('POST', '/api/sim/control/step', { n: 1 });
  $('btn-reset').onclick = async () => { convCheck = null; feed.length = 0; prevViews = {}; logSince = 0; evSince = 0; await api('POST', '/api/reset', { seed: Number($('seed').value) || 1 }); addFeed(0, `reset with seed ${$('seed').value}`, 'ok'); };
  $('btn-blackout').onclick = () => api('POST', '/api/proxy/preset', { name: 'blackout-3' }).then(() => addFeed(snap?.world?.tick, 'BLACKOUT: network split into 3 islands, HQ unreachable', 'bad'));
  $('btn-restore').onclick = () => api('POST', '/api/proxy/preset', { name: 'all-up' }).then(() => addFeed(snap?.world?.tick, 'RESTORE: all links up', 'ok'));
  $('preset-select').onchange = (e) => {
    const name = e.target.value;
    const body = { name };
    if (name === 'percent') { const p = Number(prompt('Percent of links up (0-100)', '50')); if (!Number.isFinite(p)) return; body.percent = p; body.seed = Number($('seed').value) || 1; }
    api('POST', '/api/proxy/preset', body).then(() => addFeed(snap?.world?.tick, `links preset: ${name}${body.percent !== undefined ? ` ${body.percent}%` : ''}`, 'warn'));
  };
  $('btn-converge').onclick = async () => { await api('POST', '/api/sim/control/pause'); convCheck = { started: Date.now(), done: false }; addFeed(snap?.world?.tick, 'paused; timing convergence (budget: 10 gossip intervals)', 'warn'); };

  window.addEventListener('resize', draw);
  fetch('/api/config').then((r) => r.json()).then((c) => { config = c; poll(); setInterval(poll, 1000); });
})();
