# Live end-to-end tests

These scripts drive the **running** stack through the dashboard API at `http://localhost:8000/api`. They need Docker, all 7 actors deployed (`scripts/deploy-workflows.sh`) and Dev A's `lib.mjs`.

| Script | Gate | What it checks |
|---|---|---|
| `smoke.mjs` | Phase 2 | 10 ticks: every store reaches tick ≥ 9, 0 conflicts |
| `checkpoint8.mjs` | Gate 2 | a drone finds, a team rescues; a cut link stops sync; replay is harmless; 0 conflicts |
| `checkpoint14.mjs` | Gate 3 | 3-island blackout: every island rescues, 0 cross-island deliveries; reconnect converges in 40 s; one owner per task |
| `ai.mjs` | Gate 4.1 | 5 distress texts → 5 provisional tasks, at least 4 confirmed by a sensor |
| `central.mjs` | Gate 4.2 | `MODE=central-naive`: teams stop when HQ is cut. `MODE=central-strong`: teams finish their task, then idle |
| `acceptance.mjs` | Gate 5 | every row of hack.md §6.6, twice in a row |

The pass/fail logic lives in [checks.mjs](checks.mjs) as pure functions over snapshots. [core/test/e2e-checks.test.mjs](../../core/test/e2e-checks.test.mjs) runs them against the in-memory 7-actor system, which proves each check passes on a good run and fails on a broken one before any live run.

## What `lib.mjs` must export (Dev A)

Each function is `async` and talks to the dashboard API.

| Export | Does |
|---|---|
| `reset(seed)` | `POST /api/reset {seed}`: reset the sim, `POST /reset` on all 7 stores, links to all-up |
| `start()`, `pause()` | `POST /api/sim/control/start` / `pause` |
| `waitTicks(n)` | resolve once the world tick has advanced by `n` |
| `world()` | `GET /api/sim/world` (at least `{tick}`) |
| `metrics()` | `GET /api/sim/metrics`: `{rescued, duplicate_rescues, wasted_travel, ...}` |
| `actors()` | `GET /api/actors`: the 7 `state.view` objects, **each with `conflicts`** from that store's `/health`, plus `polled_at` and `stale` |
| `preset(name, opts?)` | `POST /api/proxy/preset {name, ...opts}` |
| `links()` | `GET /api/proxy/links` |
| `setLinks(patch)` | `PUT /api/proxy/links` with a partial body (`{allowed}`, `{duplicate_rate}`, `{reorder}`…); fields left out stay as they are |
| `log(since)` | `GET /api/proxy/log?since=n` |
| `distress({text, cell})` | inject one distress text now. The sim delivers it to the nearest drone within `distress_radius` (C2) |

The view fields the checks use are all in `state.view` (contract C5): `digest`, `owners`, `bundle`, `vv`, `seq`, `rescues` (`{survivor_id, task_id, by, found_by, tick}`), `attempts`, `text_tasks` and `text_confirmed`.
