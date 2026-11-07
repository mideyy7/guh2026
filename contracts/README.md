# HIVE contracts

**Status: draft by Dev A (Phase 0). Dev B must review before Gate 0.** After Gate 0 this file is frozen: changing it needs both devs to agree, and the change goes in one commit with a note in the changelog at the bottom.

These are the only things Dev A's world/infra and Dev B's actor brain share. If it isn't written here, neither side may depend on it.

Shared constants live in [params.json](params.json). Both `world/` and `core/` read that file; never copy its numbers into code.

---

## Conventions

| Thing | Format |
|---|---|
| Actor IDs | `drone-1`…`drone-4`, `team-1`…`team-3`. `hq` exists only in the central baselines. |
| Cells | String `"x-y"`, `x` and `y` in `0..grid-1`. `{x, y}` objects only in `pos` and `target`. |
| Distance | Chebyshev: `max(|dx|, |dy|)`. Diagonal moves are allowed. |
| Ticks | Integers from 0. One tick = `tick_ms` of wall time in the live system. |
| Time for CBBA | Milliseconds. The live shell passes `Date.now()`; the headless benchmark passes simulated ms. |
| Hostnames, as seen from inside an actor's n8n | `store` (its own store), `sim`, `proxy`. Nothing else. |
| Hostnames, as seen from sim/proxy/dashboard | `n8n-<id>`, `store-<id>`, `hq`. |
| Errors | JSON `{error: "message"}` with a 4xx/5xx status. |

---

## C1. Actor store (Dev A builds; done)

Base URL from the actor's n8n: `http://store:4000`. From the dashboard: `http://store-<id>:4000`.

| Method + path | Request | Response |
|---|---|---|
| `GET /config` | — | `{"actor_id":"team-1","role":"team","mode":"hive","peers":["drone-1",...]}` |
| `GET /state` | — | `{"config":{...},"version":3,"state":{...}}` (state is `null` until first write; version starts at 0) |
| `PUT /state` | `{"version":3,"state":{...}}` | `200 {"version":4}` · `409 {"error":"stale version","current":4}` · `400` if malformed |
| `POST /reset` | — | `200 {"version":0}` |
| `GET /health` | — | `{"ok":true,"conflicts":0,"actor_id":...,"role":...,"mode":...,"peers":[...]}` |

`conflicts` counts 409s since the store started. Acceptance requires 0.

---

## C2. Simulator (Dev A builds; actors call it)

Base URL: `http://sim:3000`.

**Simulator → actor tick** (fire-and-forget, 1 s timeout, errors ignored):
```http
POST http://n8n-<id>:5678/webhook/tick
{"tick": 41}
```

**Sense** — only this actor's footprint; only survivors that have appeared and are unrescued:
```http
GET /sense?actor=drone-2
→ {"tick":41,"actor":"drone-2","pos":{"x":3,"y":4},
   "footprint":["1-2","2-2","3-2", "...", "5-6"],
   "detections":[{"survivor_id":"s07","cell":"4-5","people":3,"urgency":5}]}
```

**Move** — queued; applied at the next world step at the actor's speed. A repeated `key` is ignored:
```http
POST /move  {"actor":"team-1","target":{"x":4,"y":5},"task_id":"T-s07","key":"team-1:41:move"}
→ {"ok":true,"pos":{"x":2,"y":3}}
```

**Rescue** — idempotent per `key`:
```http
POST /rescue  {"actor":"team-1","survivor_id":"s07","key":"team-1:T-s07:rescue"}
→ {"result":"rescued","tick":52}          // or "already_rescued" | "not_here"
```

