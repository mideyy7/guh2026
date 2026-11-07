# HIVE — Self-Healing Emergency Response Swarm

**Neptune North Challenge · GreatUniHack 2026 · _"Actors work better together"_**

> HIVE is a rescue swarm with no central dispatcher. Cut its network and every island keeps saving people. When links return, it heals back into one shared picture. We also measure what this gains and what it costs compared with central dispatch.

---

## The problem

When floods or storms take down the phone network, rescuers can still be close to people who need help but lose contact with dispatch. A system with a central controller stops working at that point. HIVE tests a different approach: drones and rescue teams coordinate directly with whichever peers they can still reach. They keep working in disconnected groups and reconcile their knowledge when the network recovers.

## What it does

A simulated, flooded Manchester (an 8×8 grid in 8 districts) holds hidden survivors. Seven independent **actors** work together to find and rescue them:

- **4 drones** search the grid with a wide sensor and detect survivors. They also act as local receivers for **distress texts**. A text only reaches HIVE when a drone is within range of the sender.
- **3 rescue teams** bid for rescue tasks, travel to them and carry them out. Each team has its own short-range sensor, so even a fully isolated team can still help people nearby.
- **Distress texts** are messy free text, for example _"stuck on roof w/ 2 kids near Piccadilly, water rising"_. Claude turns each one into a structured, *provisional* task. A regex parser takes over if the AI is slow or unavailable. A sensor must confirm the task before it is treated as real.

Each actor is a **separate n8n instance** running identical workflows on its own private store. **No server tells any actor what to do.**

## How HIVE answers the Neptune North challenge

> _"Design an approach to a problem which involves systems working together in a distributed fashion, even when communications are interrupted."_ — Neptune North brief

The brief describes a network of actors where some links fail and one node becomes cut off. HIVE builds that situation and then asks what the swarm should do about it. Each judging criterion maps to a working mechanism in the code and a test that checks it.

### 1. Working towards a common goal

All seven actors maximise one **shared mission score**:

```
score = Σ over rescued survivors of  urgency × exp(−time_to_rescue / τ)
```

The score rewards urgent survivors and penalises delay. Each actor's local bid uses the same terms (urgency, travel time, current load), so a choice that is good for one actor is also good for the swarm. Drones and teams play **complementary roles**. A drone finds a survivor, a team bids on the rescue, and the rescue only happens if both did their part. A drone acting alone saves nobody, and a team acting alone is nearly blind. The swarm only succeeds if they cooperate.

### 2. Independent decision-making

There is **no dispatcher, no leader election and no vote.** Every actor:

- reads only **its own** sensor readings (the simulator returns what that actor could physically sense, never the whole map);
- keeps **its own** event log, version vector and bid table in **its own** store;
- scores tasks and builds its own bundle with **CBBA** (Consensus-Based Bundle Algorithm, MIT), then resolves conflicts with peers using the same deterministic rules everywhere. Every actor reaches the same answer from the same information without anyone imposing it;
- decides by itself when to move, what to search next and when to commit to a rescue.

All seven n8n instances run **byte-identical workflows**. The only difference between drone-1 and team-3 is the role their store reports at `GET /config`. The dashboard shows each actor's **own belief** about who owns which task, side by side, so judges can watch the actors agree, or disagree during a split.

### 3. Resilience when communications fail

The network failures are real, not a status label. Each actor sits on **its own private Docker network** and reaches peers only through a chaos proxy. Pressing **BLACKOUT** cuts links in the proxy, so peer requests across islands are actually refused. `scripts/check-isolation.sh` proves that no actor can bypass the proxy.

| During the outage | How HIVE keeps making progress |
|---|---|
| Network splits into islands | Each island runs CBBA among the peers it can still reach and keeps searching and rescuing |
| An actor is fully alone | Teams have their own short-range sensor and keep the tasks they already hold, so an isolated boat still saves the people it can see |
| Lost or out-of-date peer information | Drones steer away from cells a peer was last heading for, and trust older information less over time |
| Messages dropped, duplicated or reordered | Event IDs are `(actor_id, seq)`. Version vectors only advance over contiguous events. Replays have no effect, and missing events are resent on the next successful sync |
| Links return | Anti-entropy gossip exchanges exactly the missing events. Conflicting claims resolve with CBBA rules, the loser replans, and all actors converge on one shared picture |
| Actor restarts mid-mission | State is rebuilt from the persisted log. Pending action intents are reconciled with simulator receipts, so no event ID is reused and no rescue is repeated |

