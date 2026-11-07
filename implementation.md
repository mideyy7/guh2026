# HIVE — Implementation Plan

**Companion to [hack.md](hack.md).** `hack.md` says *what* HIVE is and *why*. This file says *how to build it*: what to install, who builds what, in what order, and the test that must pass before each phase is done.

**Team:** 2 developers.
- **Dev A — World & Infrastructure:** everything the actors live inside. Docker, simulator, chaos proxy, actor stores, the central dispatcher, the dashboard and the benchmark harness.
- **Dev B — Actor Brain:** everything the actors *think* with. The pure decision logic (events, CBBA, movement, central-mode behaviour), the n8n workflows, the AI distress-text parser and the acceptance tests.

The two halves meet only at the **contracts** you agree in Phase 0 (§3). Inside each phase, neither dev waits for the other.

**Scope:** the full plan from `hack.md`: 7 actors (4 drones, 3 teams), blackout into 3 islands, AI distress parsing, click-to-cut links, all three benchmark modes and the full acceptance suite. Nothing is cut.

---

## Contents
1. [Setup: accounts, keys and installs](#1-setup-accounts-keys-and-installs)
2. [Key technical decisions (and why)](#2-key-technical-decisions-and-why)
3. [Repository layout and contracts](#3-repository-layout-and-contracts)
4. [Phase plan at a glance](#4-phase-plan-at-a-glance)
5. [Phase 0 — Contracts and spikes (0:00–1:30)](#phase-0--contracts-and-spikes-000130)
6. [Phase 1 — Foundations (1:30–5:00)](#phase-1--foundations-130500)
7. [Phase 2 — First rescue (5:00–8:00)](#phase-2--first-rescue-500800)
8. [Phase 3 — CBBA and partitions (8:00–14:00)](#phase-3--cbba-and-partitions-8001400)
9. [Phase 4 — Baselines and AI (14:00–17:30)](#phase-4--baselines-and-ai-14001730)
10. [Phase 5 — Acceptance and benchmark (17:30–21:00)](#phase-5--acceptance-and-benchmark-17302100)
11. [Phase 6 — Freeze and rehearse (21:00–24:00)](#phase-6--freeze-and-rehearse-21002400)
12. [Reference: parameters, n8n settings, troubleshooting](#12-reference)

---

## 1. Setup: accounts, keys and installs

Do this **before** the hackathon starts. Venue Wi-Fi is slow, and pulling Docker images there wastes the first hour.

### 1.1 Checklist

| # | What | Who | Cost | Done when |
|---|---|---|---|---|
| 1 | Hardware check | Both | — | You know which laptop runs the full 7-actor stack (§1.2) |
| 2 | Docker Desktop | Both | Free | `docker run --rm hello-world` prints "Hello from Docker!" |
| 3 | Node.js 24 LTS | Both | Free | `node --version` prints `v24.x` |
| 4 | `git`, `jq`, Chrome | Both | Free | `jq --version` works |
| 5 | Anthropic API key + credit | One person | ~$5 credit is far more than enough | The test `curl` in §1.4 returns a reply |
| 6 | Pin the n8n version | Dev A | Free | `N8N_VERSION` is set in `.env` |
| 7 | Encryption key + `.env` | Dev A | Free | `.env` exists and is git-ignored |
| 8 | GitHub repo | Dev A | Free | Both devs can push |
| 9 | Pre-pull images | Both | Free | §1.8 commands finish |

You **don't** need an n8n account, licence or API key. Self-hosted n8n is free and runs fully offline. There are no map API keys either, because the map is drawn on our own grid.

### 1.2 Hardware: running on 8 GB laptops

7 n8n instances are the heaviest part of the stack. Each n8n 2.x container runs the main process plus a task-runner process for Code nodes. Everything else is small: 7 stores, the simulator, proxy, HQ and dashboard total about 400 MB.

**The 8 GB memory budget:**

| Where | Budget |
|---|---|
| macOS + Chrome (dashboard + 2 editor tabs) | ~2.5 GB |
| Docker Desktop's VM overhead | ~0.5 GB |
| 7 × n8n, capped at 560 MB each (idle use measured at 370–470 MB) | ≤ 3.9 GB |
| 7 stores + sim + proxy + HQ + dashboard | ~0.4 GB |
| **Total** | **~7.3 GB of 8**. It fits only if nothing else big is open; see the rules below. |

**Rules for 8 GB machines:**
1. **Measure first, before the hackathon:** with Docker running, run `N8N_VERSION=<pinned> bash scripts/memtest.sh`. It starts 7 idle n8n instances with HIVE's caps, prints real memory use, then removes them. **Pass:** all 7 healthy, no restarts, and under 3,000 MiB in total after the 3-minute settle. (Measured on this Mac with Docker at 5 GB: 2,988 MiB, with no restarts or out-of-memory kills.)
2. **Docker Desktop → Settings → Resources:** Memory **5 GB** (set, measured below), Swap **2 GB**, CPUs 4 or more. Click *Apply & restart*.
3. **Cap each n8n** (already in §12.2): `mem_limit: 560m` and `NODE_OPTIONS=--max-old-space-size=320`. The second setting caps Node's heap so n8n cleans up memory early instead of hitting the container limit.
4. **Only run all 7 actors when you need them.** Unit tests and the headless benchmark run in plain Node with no Docker (under 200 MB). Day to day, run the **dev stack**: `node scripts/gen-compose.mjs --actors drone-1,drone-2,team-1,team-2`, which needs about 2 GB. Start the **full 7-actor stack** for the gate tests at hours 8, 14, 17.5 and 21, and for the demo. Nothing is cut: the gates and the demo always run all 7.
5. **When the full stack is running, close VS Code, Slack and extra Chrome tabs.** VS Code alone often uses 1 GB or more. Check memory in Activity Monitor → Memory: the pressure graph must stay green or yellow, not red.
6. **Only one dev runs the full stack at a time.** The other dev works on unit tests or the headless benchmark meanwhile.

**If the memory test fails, try these in order:**
1. Close every other app and run it again.
2. Lower the heap cap with `HEAP=256` and run it again.
3. Run the stack with `TICK_MS=3000`. Fewer executions per second means lower peak memory and CPU, and the headless results still compare because they're measured in ticks.
4. As a last resort, use the 5-actor fallback from hack.md §11.

### 1.3 Installs (macOS)

```bash
# Docker Desktop: download from https://www.docker.com/products/docker-desktop/ and open it once.
docker run --rm hello-world

# Node 24 LTS (via https://nodejs.org or nvm), jq, git
brew install jq git
node --version        # v24.x
```

Use **Chrome** for the n8n editors. It resolves `*.localhost` names to your own machine, which you need in order to stay logged in to several n8n editors at once (§12.3).

### 1.4 Anthropic API key (for the distress-text parser)

1. Go to **https://console.anthropic.com** and sign in or create an account.
2. **Billing:** add credit. HIVE uses **Claude Haiku 5.5** (`claude-haiku-5-5`), which costs $0.10 per million input tokens and $0.50 per million output tokens. Each distress text costs roughly 1,000 tokens, so a whole hackathon of testing costs pennies. A $5 top-up is more than enough.
3. **Settings → API Keys → Create Key.** Name it `hive-hackathon` and copy it immediately, because it's only shown once.
4. Store it in a password manager and share it with your teammate privately. **Never commit it.**
5. Test it:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
curl -s https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2026-10-21" \
  -d '{"model":"claude-haiku-5-5","max_tokens":256,"messages":[{"role":"user","content":"Reply with the single word: ready"}]}' \
  | jq -r '.content[] | select(.type=="text") | .text'
```

It should print `ready`. If you get a 401 the key is wrong; a 400 about credit means billing isn't set up yet.

> **Gotcha:** with API version `2026-10-21`, any request that sends `temperature`, `top_p` or `top_k` returns a **400**. Never set them, in n8n or anywhere else. Phase 0 spike S7 checks this.

### 1.5 Pin the n8n version

n8n 2.x changed several defaults that this plan depends on (§2), so every instance must run the **same, known** version:

```bash
docker pull n8nio/n8n:latest
docker run --rm --entrypoint n8n n8nio/n8n:latest --version     # e.g. 2.x.y
```

Write that exact version into `.env` as `N8N_VERSION=2.x.y`. Never use `latest` in the compose file. If the version is **1.x**, stop and tell the team: this plan assumes 2.x (task runners, `publish:workflow`).

### 1.6 Secrets and `.env`

```bash
openssl rand -hex 32        # → N8N_ENCRYPTION_KEY
```

`.env` (git-ignored) holds:

```dotenv
N8N_VERSION=2.x.y
N8N_ENCRYPTION_KEY=<64 hex chars>   # SAME for all 7 instances: lets one exported credential import everywhere
ANTHROPIC_API_KEY=sk-ant-...        # only used by spike scripts; n8n stores its own copy as a credential
MODE=hive                           # hive | central-naive | central-strong
TICK_MS=2000
```

Commit a `.env.example` with the same keys and empty values. Add these to `.gitignore`: `.env`, `n8n/credentials/`, `bench/results/raw/`.

### 1.7 GitHub repo

Create `hive` on GitHub (private is fine) and add your teammate. Use three branches: `main`, `dev-a` and `dev-b`. Each dev works on their own branch and merges to `main` **at every phase gate**, after the gate passes on the merged code.

### 1.8 Pre-pull everything (do this on home Wi-Fi)

```bash
docker pull n8nio/n8n:$N8N_VERSION
docker pull node:24-alpine
# After Phase 1 exists:  docker compose pull && docker compose build
```

---

## 2. Key technical decisions (and why)

These choices follow from what n8n 2.x actually does. Some of them refine the storage section of `hack.md`.

| # | Decision | Why |
|---|---|---|
| D1 | **Each actor's store is a sidecar container** (`store-<id>`, a ~80-line Node service using the built-in `node:sqlite`). Workflows reach it at `http://store:4000`. | In n8n 2.x, Code nodes run in an isolated **task runner**. Getting npm modules (such as `better-sqlite3`) or `process.env` into that runner is unreliable. A sidecar needs neither: Code nodes stay pure JavaScript, and all input and output goes through HTTP Request nodes. **Already built and tested:** [services/store](services/store). |
| D2 | **`N8N_CONCURRENCY_PRODUCTION_LIMIT=1` on every instance.** | n8n then runs one production execution at a time per instance, queuing the rest first-in, first-out. Each actor handles one message at a time, like a true actor-model actor. This rules out race conditions on actor state. The store's version check (409 on a stale write) is the safety net that proves it. |
| D3 | **Functional core, imperative shell.** All decision logic lives in one pure, plain-JS file, `core/dist/hive-core.js`, pasted into Code nodes at build time. n8n workflows only fetch, call the core and write. | The **same code** runs in n8n, in unit tests and in the headless benchmark. You can unit-test CBBA without Docker, and the benchmark measures the logic that actually ran in the demo. |
| D4 | **Configuration comes from the store, not environment variables.** `GET http://store:4000/config` returns actor ID, role, mode and peers. | n8n 2.x blocks environment access in Code nodes by default (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`). With this design, all 7 instances run *byte-identical* workflows. |
| D5 | **One private Docker network per actor.** `net-<id>` holds only `n8n-<id>`, `store-<id>` (alias `store`), the proxy, the simulator and the dashboard. | Containers on different user-defined bridge networks can't reach each other, so the network cuts are real. It also lets every actor call its own store by the same name, `store`. |
| D6 | **The proxy is fire-and-forget.** `POST /send` returns `202` (accepted) or `503` (link down) immediately, then delivers to the peer in the background. | A sender never blocks waiting for a receiver. With D2, two actors waiting on each other would otherwise deadlock until timeout. |
| D7 | **The simulator drives ticks** (`POST /webhook/tick` with only `{tick}`); **gossip runs on each actor's own Schedule Trigger.** | Ticks stay in order without jitter. Gossip timing stays independent per actor, which is honest decentralisation. |
| D8 | **CBBA uses wall-clock timestamps** (`Date.now()` passed in by the shell, simulated time in the benchmark). | Convergence is checked while the simulation is paused. With tick numbers frozen, CBBA's "fresher information" rule would stall, but wall-clock time keeps moving. |
| D9 | **CBBA uses bid warping:** a bid is never higher than the previous bid in the bundle. | **Tested:** with our travel-style scoring, CBBA *fails* to converge without warping and passes with it. See [core/test/cbba.test.js](core/test/cbba.test.js). |
| D11 | **n8n instances boot one at a time.** Each n8n `depends_on` the previous one passing `/healthz/readiness` (not `/healthz`, which answers before migrations finish). | **Measured:** 7 simultaneous first boots on the 8 GB Mac never finished (load 35+, none ready after 10 minutes). Staggered, a cold boot takes 5 min 41 s, and steady state is ~350 MiB and 1–12% CPU per instance. |
| D10 | Workflows are **deployed by CLI** (`n8n import:credentials`, `import:workflow`, `publish:workflow`) with a shared `N8N_ENCRYPTION_KEY`. | n8n 2.x replaced activate/deactivate with publish/unpublish. Importing deactivates workflows, so you must publish them afterwards. Spike S2 proves the exact script. |

**How `hack.md` §5's six workflows map to n8n:** Perceive, Bid and Act run as three labelled Code nodes **inside one `hive-tick` workflow**, so they always execute in order on each tick. Interpret, Gossip and Merge are their own workflows. That gives 4 workflow files and the same 6 stages on the canvas.

---

## 3. Repository layout and contracts

### 3.1 Layout and ownership

```
hive/
├── docker-compose.yml          A  (generated by scripts/gen-compose.mjs)
├── .env.example                A
├── contracts/                  A+B  Phase 0, then frozen (changes need both devs to agree)
│   ├── README.md               all API shapes below, with JSON examples
│   └── params.json             shared constants (grid, speeds, radii, weights, timing)
├── core/                       B   pure decision logic, no imports
│   ├── src/events.js           tested (moved from the starter)
│   ├── src/cbba.js             tested (moved from the starter)
│   ├── src/score.js  src/search.js  src/actor.js  src/digest.js  src/text-fallback.js
│   ├── build.mjs               concatenates src/* → dist/hive-core.js (one global: HiveCore)
│   └── test/*.test.js          node --test
├── world/                      A   pure, seeded world model (no HTTP)
│   ├── world.js  scenario.js  gazetteer.js  central.js
│   └── test/*.test.js
├── services/
│   ├── store/                  A   tested (moved from the starter)
│   ├── sim/                    A   HTTP wrapper over world/ + tick driver + distress delivery
│   ├── proxy/                  A   chaos proxy
│   ├── hq/                     A   central dispatcher (wraps world/central.js)
│   └── dashboard/              A   server (reaches internal services) + static SPA
├── n8n/
│   ├── workflows-src/          B   exported workflow JSON containing the marker //@@HIVE_CORE@@
│   ├── build/                  B   generated (core injected), mounted read-only into every n8n
│   └── credentials/            B   git-ignored encrypted credential export
├── bench/                      A   headless runner: world + core in one process
├── tests/e2e/                  B   checkpoint and acceptance scripts (talk to the dashboard API)
└── scripts/
    ├── gen-compose.mjs         A
    ├── check-isolation.sh      A
    ├── build-workflows.mjs     B   inject core, lint URLs
    └── deploy-workflows.sh     B   import + publish on all 7 instances
```

### 3.2 Contracts (agree these in Phase 0 and write them into `contracts/README.md`)

**IDs.** Actors: `drone-1`…`drone-4`, `team-1`…`team-3`, plus `hq` (baselines only). Cells: `"x-y"` with `x, y ∈ 0..7`. Ticks: integers from 0.

**C1. Actor store** (A builds; already done in the starter):
| Call | Body / response |
|---|---|
| `GET /config` | `{actor_id, role, mode, peers[]}` |
| `GET /state` | `{config, version, state}` (state is `null` before the first write) |
| `PUT /state` | `{version, state}` → `200 {version}` or `409` if `version` is stale |
| `POST /reset` | Clears the state (used by the scenario runner) |
| `GET /health` | `{ok, conflicts, ...config}`. `conflicts` counts 409s since the store started; acceptance requires 0. |

**C2. Simulator** (A builds; actors call it):
| Call | Body / response |
|---|---|
| → actor `POST /webhook/tick` | `{tick}`. Fire-and-forget, 1 s timeout. |
| `GET /sense?actor=ID` | `{tick, actor, pos:{x,y}, footprint:["x-y"…], detections:[{survivor_id, cell, people, urgency}]}`. Only this actor's sensor footprint, and only survivors who have appeared and are still unrescued. |
| `POST /move` | `{actor, target:{x,y}, task_id?, key}` → `{ok, pos}`. Moves one step at the next world step; a repeated `key` is ignored. |
| `POST /rescue` | `{actor, survivor_id, key}` → `{result: "rescued"│"already_rescued"│"not_here", tick}`. Idempotent per `key`. |
| → drone `POST /webhook/distress` | `{msg_id, text, sent_tick, delivered_tick}` |
| Dashboard only | `GET /world`, `GET /metrics`, `POST /control/reset {seed}`, `/control/start`, `/control/pause`. **Actors must never call these** (the build lint enforces it). |

**C3. Chaos proxy** (A builds):
| Call | Body / response |
|---|---|
| `POST /send` | `{from, to, path:"merge", body}` → `202` (queued) or `503` (link down). Delivers to `http://n8n-<to>:5678/webhook/<path>` after `delay_ms`; dropped at `drop_rate`. |
| `POST /rpc` | `{from, to:"hq", path, body}`. Synchronous pass-through to HQ, or `503`. |
| `GET/PUT /links` | `{allowed:{from:{to:bool}}, delay_ms, drop_rate, duplicate_rate, reorder}` |
| `POST /links/preset` | `{name: "all-up"│"blackout-3"│"drones-vs-teams"│"isolate-one"│"flapping"│"percent", seed?, percent?}` |
| `GET /log?since=n` | `[{n, ts, from, to, path, status:"refused"│"queued"│"dropped"│"delivered"│"failed", bytes}]` |

**C4. Events and gossip** (B defines):
```js
Event  = { id: "drone-1:17", origin: "drone-1", seq: 17, type, data, tick }
// types: TASK_CREATED {task_id, survivor_id|null, cell, people, urgency, provisional, source:"sensor"|"text", resolves?}
//        CELL_SEARCHED {cell} · COMMITTED {task_id} · ATTEMPT {task_id, survivor_id, result} · RESCUED {task_id, survivor_id}
Gossip = { from, sent_at /*ms*/, vv:{origin:seq}, events:[Event], cbba:{y,z,s}, hint:{pos, heading} }
```

**C5. `state.view`** (B writes it; A's dashboard reads **only** this):
```js
view = { actor_id, role, tick, pos, action: "searching"|"travelling"|"rescuing"|"idle", target,
         bundle: [task_id], owners: {task_id: actor_id|null}, known_tasks: n, digest: "8 hex chars",
         vv: {...}, provisional: n }
```

**C6. Core API** (B implements; A's benchmark calls it exactly the way the n8n shell does):
```js
HiveCore.init(config, nowMs)                             → state
HiveCore.perceive(state, {tick, sense}, nowMs)           → state
HiveCore.bid(state, nowMs)                               → state           // no-op unless state.dirty
HiveCore.act(state, {hq}, nowMs)                         → {state, actions:[{kind:"move",target,task_id,key}|{kind:"rescue",survivor_id,key}]}
HiveCore.applyReceipts(state, receipts, nowMs)           → state
HiveCore.hqRequest(state)                                → body | null      // central modes only
HiveCore.gossip(state, nowMs)                            → {state, messages:[{to, body}]}
HiveCore.merge(state, body, nowMs)                       → state
HiveCore.interpret(state, parsed|null, raw, nowMs)       → state           // parsed=null → regex fallback
HiveCore.score(pos, task, bundlePath, tick, params)      → number          // shared with HQ for a fair baseline
HiveCore.sharedDigest(state)                             → string
HiveCore.PARAMS
```

**C7. Shared parameters** (`contracts/params.json`, read by both world and core):
```json
{ "grid": 8, "tick_ms": 2000, "horizon_ticks": 240, "gossip_ms": 4000,
  "speed": { "drone": 1, "team": 0.5 }, "sensor_radius": { "drone": 2, "team": 1 },
  "distress_radius": 2, "bundle_max": 3, "tau_ticks": 60,
  "weights": { "w1": 10, "w2": 1, "w3": 2 }, "survivors": 30, "appear_by_tick": 150 }
```
Distances use the Chebyshev metric (diagonal moves allowed). A team speed of 0.5 means one cell every 2 ticks.

---

## 4. Phase plan at a glance

| Phase | Hours | Dev A (World & Infra) | Dev B (Actor Brain) | Gate (must pass to continue) |
|---|---|---|---|---|
| 0 | 0:00–1:30 | Compose skeleton, spikes S1, S5 | Spikes S2, S3, S4, S6, S7 | Contracts written; all 7 spikes pass |
| 1 | 1:30–5:00 | World model, sim, proxy, store, full compose, isolation | Core: events, scoring, perceive, gossip, merge, search | Both unit suites green; `check-isolation.sh` passes |
| 2 | 5:00–8:00 | Dashboard v1, scenario control API | Workflows: tick, gossip, merge; build and deploy scripts | **Hour-8 checkpoint e2e** |
| 3 | 8:00–14:00 | Scenario generator, distress feed, blackout UI, headless runner | CBBA in core and workflows, commit logic | **Hour-14 checkpoint e2e** |
| 4 | 14:00–17:30 | HQ dispatcher, both baselines (live and headless), metrics | Interpret workflow (AI + fallback), central mode in core | AI accuracy ≥ 18/20; baseline e2e |
| 5 | 17:30–21:00 | Benchmark runs, charts, live-vs-headless parity | Full acceptance suite (§6.6 of hack.md), tuning | Every acceptance check passes; results committed |
| 6 | 21:00–24:00 | Freeze, rehearse ×5, backup video | Freeze, rehearse ×5, slides | Demo runs clean 3 times in a row |

**Gate rule:** a phase isn't done until its gate passes **on `main`, after both branches are merged**. If a gate fails, both devs fix it before starting the next phase's work. The gates catch integration bugs while they're still small.

**Running tests:**
- `npm test` at the repo root runs every unit suite (`node --test core/test world/test services/*/test`). It needs no Docker.
- `node tests/e2e/<name>.mjs` runs an end-to-end test against the live stack, through the dashboard API at `http://localhost:8000/api`.

---

## Phase 0 — Contracts and spikes (0:00–1:30)

**Goal:** agree every interface, then *prove* each risky n8n assumption on real containers before building on it. Each spike has a pass condition and a fallback.

### Together (first 30 minutes)
1. Create the repo layout (§3.1) and move the starter files into it. **✅ Done (Dev A).**
2. Write `contracts/README.md` (C1–C7 with example JSON) and `contracts/params.json`. **✅ Drafted by Dev A; Dev B must review before Gate 0.**
3. Run `npm test`: every unit suite must pass. **✅ 17/17** (6 core, 3 store, 8 compose generator).

### Dev A
- **Compose skeleton** **✅ Done:** `scripts/gen-compose.mjs` generates the full 7-actor stack (§12.2) from `params.json`, with `--actors` for the dev stack and `--with-probe` for the Phase 0 stand-in proxy.
- **S1 — Memory and boot.** **✅ Pass.** Cold boot with fresh volumes via a plain `docker compose up -d`: all 7 n8n ready in **5 min 41 s**, then 345–362 MiB and 1–12% CPU each; `memtest.sh` gives 7/7 ready at 2,533 MiB total.
  **Finding:** booting all 7 at once **never finishes** on an 8 GB machine (load 35+, none ready after 10 minutes, because all 7 run their first-boot migrations at once). The fix is decision D11: n8n instances boot one at a time.
  **Still to do:** measure under real load at Gate 2 (the full stack running real workflows for 5 minutes at `TICK_MS=2000`). Pass: no restarts, every n8n under 90% of 560 MB, macOS memory pressure out of the red.
- **S5 — Network isolation.** **✅ Pass: 105/105 checks.** `scripts/check-isolation.sh` runs inside every actor. Calls to every other actor's n8n and store are blocked; the actor's own `store` alias returns its own ID; the shared service is reachable both ways.

### Dev B (on a single n8n instance)
- **S2 — Deploy via CLI.** In the editor, build a trivial workflow: Webhook `POST /webhook/ping` → Code node returning `{ok:true}`. Export it with `n8n export:workflow --all --separate --output=/hive/workflows-src/`, then write `deploy-workflows.sh` (§12.4) and run it against a **fresh** instance.
  **Pass:** `curl -X POST localhost:5671/webhook/ping` returns 200 after the script finishes, on an instance where nobody has opened the editor.
  **Fallback:** if CLI import into a running instance doesn't take effect, stop the container and run the CLI against the volume with `docker compose run --rm`. If the CLI demands an owner account, create one with `curl -X POST localhost:5671/rest/owner/setup -H 'content-type: application/json' -d '{"email":"a@b.c","firstName":"H","lastName":"V","password":"Hive-pass-1"}'`.
- **S3 — Concurrency limit serialises.** Build a webhook workflow that reads a counter from the store, waits 1 s in a Wait node, then writes counter+1. Fire 10 requests in parallel.
  **Pass:** the counter ends at exactly 10, and the store's `conflicts` counter is 0.
  **Fallback:** if Wait nodes break concurrency=1 (a Wait offloads the execution), take the Wait out. Our real workflows have no Wait nodes.
- **S4 — Injected core runs in a Code node.** Paste `core/src/events.js` and `core/src/cbba.js` into a Code node, followed by `return [{json: {ok: typeof HiveCBBA.receive === 'function'}}]`.
  **Pass:** `ok: true`. Also time a 300 KB JSON round-trip through the node: it must take under 200 ms.
  **Fallback:** if `module` handling breaks, change the guard to `try { module.exports = X } catch (e) {}`.
- **S6 — Shared credential.** In drone-1's editor (http://drone-1.localhost:5671), create an **Anthropic** credential with the key. Export it with `n8n export:credentials --all --output=/hive/credentials/anthropic.json`, then import it into a second instance that has the same `N8N_ENCRYPTION_KEY`.
  **Pass:** the second instance's AI node runs without asking for credentials.
  **Fallback:** create the credential by hand in each instance's editor (7 × 1 minute).
- **S7 — AI node works with Haiku 5.5.** Build Webhook → AI Agent (chat model: **Anthropic Chat Model**, model `claude-haiku-5-5`, **no temperature, top-p or top-k set**; if the model list lacks it, switch the field to ID or expression and type it) + Structured Output Parser. Send `"stuck on roof w/ 2 kids near Piccadilly, water rising"`.
  **Pass:** it returns valid JSON with `district: "Piccadilly"` in under 5 s.
  **Fallback (very likely to be needed if the node sends a default temperature, which returns a 400):** use an **HTTP Request** node to call `https://api.anthropic.com/v1/messages` directly, with a *Header Auth* credential (`x-api-key`), header `anthropic-version: 2026-10-21`, and `output_config.format` for the JSON (§12.5).

**Gate 0:** contracts merged to `main`; all 7 spikes pass (or their fallbacks are adopted and noted in `contracts/README.md`); `npm test` is green.

---

## Phase 1 — Foundations (1:30–5:00)

Both devs build their half against the contracts, with **no live dependency on each other**.

### Dev A — World and services

1. **`world/` (pure, seeded, no I/O):**
   - `scenario.js`: from a seed, generate 30 survivors (`survivor_id`, cell, people 1–5, urgency 1–5, `appear_tick` ≤ 150). Weight placement toward low-lying "flooded" districts. Also generate starting positions (drones at the central HQ cell, teams spread out) and a distress-text schedule.
   - `gazetteer.js`: 8 districts on the grid (Piccadilly, Northern Quarter, Ancoats, Deansgate, Castlefield, Hulme, Salford Quays, Lower Broughton), each with its cells and a landmark cell.
   - `world.js`: `step()` applies queued moves in actor-ID order at the configured speed; `sense(actor)`; `move()` and `rescue()`, both idempotent by `key`; `metrics()` (score, rescued, unrescued and their urgency, duplicate attempts, wasted travel per actor, attributed using `task_id`).
   - Use a seeded RNG everywhere. **Never** call `Math.random()`.
2. **`services/sim`:** an HTTP wrapper over `world` (contract C2). A tick loop every `TICK_MS`: `world.step()`, then fire `POST /webhook/tick {tick}` at all 7 actors with a 1 s timeout, ignoring errors. A distress text is delivered to the **nearest drone within `distress_radius`** of its cell. If no drone is in range, the message keeps "Sending…" and is retried every tick.
3. **`services/proxy`** (contract C3): the link matrix, presets, an in-memory delivery log (ring buffer of 50k entries), and the chaos modes (delay, drop, duplicate, reorder).
4. **`services/store`:** already in place from Phase 0 (server, tests and Dockerfile), including the `conflicts` counter.
5. **`scripts/gen-compose.mjs`:** generates `docker-compose.yml` from the actor list (§12.2), with 7 n8n services, 7 stores, sim, proxy, hq and dashboard. It takes an `--actors` flag for the 4-actor dev stack (§1.2). The default is all 7. Every other service reads the actor list from the generated file, so nothing else changes.
6. **`scripts/check-isolation.sh`:** for every ordered pair of actors, `docker compose exec -T n8n-A node -e "fetch('http://n8n-B:5678/healthz').then(()=>process.exit(1),()=>process.exit(0))"` must exit 0. Every actor must also reach `http://store:4000/health`, `http://proxy:8080/links` and `http://sim:3000/sense?actor=<self>`.

**Dev A tests (`world/test`, `services/*/test`):**
- **Determinism:** the same seed and the same inputs give an identical `world` state hash after 240 steps, run 3 times.
- **Speeds:** a drone covers 1 cell per tick and a team 1 cell per 2 ticks. A move toward an occupied target ends exactly on the target.
- **Sensing:** a drone sees exactly the 5×5 block of cells around it and a team the 3×3 block. Survivors who haven't appeared yet, or have been rescued, are never detected.
- **Idempotency:** `rescue` with the same key twice → `rescued`, then the same receipt again. A different actor gets `already_rescued`. Each survivor is counted exactly once.
- **Proxy:** cut link → `503` and a `refused` log entry. `drop_rate=1` → `queued` then `dropped`. `duplicate_rate=1` → two `delivered` entries.
- **Isolation:** `check-isolation.sh` exits 0, testing all 42 ordered actor pairs.

### Dev B — Core logic

1. `core/src/events.js` and `cbba.js` are already in place (Phase 0). `build.mjs` concatenates `core/src/*.js` into `dist/hive-core.js`, which exposes one global, `HiveCore`, plus the `module.exports` guard.
2. **`score.js`:** `score(pos, task, path, tick)` = `w1·urgency·exp(−(age+eta)/τ) − w2·eta − w3·|path|`, where `eta` is the travel time along the path in ticks at team speed.
3. **`actor.js`:**
   - `init`.
   - `perceive`: update position; emit `CELL_SEARCHED` for newly searched cells; emit `TASK_CREATED` with the canonical ID `T-<survivor_id>`; resolve provisional tasks within 2 cells of a detection; set `dirty`.
   - `gossip`: for each peer, send `missingFor(peerVV[peer])` (capped at 200), plus `vv`, the CBBA snapshot and a position hint.
   - `merge`: `receive` the events, record `peerVV[from]` and `lastHeard[from]`, set `dirty` if anything is new. The CBBA part comes in Phase 3.
   - A temporary `act` for teams: go to the nearest known, unrescued task.
   - `applyReceipts`: `rescued` → `RESCUED`; `already_rescued` / `not_here` → `ATTEMPT`, which also marks the survivor as gone.
   - `state.view` (contract C5).
4. **`search.js`** (drones): the next target is the nearest unsearched cell. Prefer cells near provisional tasks, avoid cells near where a peer was last heard heading, and break ties with an offset based on the actor ID so drones spread out.
5. **`digest.js`:** FNV-1a 32-bit hash over canonical JSON of `{vv, searched (sorted), rescued (sorted), owners}`.

**Dev B tests (`core/test`), all pure, no Docker:**
- The starter tests (events and CBBA): **6 tests**.
- **Perceive:** two drones detecting the same survivor create the *same* `T-` ID. After a merge, exactly one task exists.
- **Replay safety:** feed the same gossip into `merge` 3 times → state and digest unchanged.
- **Simulated 4-actor run in memory:** with all links up, after one gossip round every actor's `searched` and `rescued` sets are equal and their digests match.
- **Search:** two drones in the same place, with all cells unsearched, pick different targets.
- **Code-node compatibility:** `node -e "require('./core/dist/hive-core.js')"` works, and `dist/hive-core.js` contains no `require(` or `import ` statements (checked by a test).

**Gate 1:** `npm test` green on `main` (both suites). `docker compose up -d` brings all 18 containers to healthy. `check-isolation.sh` passes.

---

## Phase 2 — First rescue (5:00–8:00)

### Dev B — n8n workflows (build them in drone-1's editor, then export)

All four workflows are identical on every actor. Every HTTP Request node URL must start with `http://store:4000`, `http://sim:3000` or `http://proxy:8080`; the build lint enforces this.

**`hive-tick`** (Webhook `POST tick`, *Respond: Immediately*):
```
Webhook → Get State (GET store/state) → Sense (GET sim/sense?actor={{$json.config.actor_id}})
→ [IF mode != hive → HQ Sync (POST proxy/rpc, "Continue on fail")]
→ Code "Perceive" → Code "Bid (CBBA)" → Code "Act"
→ Put State (PUT store/state)          ← intents saved BEFORE acting
→ Split actions → Do Action (POST sim/move or sim/rescue) → Aggregate receipts
→ Code "Apply receipts" → Put State
```
- Each Code node begins with the injected core (`//@@HIVE_CORE@@`) and then a few lines. For example, Perceive:
  ```js
  //@@HIVE_CORE@@
  const s = $('Get State').first().json;
  const now = Date.now();
  let state = s.state ?? HiveCore.init(s.config, now);
  const tick = $('Webhook').first().json.body.tick;
  const sense = $('Sense').first().json;
  if (tick < sense.tick - 1) return [{ json: { skip: true } }];   // stale queued tick: drop it
  state = HiveCore.perceive(state, { tick, sense }, now);
  return [{ json: { version: s.version, state } }];
  ```
- **Put State body:** *JSON*, `{{ JSON.stringify({ version: $json.version, state: $json.state }) }}`. A 409 must fail the execution loudly; never set "continue on fail" on Put State.
- Add an IF node after the stale-tick check so a skipped tick goes straight to the end.

**`hive-gossip`** (Schedule Trigger, every 4 seconds): Get State → Code (`HiveCore.gossip`) → Put State → split `messages` → `POST proxy/send` with **Continue on fail** (a 503 means the link is down, which is normal).

**`hive-merge`** (Webhook `POST merge`, *Respond: Immediately*): Get State → Code (`HiveCore.merge(state, $('Webhook').first().json.body, Date.now())`) → Put State.

**`hive-interpret`** comes in Phase 4. Until then, a Webhook `POST distress` that just responds 200.

**Scripts:**
- `build-workflows.mjs`: for every `workflows-src/*.json`, replace `//@@HIVE_CORE@@` in each Code node's `jsCode` with `core/dist/hive-core.js`; **fail** if any HTTP Request URL is outside the allowlist or mentions `/world`, `/metrics` or `/control`; write the result to `n8n/build/`.
- `deploy-workflows.sh`: §12.4, proven in S2.

**Dev B tests:**
- `build-workflows.mjs` fails on a planted bad URL and passes on the real workflows.
- **Workflow smoke test:** after deploying, reset the sim with seed 1 and run 10 ticks. Every store's `state.view.tick` must reach at least 9, and `/health` must show `conflicts: 0`.

### Dev A — Dashboard v1 and control API

- **`services/dashboard`:** a server on every actor network, exposing `localhost:8000`:
  - `GET /api/actors` → the 7 `state.view` objects, read directly from `http://store-<id>:4000/state`. Each includes `polled_at` and is marked `stale` when it's older than 3 s.
  - `GET /api/sim/world`, `GET /api/sim/metrics`, `POST /api/sim/control/*`.
  - `GET /api/proxy/log?since=`, `GET/PUT /api/proxy/links`, `POST /api/proxy/preset`.
  - `POST /api/reset {seed}`: reset the sim, `POST /reset` on all 7 stores, set links to all-up.
- **SPA (vanilla JS + Canvas, Chart.js later):**
  - A map with the grid, district labels, ground-truth survivors (outlined, labelled "ground truth"), and drones and teams with their targets.
  - Link lines from the proxy log: a flash for `delivered`, red for a cut link.
  - 7 actor cards from `view`.
  - An activity feed from new events (the `view` diffs plus the proxy log).
- **`tests/e2e/lib.mjs`** (shared helpers for Dev B's e2e scripts): `reset(seed)`, `start()`, `pause()`, `waitTicks(n)`, `actors()`, `preset(name)`, `log(since)`, `metrics()`.

**Dev A tests:**
- The dashboard API returns 7 actors. Stopping one store makes that actor `stale: true` within 4 s.
- **Observer must not bridge islands:** with `blackout-3` set, the dashboard keeps polling all 7, and the proxy log shows **zero** cross-island `delivered` entries.

### Gate 2 — the hour-8 checkpoint (`tests/e2e/checkpoint8.mjs`)

Seed 1, all links up, run 60 ticks, then:
1. **A drone detection reaches a team, and the team rescues the survivor:** `metrics.rescued ≥ 1`, and for that survivor, the `TASK_CREATED` event's origin is a drone while the `RESCUED` event's origin is a team.
2. **A cut link stops sync:** cut `drone-1 ↔ everyone` and run 10 ticks. No new `drone-1:*` events appear in other actors' `vv`, while `drone-1` itself keeps emitting events.
3. **Replay is harmless:** set `duplicate_rate=1` and run 20 ticks. `metrics.duplicate_rescues == 0`, and the rescue count matches each actor's `rescued` set after convergence.
4. Every store reports `conflicts: 0`.

---

## Phase 3 — CBBA and partitions (8:00–14:00)

### Dev B — CBBA in the actors

1. **`bid(state, now)`:** only for teams, and only when `dirty`. The candidate tasks are confirmed, not rescued, and not `COMMITTED` by someone else. Call `HiveCBBA.buildBundle` with `marginal = score(pos-after-path, task, path, tick)` and `bundle_max = 3`; warping is already built in. Clear `dirty`.
2. **`merge` adds CBBA:**
   - Run `HiveCBBA.receive(stateCbba, msg.cbba with id=msg.from, now, taskIds)`, where `taskIds` covers all unrescued tasks.
   - **Drones relay too:** they keep tables and run `receive` but never bid, so allocation information flows through them.
   - If anything changed, set `dirty`.
   - Exclude rescued tasks on both sides, so finished tasks don't ping-pong.
3. **`act` for teams:**
   - Target the first task in the bundle.
   - On arrival, **commit**: emit `COMMITTED`, which is irreversible.
   - Then send `rescue` with `key = <actor>:<task>:rescue`.
   - Write the intent into `state.intents[key]` before the action (the shell's Put State does this). `applyReceipts` clears it.
4. **Restart recovery:** in `perceive`, any intent with no receipt is re-sent with the **same** key.
5. **`owners` in `view`:** `z[task]` for each unrescued task.
6. **Experiment flag `commit_radius`** (default 0 = commit on arrival).

**Dev B tests (pure):**
- The CBBA starter suites, plus a **table test for every row of the CBBA decision table**: 4 sender cases × 5 receiver cases, each asserting update, reset or leave.
- **In-memory 7-actor simulation using the real `actor.js`:**
  - **Partition** into the 3 islands for 40 ticks, then reconnect and run 10 gossip rounds with no new tasks.
  - Every actor's digest is equal, every task has at most one owner, and no team holds more than 3 tasks.
  - Run it over **200 seeds**.
- **Duplicates are measured, not hidden:** construct a case where both islands commit to the same survivor. Exactly one `RESCUED` and one `ATTEMPT(already_rescued)` result, and `metrics` shows 1 duplicate.

### Dev A — Scenarios, blackout UI, headless runner

1. **Scenario generator** finished, including distress texts written from templates. For example: `"stuck on roof w/ {n} kids near {district}, water rising"`, `"elderly neighbour trapped upstairs {district} pls help"`, `"{n} of us on the bus shelter by {landmark}"`. Every text is labelled with its true survivor and district, for scoring the AI.
2. **Proxy presets:**
   - `blackout-3`: islands {drone-1, drone-2, team-1}, {drone-3, team-2}, {drone-4, team-3}; every link to `hq` cut.
   - `drones-vs-teams`, `isolate-one` (team-1 alone), `flapping` (cross-island links toggle every 5 ticks).
   - `percent` (seeded random subset of undirected peer links; each actor's HQ link is up with the same probability).
3. **Dashboard:**
   - A **BLACKOUT** button (`blackout-3`) and a **RESTORE** button.
   - Click a link to toggle it.
   - Island colouring.
   - A per-actor "divergence" badge: shown when the actor's digest differs from the majority's.
   - A **Pause and check convergence** button: pause the sim, then show a countdown until all 7 digests match.
4. **`bench/run.mjs` headless runner:**
   - World and core run in one process with **simulated time**. Each tick: `world.step()`; then for each actor in ID order, do exactly what `hive-tick` does (`perceive → bid → act → actions → applyReceipts`).
   - Every `gossip_ms / tick_ms` ticks, call `gossip` for each actor. A message is delivered next tick, in seeded-random order, only if its link is up at send time.
   - Start with a stub core (temporary greedy). Switch to the real `core/dist/hive-core.js` after Gate 2's merge.
   - Output: `bench/results/<mode>-<topology>-<seed>.json` with metrics and convergence time.

**Dev A tests:**
- **Headless determinism:** the same seed run twice → byte-identical results.
- **Speed:** 240 ticks × 7 actors finishes in under 5 s.
- **Preset tests:** with `blackout-3`, the set of allowed links is exactly the within-island links.

### Gate 3 — the hour-14 checkpoint (`tests/e2e/checkpoint14.mjs`, the full live 7-actor system)

Seed 2. All links up for 30 ticks → `blackout-3` for 50 ticks → `all-up`, then pause.
1. **During the blackout, every island completes at least one new rescue,** and the proxy log has **zero** cross-island `delivered` entries.
2. **Convergence:** after RESTORE and pause, all 7 digests are equal within **10 gossip intervals (40 s)**. A timeout fails the gate.
3. Exactly one owner per pending task, and no team holds more than 3 tasks.
4. Duplicated work is reported (it can be 0 or more) and appears on the dashboard.
5. `conflicts: 0` everywhere.

---

## Phase 4 — Baselines and AI (14:00–17:30)

### Dev A — Central baselines

1. **`world/central.js` (pure):** the HQ's state and greedy assignment. Each tick, take the highest-scoring (team, task) pair repeatedly, using **`HiveCore.score`**, so HQ and HIVE judge tasks with the same function.
2. **`services/hq`:** HTTP wrapper. `POST /report {actor, tick, pos, detections, done}` → `{assignment: task|null}`. HQ is reachable only through the proxy's `/rpc`, from its own network `net-hq` shared only with the proxy.
3. **Headless:** add the `central-naive` and `central-strong` modes to `bench/run.mjs`. These call the same `HiveCore.act(state, {hq})` the live actors use.
4. **Metrics panel** (Chart.js): mission score over time, rescues, unrescued urgency, duplicates, wasted travel, gossip bytes.

**Dev A tests:**
- **HQ assignment:** each team gets at most one assignment, and no task is given to two teams.
- **Headless naive:** with HQ links cut from tick 50, teams make **zero** moves after tick 50.
- **Headless strong:** with HQ links cut, teams finish their current assignment and then go idle.

### Dev B — AI interpret and central mode

1. **`hive-interpret`** (Webhook `POST distress`, *Respond: Immediately*):
   - **AI Agent** → **Anthropic Chat Model** (`claude-haiku-5-5`, no sampling options) + **Structured Output Parser** with the schema `{district: enum[8 names], landmark: string|null, people: integer|null, urgency: integer 1–5, hazards: string[]}`. Or use the HTTP Request fallback from S7.
   - The system prompt lists the 8 districts and their landmarks, and asks for the most likely district plus an urgency rule: children, elderly, injury or rising water raise it.
   - Set the AI node's **On Error** to *Continue (using error output)*. The error branch goes to a Code node that calls `HiveCore.interpret(state, null, raw)`, which runs the regex fallback in `text-fallback.js`.
   - Do the LLM call **before** Get State, so the read-modify-write stays short. Then: Get State → Code (`HiveCore.interpret`) → Put State.
   - The result is a **provisional** task (`P-<msg_id>`) at the district's landmark cell. Drones get pulled toward it; teams don't bid on it until a sensor confirms it.
2. **Central mode in `core`:**
   - `hqRequest(state)` builds the report.
   - `act(state, {hq})`: if `mode !== "hive"`, follow `hq.assignment`. If `hq` is null (503): `central-naive` → no action; `central-strong` → keep working on the cached assignment, then go idle.
   - `gossip` returns no messages in central modes.

**Dev B tests:**
- **AI accuracy:** `tests/ai/fixtures.json` holds 20 labelled texts from Dev A's generator plus 5 messy ones written by hand. **Pass: correct district in ≥ 18 of 20.**
- **Fallback:** with the credential's key changed to a bad one, the regex fallback still creates provisional tasks for at least 15 of 20.
- **Pure tests for central mode:** naive idles on null; strong finishes its cached assignment.

### Gate 4
1. `tests/e2e/ai.mjs`: inject 5 distress texts live → 5 provisional tasks appear on the dashboard within 3 ticks of delivery, and at least 4 are later confirmed by a drone's sensor.
2. `tests/e2e/central.mjs`: with `MODE=central-naive` (requires `docker compose up -d` again so the stores pick up the mode), cut the HQ links → teams stop moving within 2 ticks. With `MODE=central-strong`, teams finish their current task first.
3. Headless results for all 3 modes exist for one seed and one topology.

---

## Phase 5 — Acceptance and benchmark (17:30–21:00)

### Dev A — Benchmark

1. Run the **full matrix headless:** 3 modes × topologies {balanced `blackout-3`, `drones-vs-teams`, `isolate-one`, `flapping`, `percent` 100/75/50/25/0} × **10 seeds** × 240 ticks. That's 3 × 9 × 10 = **270 runs**, which take seconds each.
2. `bench/summary.mjs` → `bench/results/summary.csv` with mean, standard deviation and min/max per configuration, convergence timeouts, and unrescued urgency.
3. **Headline chart:** mission score against connectivity, one panel per topology, one curve per mode, with error bars.
4. **Live-vs-headless parity:** run seed 1 `blackout-3` live in all 3 modes (8 min each). **Pass:** live rescues are within ±20% of headless for each mode. Live timing is real, so exact equality isn't expected. Record any gap honestly.
5. Fill in N and M in `hack.md` §8's closing line from the **measured** results.

### Dev B — Acceptance suite (`tests/e2e/acceptance.mjs`, matching hack.md §6.6)

| Check | How |
|---|---|
| Connected agreement | Seed 3, all-up, 60 ticks, pause → one owner per pending task, capacity ≤ 3, digests equal |
| 3-island progress | `blackout-3` → every island rescues at least once, zero cross-island deliveries |
| Reconnection | Restore and pause → digests equal within 10 gossip intervals; a timeout fails |
| Duplicate and reordered gossip | `duplicate_rate=0.5`, `reorder=true` for 60 ticks → rescue count and score match a clean run of the same seed (from the headless run) within ±1 survivor, and no duplicate rescues |
| Conflicting commitments | Seed chosen so both islands commit to one survivor → exactly 1 rescue, duplicated work > 0 is reported |
| Actor restart | Mid-run, `docker compose restart n8n-team-1` and, separately, `store-team-1` → event IDs stay unique (no repeated `(origin, seq)`), no survivor rescued twice, and the actor resumes within 3 ticks |
| Network isolation | `scripts/check-isolation.sh` exits 0 |
| No lost updates | `conflicts: 0` on every store after the whole suite |

Also: tune `w1`–`w3` with the headless runner (Dev A's matrix, seeds 11–20, kept separate from the reported seeds 1–10), and run the `commit_radius` experiment (0 vs 2) as a small table.

### Gate 5
Every acceptance check passes **twice in a row**. `summary.csv` and the charts are committed. `hack.md` §8 has measured numbers.

**Stretch goal (only if Gate 5 passes before 20:00):** hack.md §10.1, signed events. The **store** holds an Ed25519 key pair (`node:crypto`) and signs outgoing events on `POST /sign`. Receivers verify with `POST /verify`. A rule in core lowers trust when a survivor claim is contradicted by the receiver's own sensor reading. Keep the crypto in the store, because Code nodes can't load `crypto` reliably in n8n 2.x.

---

## Phase 6 — Freeze and rehearse (21:00–24:00)

- **21:00 code freeze.** Only demo-breaking bugs get fixed after this, and only on a branch that passes Gate 5 again.
- Write a **demo script** (`tests/e2e/demo.mjs`): reset with the demo seed → all-up → the judge-facing distress text at 15 s → BLACKOUT at 25 s → RESTORE at 60 s → pause, wait for convergence → open the chart. The live presenter clicks the buttons; the script is the backup.
- **Rehearse 5 times.** Time each run against hack.md §8's table.
- **Record a backup video** of a clean run (QuickTime → New Screen Recording).
- **Slides (3 max):** the story and statistics, the architecture, the measured chart.
- **Gate 6:** the demo runs clean **3 times in a row** from a cold `docker compose up`.

**Demo-day setup:** open drone-1 and team-1's editors at `http://drone-1.localhost:5671` and `http://team-1.localhost:5675` (owner accounts created in Phase 0). Set `EXECUTIONS_DATA_SAVE_ON_SUCCESS=all` on **those two instances only**, so their Executions tabs fill up live as runs happen.

---

## 12. Reference

### 12.1 Parameters
See `contracts/params.json` (C7). Change values there only; world and core both read the file.

### 12.2 Compose settings per n8n instance (generated by `gen-compose.mjs`)

```yaml
n8n-drone-1:
  image: n8nio/n8n:${N8N_VERSION}
  restart: unless-stopped
  mem_limit: 560m                      # 8 GB laptops: see §1.2
  ports: ["5671:5678"]                 # drone-1..4 → 5671..5674, team-1..3 → 5675..5677
  environment:
    NODE_OPTIONS: "--max-old-space-size=320"   # caps the heap below mem_limit
    N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
    N8N_CONCURRENCY_PRODUCTION_LIMIT: "1"   # D2: one execution at a time per actor
    EXECUTIONS_DATA_SAVE_ON_SUCCESS: none   # set to "all" on drone-1 and team-1 for the demo
    EXECUTIONS_DATA_SAVE_ON_ERROR: all
    EXECUTIONS_DATA_PRUNE: "true"
    EXECUTIONS_DATA_MAX_AGE: "12"           # hours
    N8N_DIAGNOSTICS_ENABLED: "false"
    N8N_SECURE_COOKIE: "false"              # plain-http editor on *.localhost
    GENERIC_TIMEZONE: Europe/London
  volumes:
    - n8n_drone_1:/home/node/.n8n
    - ./n8n/build:/hive/build:ro
    - ./n8n/credentials:/hive/credentials
  networks: [net-drone-1]
  depends_on:
    store-drone-1: { condition: service_healthy }
    # every n8n after the first also waits for the previous n8n (D11), e.g. n8n-drone-2 → n8n-drone-1
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://localhost:5678/healthz/readiness').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
    interval: 10s
    start_period: 180s
    retries: 18

store-drone-1:
  build: ./services/store
  environment: { ACTOR_ID: drone-1, ROLE: drone, MODE: "${MODE}", PEERS: "drone-2,drone-3,drone-4,team-1,team-2,team-3" }
  volumes: [store_drone_1:/data]
  networks:
    net-drone-1: { aliases: [store] }
```
- `sim`, `proxy` and `dashboard` join **all 7** `net-*` networks; `proxy` also joins `net-hq`.
- Only the `dashboard` (8000) and the n8n editors (5671–5677) publish ports to your Mac.
- Workflows never use `host.docker.internal`; the build lint rejects it.

### 12.3 Logging in to several n8n editors at once
Browser cookies ignore port numbers, so `localhost:5671` and `localhost:5675` would log each other out. Use separate hostnames instead: `http://drone-1.localhost:5671`, `http://team-1.localhost:5675`. Chrome sends `*.localhost` to your own machine automatically.

### 12.4 `scripts/deploy-workflows.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
node core/build.mjs && node scripts/build-workflows.mjs
ACTORS="drone-1 drone-2 drone-3 drone-4 team-1 team-2 team-3"
IDS=$(jq -r '.id' n8n/build/*.json)
for a in $ACTORS; do
  svc="n8n-$a"
  docker compose exec -T "$svc" n8n import:credentials --input=/hive/credentials/anthropic.json
  docker compose exec -T "$svc" n8n import:workflow --separate --input=/hive/build/
  for id in $IDS; do
    docker compose exec -T "$svc" n8n unpublish:workflow --id="$id" >/dev/null 2>&1 || true
    docker compose exec -T "$svc" n8n publish:workflow --id="$id"
  done
done
docker compose restart $(printf 'n8n-%s ' $ACTORS)
echo "Waiting for health..."; sleep 20
for p in 5671 5672 5673 5674 5675 5676 5677; do curl -fsS "localhost:$p/healthz" >/dev/null && echo "  :$p ok"; done
```
Spike S2 proves this script as written. If S2 needed its fallback, update the script here to match.

### 12.5 Fallback interpret call (HTTP Request node → Messages API)
- **POST** `https://api.anthropic.com/v1/messages`, with a Header Auth credential `x-api-key: <key>`, plus the headers `anthropic-version: 2026-10-21` and `content-type: application/json`.
- Body:
```json
{
  "model": "claude-haiku-5-5",
  "max_tokens": 1024,
  "system": "You turn flood distress texts into JSON. Districts: Piccadilly, Northern Quarter, Ancoats, Deansgate, Castlefield, Hulme, Salford Quays, Lower Broughton. Urgency 1-5: raise it for children, elderly, injury or rising water.",
  "messages": [{ "role": "user", "content": "{{ $json.body.text }}" }],
  "output_config": { "format": { "type": "json_schema", "schema": {
    "type": "object", "additionalProperties": false,
    "required": ["district", "landmark", "people", "urgency", "hazards"],
    "properties": {
      "district": { "type": "string", "enum": ["Piccadilly","Northern Quarter","Ancoats","Deansgate","Castlefield","Hulme","Salford Quays","Lower Broughton"] },
      "landmark": { "type": ["string", "null"] },
      "people":   { "type": ["integer", "null"] },
      "urgency":  { "type": "integer" },
      "hazards":  { "type": "array", "items": { "type": "string" } }
    } } } }
}
```
- **Read the result:** the JSON is in the `text` block of `content`: `{{ JSON.parse($json.content.find(b => b.type === 'text').text) }}`. Haiku 5.5 may also return a `thinking` block first, so always select by `type`, never by position.
- Check `stop_reason`: if it's `"refusal"` or `"max_tokens"`, take the regex fallback.
- **Never** add `temperature`, `top_p` or `top_k`: on this API version they return a 400.

### 12.6 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Ticks fall further and further behind | Executions take longer than `TICK_MS`, so the queue grows | Check execution time in the Executions tab; raise `TICK_MS` to 3000 (headless uses ticks, so results still compare) |
| `409` errors in executions | Two executions overlapped | Check that `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` actually took effect (S3), and that no workflow uses a Wait node |
| Webhook returns 404 | The workflow isn't published | Re-run `deploy-workflows.sh`; check it with `n8n list:workflow` |
| An island never converges | Gossip blocked by a 503, or a CBBA bug | The proxy log shows `refused` or `dropped`; reproduce headless with the same seed and links |
| AI node returns 400 | A sampling parameter (temperature, top-p, top-k) is being sent | Switch to the §12.5 HTTP fallback |
| Docker freezes or OOM-kills containers | Out of memory | `docker stats`; raise Docker's memory or lower `mem_limit`; close the browser tabs you don't need |
| n8n never becomes ready, load stays very high | Several n8n instances doing first-boot migrations at once | Don't start n8n containers by hand in parallel; use `docker compose up -d`, which boots them one at a time (D11). A cold boot takes about 6 minutes |
| `docker pull` fails with `docker-credential-desktop: executable file not found` | Docker Desktop's helper folder isn't on the PATH | Add `export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"` to `~/.zshrc` |
| `docker info` hangs | Docker Desktop is still starting or stuck | Quit and reopen Docker Desktop, then wait for "Engine running" |

---

**What's already verified:** the starter store (3 tests) and the core's event log and CBBA (6 tests), including that bid warping is *required* for convergence with this scoring. The API request format comes from current Anthropic docs. The n8n 2.x behaviour (task runners, blocked env access, publish, the concurrency limit) comes from n8n's docs. Spikes S1–S7 prove each n8n behaviour on your machines in the first 90 minutes, before anything is built on top of it.