**Simulator → drone distress delivery** (only to the nearest drone within `distress_radius` of the sender's cell; retried every tick until one is in range):
```http
POST http://n8n-<drone>:5678/webhook/distress
{"msg_id":"m03","text":"stuck on roof w/ 2 kids near Piccadilly, water rising","sent_tick":30,"delivered_tick":33}
```

**Dashboard-only** (actors must never call these; the workflow build lint rejects them): `GET /world`, `GET /metrics`, `POST /control/reset {"seed":1}`, `POST /control/start`, `POST /control/pause`.

---

## C3. Chaos proxy (Dev A builds)

Base URL: `http://proxy:8080`.

**Send** — returns immediately; delivers in the background:
```http
POST /send  {"from":"drone-1","to":"team-1","path":"merge","body":{ ...gossip... }}
→ 202 {"n":1043,"status":"queued"}        // or 503 {"n":1044,"status":"refused"} when the link is down
```
Delivery goes to `http://n8n-<to>:5678/webhook/<path>` after `delay_ms`, may be dropped (`drop_rate`), duplicated (`duplicate_rate`) or reordered (`reorder`).

**RPC to HQ** (central baselines only) — synchronous:
```http
POST /rpc  {"from":"team-1","to":"hq","path":"report","body":{...}}
→ 200 <HQ's response>   |   503 {"status":"refused"}
```

**Links:**
```http
GET  /links  → {"allowed":{"drone-1":{"drone-2":true,...},...},"delay_ms":0,"drop_rate":0,"duplicate_rate":0,"reorder":false}
PUT  /links  (same shape; partial updates allowed)
POST /links/preset {"name":"blackout-3"}   // all-up | blackout-3 | drones-vs-teams | isolate-one | flapping | percent (+ "seed","percent")
```

**Log:**
```http
GET /log?since=1040
→ [{"n":1041,"ts":1762530000123,"from":"drone-1","to":"team-1","path":"merge","status":"delivered","bytes":2311}, ...]
```
`status` is one of `refused`, `queued`, `dropped`, `delivered`, `failed`.

---

## C4. Events and gossip (Dev B defines)

```js
Event = { id: "drone-1:17", origin: "drone-1", seq: 17, type, data, tick }
```

| `type` | `data` |
|---|---|
| `TASK_CREATED` | `{task_id, survivor_id \| null, cell, people, urgency, provisional, source: "sensor" \| "text", resolves?}` |
| `CELL_SEARCHED` | `{cell}` |
| `COMMITTED` | `{task_id}` |
| `ATTEMPT` | `{task_id, survivor_id, result}` |
| `RESCUED` | `{task_id, survivor_id}` |

Task IDs: `T-<survivor_id>` for sensor-confirmed tasks, `P-<msg_id>` for provisional (text-only) tasks.

```js
Gossip = { from, sent_at /* ms */, vv: { origin: seq }, events: [Event] /* ≤ gossip_max_events */,
           cbba: { y: {task: bid}, z: {task: actor|null}, s: {actor: ms} }, hint: { pos, heading } }
```

---

## C5. `state.view` (Dev B writes; the dashboard reads only this)

```json
{ "actor_id": "team-1", "role": "team", "tick": 41, "pos": {"x":2,"y":3},
  "action": "travelling", "target": {"x":4,"y":5},
  "bundle": ["T-s07"], "owners": {"T-s07": "team-1", "T-s02": "team-2"},
  "known_tasks": 6, "provisional": 1, "digest": "9f3a01c2", "vv": {"drone-1": 17, "team-1": 4} }
```
`action` is one of `searching`, `travelling`, `rescuing`, `idle`. `digest` is 8 hex characters.

---

## C6. Core API (Dev B implements; the n8n shell and Dev A's headless benchmark both call it)

```js
HiveCore.init(config, nowMs)                         → state
HiveCore.perceive(state, {tick, sense}, nowMs)       → state
HiveCore.bid(state, nowMs)                           → state            // no-op unless state.dirty
HiveCore.act(state, {hq}, nowMs)                     → {state, actions: [Action]}
HiveCore.applyReceipts(state, receipts, nowMs)       → state
HiveCore.hqRequest(state)                            → body | null       // central modes only
HiveCore.gossip(state, nowMs)                        → {state, messages: [{to, body: Gossip}]}
HiveCore.merge(state, body, nowMs)                   → state
HiveCore.interpret(state, parsed | null, raw, nowMs) → state            // parsed null → regex fallback
HiveCore.score(pos, task, bundlePath, tick, params)  → number           // shared with HQ
HiveCore.sharedDigest(state)                         → string
HiveCore.PARAMS                                       // contents of params.json, baked in at build time

Action  = {kind:"move", target:{x,y}, task_id, key} | {kind:"rescue", survivor_id, key}
Receipt = {key, kind, response}                       // response is the simulator's JSON reply
```
All functions are pure: no I/O, no `Date.now()`, no `Math.random()` inside. Time comes in as `nowMs`.

---

## C7. Shared parameters

See [params.json](params.json). Notes:
- `speed.team: 0.5` means one cell every 2 ticks.
- `sensor_radius` is Chebyshev, so radius 2 is a 5×5 block and radius 1 is a 3×3 block.
- `islands.blackout-3` is the demo partition; every island has at least one drone and one team.
- `ports.n8n_host_base: 5671` maps drone-1..4 to 5671..5674 and team-1..3 to 5675..5677 on the host.

---

## Changelog
- Phase 0: initial draft (Dev A). Awaiting Dev B review.
- Phase 1 (Dev A), **additive only**, nothing existing changed:
  - Proxy: `POST /links/toggle {a, b, up?}` (click-to-cut, both directions), `POST /reset`, `GET /health`. Log entries also carry `msg` (message id, shared by a message's queued/delivered/dropped entries) and `reason` on dropped/failed. A message whose link is cut while in flight is logged `dropped`.
  - Sim: `GET /events?since=n`, `GET /status`, `POST /control/step {n}` (only while paused), `POST /control/speed {tick_ms}`. The run stops by itself at `horizon_ticks`. `POST /rescue` from a drone returns 400. A distress text whose delivery fails goes back to "Sending…" and is retried.
  - **HQ reply (central baselines), found by the headless benchmark:** `POST /rpc … path "report"` returns `{"assignment": "T-s07" | null, "task": {"id","survivor_id","cell","urgency","people"} | null}`. The task details are required: a team only knows tasks it detected itself, so a bare ID can't be acted on. The report body is `HiveCore.hqRequest(state)` = `{actor, role, tick, pos, detections:[{task_id, survivor_id, cell, urgency, people}], done:[survivor_id]}`. `act(state, {hq})` must add `hq.task` to the team's known tasks.
  - **Move commands last one tick** (as C2 says: "applied at the next world step"). An actor re-sends `POST /move` every tick it wants to keep moving; an actor that sends nothing holds position. A team's half-speed progress carries over only while it keeps commanding the same target. (Found by the benchmark: with persistent targets, a central-naive team that lost HQ kept walking.)
  - Sim (dashboard-only): `POST /control/inject {cell, people, urgency, text}` adds a survivor that appears now plus their distress text, which is then delivered like any other (only once a drone is within range). Used by the demo's scripted text and the dashboard's "Send text" box.
  - Presets: the HQ reachability policy per preset is defined in `world/links.mjs` (blackout-3, drones-vs-teams and flapping cut HQ; isolate-one cuts only the isolated actor; percent decides each actor's HQ link with probability p).
