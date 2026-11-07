# HIVE contracts

These shapes are **frozen** after Phase 0. A change needs both Dev A and Dev B to agree, and must be made here first, in the same commit as the code that uses it.

The values in [params.json](params.json) are the only source of shared constants. The world, the core, HQ and the benchmark all read that file. Nobody hard-codes a constant from it.

**Field naming:** every JSON field in every contract is `snake_case`. (The starter `events.js` used `data.survivorId` for `RESCUED`. Phase 1 renames it to `survivor_id` to match C4.)

---

## IDs

| Thing | Format | Examples |
|---|---|---|
| Actor | `drone-1`…`drone-4`, `team-1`…`team-3`; `hq` (central baselines only) | `team-2` |
| Cell | `"x-y"`, with `x, y ∈ 0..7` (from `params.grid`) | `"3-5"` |
| Position | `{x, y}` integers | `{"x":3,"y":5}` |
| Tick | integer starting at 0 | `17` |
| Event | `<origin>:<seq>` | `"drone-1:17"` |
| Confirmed task | `T-<survivor_id>` (the same on every actor that detects the survivor) | `"T-s07"` |
| Provisional task | `P-<msg_id>` (made from a distress text, not confirmed by a sensor yet) | `"P-m12"` |
| Action key | `<actor>:<task>:<verb>` for rescues; `<actor>:<tick>:move` for moves | `"team-1:T-s07:rescue"` |

Distance is **Chebyshev** (diagonal moves allowed): `max(|dx|, |dy|)`.

---

## C1. Actor store (Dev A, already built: [services/store](../services/store))

Each actor reaches its own store at `http://store:4000`.

| Call | Request | Response |
|---|---|---|
| `GET /config` | — | `{actor_id, role, mode, peers[]}` |
| `GET /state` | — | `{config, version, state}`, where `state` is `null` before the first write |
| `PUT /state` | `{version, state}` | `200 {version}` (the new version), or `409 {error, current}` if `version` is stale |
| `POST /reset` | — | `200 {version: 0}`. Clears state (used by the scenario runner). |
| `GET /health` | — | `{ok, conflicts, actor_id, role, mode, peers}`. `conflicts` counts 409s since start; acceptance requires 0. |

```json
// GET /state on a fresh store
{ "config": { "actor_id": "team-1", "role": "team", "mode": "hive", "peers": ["drone-1","drone-2","drone-3","drone-4","team-2","team-3"] },
  "version": 0, "state": null }

// PUT /state
{ "version": 0, "state": { "view": { "actor_id": "team-1" } } }      // → 200 { "version": 1 }
```

`role ∈ {"drone","team"}`, `mode ∈ {"hive","central-naive","central-strong"}`.

---

## C2. Simulator (Dev A builds, actors call it at `http://sim:3000`)

| Call | Request | Response |
|---|---|---|
| sim → actor `POST /webhook/tick` | `{tick}` | ignored. Fire-and-forget with a 1 s timeout. |
| `GET /sense?actor=ID` | — | see below |
| `POST /move` | `{actor, target:{x,y}, task_id?, key}` | `{ok, pos}`. One step at the next world step. A repeated `key` is ignored. |
| `POST /rescue` | `{actor, survivor_id, key}` | `{result, tick}`, `result ∈ "rescued" \| "already_rescued" \| "not_here"`. Idempotent per `key`. |
| sim → drone `POST /webhook/distress` | `{msg_id, text, sent_tick, delivered_tick}` | ignored |
| Dashboard only | `GET /world`, `GET /metrics`, `POST /control/reset {seed}`, `/control/start`, `/control/pause` | **Actors must never call these.** The build lint fails if they do. |

```json
// GET /sense?actor=drone-1
{ "tick": 12, "actor": "drone-1", "pos": { "x": 3, "y": 3 },
  "footprint": ["1-1","2-1","3-1","4-1","5-1", "...", "5-5"],
  "detections": [ { "survivor_id": "s07", "cell": "4-2", "people": 3, "urgency": 4 } ] }
```

`footprint` covers the cells within `sensor_radius[role]`. `detections` lists only survivors who have appeared and aren't rescued yet.

---

## C3. Chaos proxy (Dev A, at `http://proxy:8080`)

| Call | Request | Response |
|---|---|---|
| `POST /send` | `{from, to, path:"merge", body}` | `202` (queued) or `503` (link down). Delivered to `http://n8n-<to>:5678/webhook/<path>` after `delay_ms`, or dropped at `drop_rate`. |
| `POST /rpc` | `{from, to:"hq", path, body}` | HQ's response, passed through synchronously, or `503` |
| `GET/PUT /links` | `{allowed:{from:{to:bool}}, delay_ms, drop_rate, duplicate_rate, reorder}` | same shape |
| `POST /links/preset` | `{name, seed?, percent?}`, `name ∈ all-up \| blackout-3 \| drones-vs-teams \| isolate-one \| flapping \| percent` | the new links |
| `GET /log?since=n` | — | `[{n, ts, from, to, path, status, bytes}]`, `status ∈ refused \| queued \| dropped \| delivered \| failed` |