**We are honest about what a split costs.** Two disconnected islands *can* both send a boat to the same roof, which is the CAP trade-off in physical form. HIVE chooses to keep making progress, and it **measures** the cost: duplicate commitments and wasted travel are logged, and the simulator rescues each survivor exactly once. Every row of the acceptance table in [hack.md §6.6](hack.md) (agreement, islands rescuing independently, convergence within 10 gossip rounds, replay safety, restart, isolation) is an automated check in `tests/e2e/checks.mjs`. Each check is shown to pass on a correct run and to fail on a deliberately broken run of the in-memory 7-actor system.

### 4. Something we're excited about

HIVE applies real distributed-systems techniques to a problem that matters: CBBA task allocation with bid warping, version vectors, grow-only set CRDTs (sets that merge safely without coordination), idempotent actions and an actor model with one execution at a time. Rather than just claiming decentralisation is better, we built a **benchmark that could prove us wrong**. HIVE runs against a naive and a strong central dispatcher on the same seeds, actors and outages, across 5 outage shapes and a connectivity sweep. The data decides, and we show it either way.

## How it works

```
  World simulator ──ticks / sensing──▶  drone-1 … drone-4, team-1 … team-3
   (physics only)                        (one n8n + one store each, own private network)
                                                     │
                                  every peer message ▼
                                ┌───────────────────────────────┐
                                │ Chaos proxy (link matrix)     │  cut / drop / delay / duplicate / reorder
                                └───────────────────────────────┘
                                                     ▲ control only
                                Dashboard (read-only observer: map, links, per-actor beliefs, metrics)
```

| Idea | How HIVE does it |
|---|---|
| **Task allocation** | An asynchronous **CBBA** (Consensus-Based Bundle Algorithm). Each actor scores tasks locally (`urgency × decay − travel − load`), builds a bundle and resolves conflicts with peers using deterministic rules. There is no auctioneer and no vote. |
| **Eventual consistency** | Each actor keeps an append-only event log with `(actor_id, seq)` IDs, version vectors and anti-entropy gossip. Searched and rescued cells are grow-only sets. Duplicate or reordered messages have no effect. |
| **Partitions** | Each island runs CBBA among the peers it can reach. Planning is reversible, but committing to a rescue on arrival is not. Duplicate work during a split is **measured, not hidden**: the simulator rescues each survivor exactly once. |
| **Honest isolation** | Each actor has its own Docker network and can reach peers only through the chaos proxy. A cut link means a real failed connection, not a status label. The dashboard only observes, and the simulator only handles physics. |
| **One brain, two runtimes** | The decision logic in `core/` is pure JavaScript. The same code runs inside n8n Code nodes and in the headless benchmark, so benchmark results reflect the code the live actors run. |

## Built on n8n: seven independent n8n brains

HIVE doesn't use n8n as a thin wrapper around a script: **n8n is the actor runtime.** Each of the 7 actors is its own self-hosted n8n 2.x instance with its own database, its own execution queue and its own canvas. If you open two instances side by side, you can watch executions light up independently.

### Four workflows, six stages, identical on every actor

| Workflow | Trigger | Node pipeline | Role |
|---|---|---|---|
| **`hive-tick`** | Webhook (simulator tick, payload is only `{tick}`) | Get State → Sense → **Perceive** → *Central mode?* (IF) → HQ Sync → **Bid (CBBA)** → **Act** → Put State → Split actions → Do Action → Apply receipts → Put State | The actor's heartbeat: sense, allocate, act, all in one ordered execution |
| **`hive-gossip`** | Schedule Trigger (every 4 s, each actor on its own clock) | Get State → **Gossip** → Send via proxy | Anti-entropy: sends each reachable peer only the events its version vector is missing |
| **`hive-merge`** | Webhook (gossip received) | Get State → **Merge** → Put State | Deduplicates events, applies them, runs CBBA conflict rules, flags duplicate commitments |
| **`hive-interpret`** | Webhook (distress text reached a drone) | Build AI request → **Claude (Haiku 5.5)** → Read reply → Get State → **Interpret** → Put State | Turns messy text into a structured, provisional task, falling back to regex if the AI fails or times out |