`blackout-3` islands: `{drone-1, drone-2, team-1}`, `{drone-3, team-2}`, `{drone-4, team-3}`. Every link to `hq` is cut.

---

## C4. Events and gossip (Dev B)

```js
Event  = { id: "drone-1:17", origin: "drone-1", seq: 17, type, data, tick }
Gossip = { from, sent_at /* ms */, vv: { origin: seq }, events: [Event], cbba: { y, z, s }, hint: { pos, heading } }
```

| `type` | `data` |
|---|---|
| `TASK_CREATED` | `{task_id, survivor_id \| null, cell, people, urgency, provisional, source: "sensor" \| "text", resolves?}`. `resolves` is the `P-` ID a sensor detection confirms. |
| `CELL_SEARCHED` | `{cells: [cell]}`: every cell this actor newly searched this tick, in one event (older form `{cell}` is still accepted) |
| `COMMITTED` | `{task_id}`. Irreversible. |
| `ATTEMPT` | `{task_id, survivor_id, result}`, with `result ∈ "already_rescued" \| "not_here"` |
| `RESCUED` | `{task_id, survivor_id}` |

```json
{ "from": "drone-1", "sent_at": 1762516800000,
  "vv": { "drone-1": 17, "team-1": 4 },
  "events": [ { "id": "drone-1:17", "origin": "drone-1", "seq": 17, "type": "TASK_CREATED", "tick": 12,
                "data": { "task_id": "T-s07", "survivor_id": "s07", "cell": "4-2", "people": 3, "urgency": 4,
                          "provisional": false, "source": "sensor" } } ],
  "cbba": { "y": { "T-s07": 31.2 }, "z": { "T-s07": "team-1" }, "s": { "team-1": 1762516799000 } },
  "hint": { "pos": { "x": 3, "y": 3 }, "heading": { "x": 4, "y": 2 } } }
```

`gossip.cbba` carries the CBBA tables only for open, uncommitted tasks, so finished tasks don't ping-pong.

Rules: events are applied once each, in contiguous `seq` order per origin (gaps wait). At most `params.gossip_event_cap` events go in one message. Replaying a message changes nothing.

---

## C5. `state.view` (Dev B writes it; the dashboard reads **only** this)

```json
{ "actor_id": "team-1", "role": "team", "tick": 42, "pos": { "x": 2, "y": 6 },
  "action": "travelling", "target": { "x": 4, "y": 2 },
  "bundle": ["T-s07", "T-s12"], "owners": { "T-s07": "team-1", "T-s12": "team-1", "T-s03": null },
  "known_tasks": 9, "digest": "a3f9c210", "vv": { "drone-1": 17, "team-1": 4 }, "provisional": 1 }
```

`action ∈ "searching" | "travelling" | "rescuing" | "idle"`. `target` is `null` when idle. `digest` is 8 lowercase hex characters.

`owners` covers every open confirmed task. A task someone has `COMMITTED` to is owned by its committer (the lowest actor ID if two committed during a partition); otherwise the owner is the CBBA winner, or `null`. `bundle` lists the team's committed task first, then its CBBA bundle (3 at most in total).

---

## C6. Core API (Dev B; the n8n shell and the benchmark call it the same way)

`core/dist/hive-core.js` defines one global, `HiveCore`, plus a guarded `module.exports`. It has no `require` or `import` statements. The functions are deterministic and do no I/O: the caller passes the time in (`nowMs`) and does all the I/O.

**Ownership:** each function takes ownership of the `state` you pass in. It may modify that object and returns the new state. Copying a 135 KB state on every call took 90% of the run time, so the core doesn't copy. Both real callers already work this way: n8n parses fresh JSON on every execution, and the benchmark chains each returned state into the next call. If you need the old state afterwards, copy it yourself. Events are never modified after they're created.

```js
HiveCore.init(config, nowMs)                         → state
HiveCore.perceive(state, {tick, sense}, nowMs)       → state
HiveCore.bid(state, nowMs)                           → state      // no-op unless state.dirty
HiveCore.act(state, {hq}, nowMs)                     → {state, actions: [{kind:"move", target, task_id, key} | {kind:"rescue", survivor_id, key}]}
HiveCore.applyReceipts(state, receipts, nowMs)       → state
HiveCore.hqRequest(state)                            → body | null // central modes only
HiveCore.gossip(state, nowMs)                        → {state, messages: [{to, body}]}
HiveCore.merge(state, body, nowMs)                   → state
HiveCore.interpret(state, parsed | null, raw, nowMs) → state      // parsed = null → regex fallback
HiveCore.score(pos, task, bundlePath, tick, params)  → number     // shared with HQ for a fair baseline
HiveCore.sharedDigest(state)                         → string
HiveCore.PARAMS
```