### n8n engineering decisions

- **The actor model, enforced by n8n itself.** `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` makes each instance run one execution at a time, first in, first out. Tick, Gossip and Merge can never overwrite each other's state. As a backstop, the store rejects stale writes with HTTP 409 and counts them, and acceptance requires **zero** conflicts.
- **Functional core, imperative shell.** All decision logic lives in one pure JS bundle (`core/dist/hive-core.js`). `scripts/build-workflows.mjs` injects it into every Code node at build time. The n8n nodes fetch, call the core and write back. The **same code** runs in n8n, in the unit tests and in the headless benchmark, so the benchmark measures the logic the live actors run.
- **Built for n8n 2.x's isolated task runner.** Code nodes can't reliably use npm modules or `process.env`. So each actor gets a **store sidecar** (Node + built-in `node:sqlite`), reached over HTTP Request nodes at `http://store:4000`. Configuration also comes from that store, which is what keeps the workflow files byte-identical.
- **A build-time lint that enforces decentralisation.** The workflow build fails if any HTTP Request node calls anything other than its own store, the simulator's sensing and actuation endpoints, or the proxy (plus the Anthropic API for `hive-interpret` only). Calls to "god view" endpoints (`/world`, `/metrics`, `/control`) and environment access are rejected. An actor *cannot* be built to cheat.
- **AI with a safety net.** `hive-interpret` calls Claude through an HTTP Request node with a strict timeout. Its output is clamped (urgency 1–5) and kept *provisional* until a drone's sensor confirms it. If the call fails, a regex parser with a district gazetteer takes over. We measured this path at ≥ 15 of 20 texts placed correctly with no AI at all.
- **Reproducible deployment.** `scripts/deploy-workflows.sh` builds the core and workflows, then imports and publishes them to every instance by CLI with a shared encryption key. The n8n instances boot one at a time, each gated on `/healthz/readiness`. We measured that 7 simultaneous cold boots never finished on an 8 GB laptop, while the staggered boot is ready in 5 min 41 s at about 350 MiB per instance.
- **Tested outside Docker.** `n8n/test/emulator.mjs` runs the real built workflow JSON through a small n8n emulator, so the workflow wiring is checked by `npm test` on any machine.

Full design and rationale: [hack.md](hack.md). Phase-by-phase build plan and decisions: [implementation.md](implementation.md). Interfaces between the components: [contracts/README.md](contracts/README.md), with the world and infrastructure detail in [contracts/README.dev-a.md](contracts/README.dev-a.md).

## Benchmark

Each seeded scenario runs in three modes with the same actors, sensors, scoring function and outages:

| Mode | Behaviour when cut off |
|---|---|
| **HIVE** | Keeps coordinating with every peer it can reach |
| **Central (naive)** | A single HQ dispatcher assigns tasks; an actor that can't reach HQ stops |
| **Central (strong)** | Same as naive, except the actor first finishes the tasks it already has |

Outage shapes tested: balanced islands (`blackout-3`), drones cut off from teams, one isolated actor, flapping links, and sweeps from 100% down to 0% of links up. Metrics: rescues, mission score, unrescued urgency, time to rescue, duplicated work, message overhead and time to converge after reconnection. Each result is reported as a mean and spread across seeds.

```bash
node bench/run.mjs --mode hive --topology blackout-3 --seed 1   # one run
node bench/matrix.mjs                                          # full matrix → bench/results/report.html
node scripts/experiment-commit-radius.mjs                      # commit_radius 0 vs 2 experiment
```

## Quickstart

**Requirements:** Node ≥ 22.13. For the live stack you also need Docker Desktop with about 5 GB of memory and a `.env` file copied from `.env.example` (set `N8N_VERSION`, `N8N_ENCRYPTION_KEY` and `ANTHROPIC_API_KEY`).

### Without Docker

```bash
npm test                         # builds the core, then runs all unit tests (core, world, services, n8n, bench)
open mockup/index.html           # interactive UI prototype, no build needed
```

### Full live system

```bash
node scripts/gen-compose.mjs         # writes docker-compose.yml for all 7 actors
docker compose up -d                 # first boot takes ~6 min: n8n instances start one at a time
bash scripts/check-isolation.sh      # proves actors can only reach each other through the proxy
bash scripts/deploy-workflows.sh     # builds the core and n8n workflows and deploys them to every actor
open http://localhost:8000           # the dashboard
```

Smaller dev stack (about 2 GB): `node scripts/gen-compose.mjs --actors drone-1,drone-2,team-1,team-2`, then deploy with `ACTORS="drone-1 drone-2 team-1 team-2" bash scripts/deploy-workflows.sh`.

### Live end-to-end checks

These scripts drive the running stack through the dashboard API (details in [tests/e2e/README.md](tests/e2e/README.md)):

```bash
node tests/e2e/smoke-infra.mjs     # infrastructure smoke test
node tests/e2e/checkpoint8.mjs     # a drone finds, a team rescues, a cut link stops sync
node tests/e2e/checkpoint14.mjs    # 3-island blackout: every island rescues, then reconverges
node tests/e2e/ai.mjs              # distress texts → provisional tasks → sensor confirmation
node tests/e2e/central.mjs         # central baselines behave as specified
node tests/e2e/acceptance.mjs      # every acceptance check in hack.md §6.6
node tests/e2e/demo.mjs --dry      # the scripted 90-second demo timeline
```

## Repository layout

| Path | Contents |
|---|---|
| `core/` | Pure decision logic: events, CBBA, scoring, search, gossip digest, distress-text fallback. `core/build.mjs` bundles it for n8n. |
| `n8n/` | Workflow sources (`hive-tick`, `hive-gossip`, `hive-merge`, `hive-interpret`), build output and workflow tests |
| `world/` | Seeded world model: scenario generator, gazetteer, grid, physics, link presets, central dispatcher |
| `services/` | `store` (per-actor SQLite state), `sim` (world simulator), `proxy` (chaos proxy), `hq` (central baselines), `dashboard` (observer UI and API) |
| `bench/` | Headless benchmark runner, matrix, CSV/JSON summary and HTML report |
| `contracts/` | Shared interfaces (C1–C7), `params.json` (all shared constants) and `gazetteer.json` |
| `tests/` | Live end-to-end scripts (`e2e/`), AI accuracy fixtures (`ai/`), UI check screenshots (`ui/`) |
| `scripts/` | Compose generator, isolation check, workflow build/deploy, memory test, fixture generator, experiments |
| `spikes/` | Early feasibility spikes (n8n Code-node simulation, Anthropic API) |
| `mockup/` | Stand-alone interactive dashboard prototype |
| `presentation/` | Demo script and speaker notes |

## Tech stack

n8n 2.x (one instance per actor) · Node.js with `node:sqlite` store sidecars · Claude for distress-text interpretation, with a regex fallback · Docker Compose with one private network per actor · a vanilla JS dashboard with a geographic map.

## Status

- **Done:** world simulator, chaos proxy, stores, HQ, dashboard, compose generator and isolation check (Dev A). Pure core with CBBA, gossip and merge, restart recovery and distress interpretation, plus the n8n workflows and the acceptance-check logic (Dev B). Both halves are merged on `main`, and the unit tests pass without Docker.
- **Remaining:** deploy the n8n workflows to the live Docker stack and run the e2e and acceptance scripts against it. Then rerun the benchmark matrix with the real core for the headline numbers, and check that the AI fixtures use the same district names as the updated real-geography gazetteer.

## Team

Built at GreatUniHack 2026 by Dev A (world, infrastructure, benchmark, dashboard) and Dev B (actor core, CBBA, n8n workflows, AI interpretation, acceptance suite).