`receipts` are the simulator's responses, each paired with the action that produced it: `[{action, response}]`.

---

## C7. Shared parameters

See [params.json](params.json). A team speed of `0.5` means one cell every 2 ticks. `score = w1·urgency·exp(−(age+eta)/tau_ticks) − w2·eta − w3·|path|`.

Three keys go beyond the plan's C7 example: `gossip_event_cap` (the 200-event gossip cap), `commit_radius` (the Phase 3 experiment flag, default 0 = commit on arrival) and `research_ticks` (20). Survivors appear over time, so a cell counts as searched for only `research_ticks` ticks. After that, drones search it again and emit a new `CELL_SEARCHED` event. None of them changes an existing value.

---

## C8. Gazetteer (proposed by Dev B, read by both)

[gazetteer.json](gazetteer.json) holds the 8 districts. Each one is a 2×4 block of cells with a landmark cell and the aliases the regex fallback recognises. Dev A's `world/gazetteer.js` should read this file instead of defining its own, so a district name means the same cells in the world and in the core. The core embeds it at build time as `HiveCore.GAZETTEER`.

| | x 0–1 | x 2–3 | x 4–5 | x 6–7 |
|---|---|---|---|---|
| **y 0–3** | Lower Broughton | Deansgate | Northern Quarter | Ancoats |
| **y 4–7** | Salford Quays | Castlefield | Hulme | Piccadilly |

---

## C9. HQ report and assignment (central baselines; Dev A's HQ answers, Dev B's core asks)

In central modes, `hive-tick` calls `POST proxy:8080/rpc {from, to:"hq", path:"report", body}`, where `body = HiveCore.hqRequest(state)`:

```json
{ "actor": "team-1", "role": "team", "tick": 42, "pos": { "x": 2, "y": 6 },
  "detections": [ { "survivor_id": "s07", "cell": "4-2", "people": 3, "urgency": 4 } ],
  "done": ["s03", "s11"] }
```

`done` lists the last 50 survivors this actor finished (rescued, or found already rescued). HQ replies `{assignment}`. For a team, `assignment` is `{task_id, survivor_id, cell, urgency, people}` or `null`. For a drone it is always `null`, because drones keep searching on their own. A `503` (link down) reaches the core as `hq = null`: `central-naive` then does nothing, and `central-strong` finishes its cached assignment, then idles.

## C10. Distress texts → provisional tasks

`hive-interpret` builds its request with `HiveCore.aiRequest(text)` and reads the reply with `HiveCore.aiParse(response)`, so the accuracy test (`tests/ai/accuracy.mjs`) checks exactly what the workflow sends. The call uses the §12.5 HTTP Request route and an n8n **Header Auth** credential with id `hiveAnthropic001`, named `Anthropic x-api-key` (header `x-api-key`). Spike S6 must export that credential with this id. Any failure gives `parsed = null`, and the regex fallback (`HiveCore.Text.parse`) is used instead. The resulting `TASK_CREATED` event also carries `district` and `via: "ai" | "regex"`, so the dashboard can show which path placed it.

---

## Phase 0 spike results

| Spike | Owner | Result | Notes |
|---|---|---|---|
| S1 memory under load | A | pending | |
| S2 deploy via CLI | B | pending | needs Docker |
| S3 concurrency = 1 serialises | B | pending | needs Docker |
| S4 injected core in a Code node | B | **pre-check pass**; live n8n check pending | `spikes/s4-codenode-sim.mjs`: in a vm sandbox with no `module`/`require` (like the n8n task runner), the existing `module.exports` guard is safe and `HiveCBBA`/`HiveEvents` load. A 293 KB state round-trip takes p50 22 ms, worst 40 ms (budget 200 ms). |
| S5 network isolation | A | pending | |
| S6 shared credential | B | pending | needs Docker |
| S7 AI with Haiku 5.5 | B | **API pass**; n8n AI node check pending | `spikes/s7-anthropic.mjs`: the §12.5 request returns schema-valid JSON, `district: "Piccadilly"`, in ~2.0 s. Sending `temperature` returns **HTTP 400**, confirmed, so the HTTP Request fallback is ready if the AI Agent node sends one. The model counts the sender as a person ("me + 2 kids" gives `people: 3`); the Phase 4 fixtures must label people the same way. |

**Blocker (2026-11-07, Dev B's machine):** Docker Desktop isn't installed, so S2, S3, S6 and the live halves of S4 and S7 can't run here yet.
