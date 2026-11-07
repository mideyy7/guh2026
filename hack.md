# HIVE — Self-Healing Emergency Response Swarm

**Neptune North Challenge · GreatUniHack · November 2026**
*"Actors work better together"*

---

> **Review annotations:** Original proposal content is preserved below. Blocks labelled **REVIEW NOTE** describe suggested changes or additions; they have not been applied.

## 0. Why HIVE exists

> **REVIEW NOTE — SUGGESTED CHANGE — Opening story**
> Consider shortening this for the pitch while retaining this full version as background. Label it an illustrative composite; the claim that every failure happened needs evidence. Make clear that the drone-to-boat connection survives locally.

### "Sending…"

*A composite story. Amara is not a real person, but every failure in this story has happened somewhere in the last ten years.*

It's 1:40 a.m. in Lower Broughton, Salford. The River Irwell has come over its banks for the second time this decade, and the water in Amara's kitchen is now at the light switches.

She's on the flat roof of the extension with her two kids, Tobi (7) and Zara (4), wrapped in the duvet she grabbed on the way up the stairs. The street lights went out an hour ago, when the local substation flooded. Twenty minutes later, the phone mast that serves her street ran out of battery backup.

She types the message anyway:

> *stuck on roof w/ 2 kids near the Irwell, water rising, please*

The message sits under a grey clock icon: **Sending…**

Three miles away, the control room has drones in the air and rescue boats on the water. All of them are waiting for instructions from a central dispatch server, and that server can no longer reach them. One drone flew over Amara's roof eleven minutes ago and its camera picked up three heat signatures. The detection is stored on the drone and goes nowhere. The nearest boat is 400 metres away, holding position and waiting to be told where to go.

Nobody is careless. Every person in that system is doing their job. **The system simply assumed the network would always be there, and on the one night it was needed most, it wasn't.**

**Now run the same night with HIVE.**

The drone sees three heat signatures on a roof. It doesn't need permission. It creates a rescue task, scores it as *urgency 5: children, water rising*, and broadcasts it to whichever peers it can still reach. The boat 400 metres away is one of them. The boat bids on the task, sees no competing bid, and goes.

On the other side of the city, another island of drones and teams is cut off too, and it keeps searching its own streets. When the network comes back at 3 a.m., the two halves of the swarm compare notes, merge what each one learned, flag the one house they both checked twice, and carry on as a single system again.

Amara's message is still showing **Sending…** when the boat's light reaches the roof.

---

### This has already happened

| When and where | What failed | Cost |
|---|---|---|
| **Hurricane Maria**, Puerto Rico, 2017 | The FCC reported **95.2% of cell sites out of service**, with 48 of the island's 78 municipalities at 100% outage | Thousands of deaths in the months that followed, many in communities cut off from help |
| **Valencia DANA floods**, Spain, Oct 2024 | Spain's met office issued a red warning at **07:36**. The phone alert to residents went out at **20:11**, after water had already reached several towns. Around **300,000** phone lines were affected | **More than 220 people died** |
| **Hurricane Helene**, North Carolina, Sept 2024 | **74%** of cell sites in affected counties were down on day one, and **90%** in Mitchell County. Analysts called it the largest cell outage any hurricane has caused | Whole mountain towns had no way to call for help for days |
| **Storm Desmond**, Lancaster, UK, Dec 2015 | One flooded substation cut power to about **55,000–61,000 properties**, and left most communication services in the city down with it | A whole UK city was largely offline for up to two days |

### And it's getting worse

- Floods made up **more than 40%** of all recorded disasters between 2000 and 2019 and affected **1.65 billion people**, more than any other kind of disaster (UNDRR).
- In England, **6.3 million properties** are already in areas at risk of flooding. The Environment Agency projects that this could rise to **around 8 million, 1 in 4 properties, by 2050** (NaFRA 2024).

> **REVIEW NOTE — SUGGESTED CHANGE — Failure claims**
> Qualify the claim that networks always fail first or cause the deaths described. Suggested wording: “Communications failures can compound an emergency. HIVE lets connected local groups coordinate when central connectivity fails.” A fully isolated drone cannot send a new discovery to a separate rescue team. Change “Last year in Valencia” to “In 2024 in Valencia”; verify the statement about deaths before warnings.

### The pattern

Every one of these disasters has the same shape: **the disaster takes out the network first, and then it takes out the people who were relying on it.** Today's emergency-response technology, including most past hackathon winners (see §2), is built around a central hub. A central hub is a single point of failure, and a disaster is exactly when it will fail.

**HIVE is built for the moment the network goes down.** The drones and teams don't wait for permission, don't need a server, and don't stop. They keep searching, keep claiming rescues, keep saving people, and when the network comes back they heal into one picture again.

> **Opening line for the pitch (say it slowly):**
> *"In 2017, Hurricane Maria knocked out 95% of Puerto Rico's cell sites. Last year in Valencia, more than 220 people died in floods, many before any warning reached their phones. In every one of these disasters, the network failed first. We built a rescue swarm that doesn't need one."*

<sub>**Sources:** [FCC Hurricane Maria status reports (via NPSTC)](https://blog.npstc.org/?p=6091) · [BNamericas: Maria telecoms blackout](https://bnamericas.com/en/news/hurricane-maria-causes-telecoms-blackouts-in-us-caribbean-territories) · [2024 Spanish floods (Wikipedia)](https://wikiwand.com/en/articles/2024_Spain_floods) · [Maldita.es: DANA warning timeline](https://maldita.es/clima/20241030/cronologia-dana-avisos-amet-ayudas-gobierno-valencia/) · [Copernicus/FloodList: Spain death toll](https://european-flood.emergency.copernicus.eu/en/node/1115) · [Spanish Ministry for Digital Transformation: network restoration](https://digital.gob.es/en/comunicacion/notas-prensa/secretaria-estado-telecomunicaciones-e-infraestructuras-digitales/2024/11/2024-11-14) · [Benton Institute: Helene recovery](https://benton.org/blog/road-recovery-western-north-carolina) · [Wireless Estimator: Helene outage](https://wirelessestimator.com/articles/2024/unprecedented-outage-no-hurricane-has-knocked-out-more-cell-sites-than-category-4-helene/) · [Univ. of Birmingham: collapse of Lancaster's infrastructure](https://research.birmingham.ac.uk/en/publications/a-perfect-storm-the-collapse-of-lancasters-critical-infrastructur) · [UN News: UNDRR 2000–2019 report](https://news.un.org/en/node/1075142) · [GOV.UK: NaFRA 2024](https://www.gov.uk/government/publications/national-assessment-of-flood-and-coastal-erosion-risk-in-england-2024/national-assessment-of-flood-and-coastal-erosion-risk-in-england-2024)</sub>

> When disaster takes out the network, emergency response shouldn't go down with it.

HIVE is a decentralised emergency-response network. Autonomous drones and rescue teams work together to save as many people as possible. **No central coordinator exists, so there is nothing that can fail.** Each actor is its own n8n instance with its own memory and its own decision-making. When the network splits, every actor keeps working from what it knows locally. When links come back, the actors reconcile their work and converge on one shared picture.

---

> **REVIEW NOTE — SUGGESTED CHANGE — Reliability claim above**
> Replace “No central coordinator exists, so there is nothing that can fail” with “No central dispatcher is required for actors to continue making local decisions.” Actors, storage and links can still fail. Describe this as a simulation of resilience to specified communication failures.

## 1. How HIVE maps to the judging criteria

| Criterion | How HIVE answers it | What the judge sees |
|---|---|---|
| **Working towards a common goal** | All actors share one goal: maximise rescues, weighted by urgency, with limited resources | Shared mission score ticking up on the dashboard |
| **Independent decision-making** | Each actor scores tasks itself and allocates them using CBBA. There is no dispatcher | Each actor's *own* view of who is doing what, shown side by side |
| **Resilience when comms fail** | Real network cuts through a chaos proxy. Actors keep working locally, then reconcile when links return | Red **BLACKOUT** button; the actors keep moving |
| **Something you're excited about** | Real distributed-systems theory (CBBA, version vectors, Byzantine tolerance) applied to saving lives | Live chart: HIVE against a central dispatcher as comms degrade |

---

> **REVIEW NOTE — SUGGESTED CHANGE — Related projects**
> Keep this research, but consider moving the long catalogue to an appendix for a shorter main proposal. Verify winner status and implementation details before claiming a capability is absent. Treat the “What they lacked” column and “None of them proves…” as hypotheses until checked.

## 2. Past winners this builds on

The links come from our HackFind database of 1,636 winning Devpost projects. Most have one of the two halves: a disaster swarm *or* an offline mesh. **None of them proves that coordination survives when the network fails.** That gap is the one we fill.

### Disaster response swarms and agents (the "common goal" half)
| Project | Hackathon | What they did | What they lacked (and HIVE adds) |
|---|---|---|---|
| [AERIS](https://devpost.com/software/aeris-ej7d9k) | LA Hacks 2025 | Autonomous drones scan disaster zones, triage victims and route responders | Centralised planner, no failure mode |
| [Autonomous AI Society](https://devpost.com/software/autonomous-ai-society) | CalHacks 2024 | AI agents analyse distress calls, dispatch drones and call rescue teams | Agents depend on a shared orchestrator |
| [ContainOS](https://devpost.com/software/containos) | TreeHacks 2026 | Physics-based multi-agent copilot for wildfire containment | Copilot for one central operator |
| [CalTrack](https://devpost.com/software/caltrack-i0pq3n) | TreeHacks 2026 | Predicts disaster impact and coordinates faster emergency response | Central prediction-and-dispatch system |
| [Keryx](https://devpost.com/software/keryx-k49dta) | TreeHacks 2026 | Drones map buildings into world models for assistive agents | Single-pipeline mapping |
| [SkySplat](https://devpost.com/software/skysplat) | TreeHacks 2024 | Drones plus Gaussian splatting for 3D disaster-recovery models | Perception only, no coordination |
| [Unilert](https://devpost.com/software/unilert) | HackPrinceton 2026 | Real-time incident command, "distilled into decisive action" | Central command model |

### Offline and mesh resilience (the "comms fail" half)
| Project | Hackathon | What they did | What they lacked (and HIVE adds) |
|---|---|---|---|
| [ResQme](https://devpost.com/software/resqme-jq52al) | HackHarvard 2025 | ESP32 offline mesh for disaster zones: messaging, GPS, coordination | Keeps *messages* flowing; no autonomous *decisions* |
| [ProtestLink](https://devpost.com/software/protestlink) | TreeHacks 2025 | Encrypted mesh for coordinating people in real time, with AI insights | Humans still make every decision |
| [Meshworks](https://devpost.com/software/meshworks-nlp-lora-mesh-network-for-emergency-response) | TreeHacks 2024 | LoRa mesh plus NLP for responders after telecoms go down | Communication layer only |
| [Lifeline](https://devpost.com/software/lifeline-zi2jt7) | Hack the North 2022 | LoRaWAN and IoT to keep remote communities connected | Communication layer only |
| [Resililink](https://devpost.com/software/resilink) | CalHacks 2024 | "A lifeline when it matters most": resilient emergency comms | Communication layer only |

### Agent swarms and decentralised trust (technical inspiration)
| Project | Hackathon | Why it matters to us |
|---|---|---|
| [Longshot](https://devpost.com/software/longshot) | TreeHacks 2026 | 100+ coding agents in parallel. Judges reward agent swarms at scale |
| [REVIVE](https://devpost.com/software/revive-gpb86v) | HackPrinceton 2026 | Distributed LLM inference on old phones. Judges reward truly distributed systems |
| [Nadir](https://devpost.com/software/nadir-co0wmk) | HackIllinois 2026 | AI plus human consensus on disaster damage, but needs a blockchain. Our stretch goal does Byzantine tolerance without one |
| [reAgent](https://devpost.com/software/reagent) | HackPrinceton 2026 | Visual IDE for multi-agent swarms and agent-to-agent protocols |
| [Superhuman](https://devpost.com/software/superhuman) | PennApps 2025 | "Swarm of AI agents" as a winning pitch |

**Positioning line for the pitch:** *"Past winners built either the swarm or the mesh. HIVE is the swarm that keeps thinking when the mesh breaks, and we can prove it with numbers."*

---

## 3. The scenario

- A simulated Manchester is split into a **grid of regions** (for example 8×8 cells grouped into 8 districts).
- Flooding is in progress. **Survivors** are hidden in cells, and **distress messages** arrive as messy free text ("stuck on roof w/ 2 kids near Piccadilly, water rising").
- **Actors (one n8n instance each):**
  - **4 drone agents:** search unexplored cells, detect survivors and turn detections into rescue tasks.
  - **3 rescue-team agents:** claim and carry out rescue tasks. They have limited capacity and travel time.
- *(Scope cut: supply stations. They add moving parts without adding any new distributed-systems idea. Add them only if ahead of schedule.)*

**Shared mission score** = Σ (urgency of each rescued survivor × time-decay factor). Every actor maximises the same score, so they share one goal.

---

> **REVIEW NOTE — SUGGESTED ADDITION — Minimum working demo after §3**
> Start with two drones and two rescue teams, partitioned into two islands with one drone and one team each. Prove discover → allocate → partition → continue local rescues → reconnect → reconcile before expanding to seven actors. Start with structured detections; add free-text AI afterwards. Actor utility is a heuristic aligned with the mission score, not a guarantee of a global optimum.

## 4. Architecture

```
                ┌──────────────────────── Docker Compose ────────────────────────┐
                │                                                                │
  ┌──────────┐  │   ┌─────────┐   ┌─────────┐   ┌─────────┐       ┌─────────┐    │
  │ World    │──┼──▶│ drone-1 │◀─▶│ drone-2 │◀─▶│ team-1  │ ◀···▶ │ team-3  │    │
  │ Simulator│  │   │  n8n    │   │  n8n    │   │  n8n    │       │  n8n    │    │
  │ (Node)   │◀─┼───│ SQLite  │   │ SQLite  │   │ SQLite  │       │ SQLite  │    │
  └──────────┘  │   └────┬────┘   └────┬────┘   └────┬────┘       └────┬────┘    │
   ground truth │        │  every peer-to-peer call goes through ▼     │         │
   + sensors    │   ┌────┴─────────────┴─────────────┴─────────────────┴────┐    │
                │   │              Chaos Proxy (link matrix)                │    │
                │   │  allow / drop / delay / partition per (from → to)     │    │
                │   └───────────────────────────▲───────────────────────────┘    │
                │                               │ control only                   │
                │   ┌───────────────────────────┴───────────────────────────┐    │
                │   │ Dashboard (READ-ONLY observer; polls each actor)      │    │
                │   │ map · per-actor beliefs · BLACKOUT · metrics          │    │
                │   └───────────────────────────────────────────────────────┘    │
                └────────────────────────────────────────────────────────────────┘
```

### Hard rules (what keeps it honestly decentralised)
1. **One n8n instance per actor.** Every actor runs the *same* set of workflows on its *own* local SQLite store. No actor's logic spans more than one instance.
2. **Peers only ever talk to each other through the chaos proxy.** A cut link means the webhook call really fails (connection refused or timeout). It is not just a status label.
3. **The dashboard is read-only.** It polls each actor's `/state` endpoint and controls the chaos proxy. It never relays messages and never makes decisions.
4. **The world simulator is "physics", not a coordinator.** It holds ground truth (where survivors are, where actors physically are), returns sensor readings when asked, and carries out movement and rescues. It never tells an actor what to do.

### Tech stack
| Component | Tech |
|---|---|
| Actors | n8n (self-hosted, `n8nio/n8n` image) × 7, each with its own SQLite file |
| AI | Claude via the n8n AI Agent node: turns distress text into structured tasks |
| World simulator | Node.js + Express, tick loop (about 1 tick per second) |
| Chaos proxy | Node.js HTTP proxy with a link matrix `allowed[from][to]` plus latency and drop-rate controls |
| Dashboard | Single-page app: Canvas/SVG map, Chart.js for metrics |
| Orchestration | Docker Compose, one network, every actor reachable only via the proxy |

---

> **REVIEW NOTE — SUGGESTED CHANGE — Architecture and storage**
> Specify an explicit durable application store and its access mechanism; n8n’s internal SQLite file alone does not define an event-store API. Serialize actor-local updates or use transactions to prevent concurrent workflows overwriting state. Enforce proxy routing with network isolation and test that direct peer access fails. Document that simulator/proxy outages are outside the MVP fault model and that simulator observations cannot leak hidden ground truth.

## 5. n8n workflows (identical on every actor)

Each actor imports the same 6 workflows. Role (drone or team) comes from an environment variable, and nodes branch on it.

| # | Workflow | Trigger | What it does |
|---|---|---|---|
| 1 | **Perceive** | Schedule (each tick) | Asks the simulator for sensor readings → drones: detect survivors and mark cells searched → append events to the local log |
| 2 | **Interpret** | Webhook (distress message received) | **AI Agent node** parses free text → `{location, people, urgency 1–5, hazards}` → creates a task event in the log |
| 3 | **Bid (CBBA)** | Schedule plus on new task or new peer info | Scores tasks locally, builds a bundle, updates winning-bid tables (see §6.1) |
| 4 | **Gossip** | Schedule (every 2 s) | Sends this actor's log entries and bid table to every *reachable* peer through the proxy. Failed sends are queued |
| 5 | **Merge** | Webhook (gossip received) | Merges incoming events by version vector, applies CBBA conflict rules, detects duplicates (see §6.2–6.3) |
| 6 | **Act** | Schedule (each tick) | Takes the top task in the bundle → moves → once on site, **commits** (irreversible) → tells the simulator to rescue |

Plus a small **`/state` webhook** that returns this actor's local beliefs, for the dashboard.

> **Demo tip:** show the n8n canvases of two actors side by side while they run. Seeing executions light up on independent instances makes "no central hub" obvious at a glance.

---

## 6. The distributed-systems core

### 6.1 Task allocation: CBBA (Consensus-Based Bundle Algorithm)
Each actor scores a task by itself:

```
U(a, t) = w1 · urgency(t) · decay(age_t)  −  w2 · travel_time(a, t)  −  w3 · load(a)
```

**CBBA**, a published method for allocating tasks among drones without a controller, turns those local scores into one agreed allocation:
1. **Bundle phase:** each actor greedily adds the tasks with the highest marginal value to its bundle. It records `winning_bid[t]` and `winner[t]` in its own table.
2. **Consensus phase:** actors exchange tables with neighbours and settle conflicts with fixed, shared rules. Every actor resolves the same way: higher bid wins, ties go to the lower actor ID. If an actor is outbid on a task, it drops that task *and every task it added to its bundle after it*.
3. It converges without an auctioneer and without a vote. **This is the line to say to judges:** "a plain auction needs an auctioneer, which is a central point again. CBBA doesn't."

During a partition each side runs CBBA among the actors it can reach. That is correct behaviour: each side optimises with what it knows.

> **REVIEW NOTE — SUGGESTED CHANGE — CBBA assumptions**
> Qualify convergence claims for dynamic tasks and changing scores. Define bounded allocation rounds with frozen inputs, stale-bid handling, round IDs and the full timestamp-aware conflict rules; higher bid plus a tie-break alone is insufficient. Validate diminishing marginal gains before claiming theoretical guarantees. Measure convergence after new tasks and score changes pause on a connected graph with eventual delivery. Avoid claiming all auctions require a central auctioneer. References: [original CBBA research](https://dspace.mit.edu/entities/publication/53d56696-45cf-46f5-bbde-fc39e88da869), [dynamic replanning research](https://people.csail.mit.edu/nbuckman/pdfs/aiaa2019.pdf).

### 6.2 Eventual consistency: event logs and version vectors
- Each actor keeps an **append-only event log** (`TASK_CREATED`, `CELL_SEARCHED`, `BID`, `COMMITTED`, `RESCUED`). Each event carries `(actor_id, seq)` plus a **version vector**: a per-agent counter that shows what the sender had seen.
- Gossip sends only the events the peer hasn't seen, worked out by comparing version vectors (anti-entropy sync).
- The searched-cells set is a **grow-only set CRDT** (a set that merges safely without coordination). The set of rescued survivors is too. Merges always succeed and order doesn't matter.

### 6.3 Reversible vs. irreversible decisions (the honest bit)
A split network **cannot** always prevent two cut-off groups from claiming the same task. CAP (the rule that a distributed system can't stay fully available and fully consistent during a split) says so. HIVE designs around this openly:
- **Planning is reversible.** A claim (CBBA bid) can be overridden on merge for free.
- **Commitment is irreversible.** An actor commits only once it is physically on site.
- **On reconnect:** if two actors both *claimed* a task, CBBA picks one winner and the loser re-plans. If both had *committed*, that counts as genuinely duplicated work. It is **logged and measured**, not hidden.
- **Risk dial:** `commit_radius`. Committing later means fewer duplicates but slower response. Show this trade-off on a chart.

> **REVIEW NOTE — SUGGESTED CHANGE — Commitment costs**
> A claim can be reversed, but travel already undertaken is not free. Explain the availability/exclusive-ownership trade-off directly rather than treating CAP as a complete proof for this application. Commit on arrival for the MVP; treat commit_radius as an optional measured experiment, without assuming a particular effect on rescue speed or duplication.

### 6.4 Behaviour while cut off
- Drones bias their search away from cells that a peer they *last heard from* was heading towards. This is a guess at what others are probably covering.
- Gossip that fails is queued and resent when the link returns. No data is lost.
- Confidence in other actors' last known positions drops over time. Older information gets less weight.

---

> **REVIEW NOTE — SUGGESTED ADDITION — State rules and acceptance checks after §6**
> Add these implementation rules and checks before building:
>
> - **Identity:** canonical survivor/task IDs so two detections of one person become one task. Keep uncertain free-text reports provisional; location alone does not prove identity.
> - **Replay:** unique persisted `(actor_id, seq)` values; duplicate or reordered events cannot repeat effects. Track contiguous received sequences and repair gaps instead of acknowledging unseen events.
> - **Durability:** persist events and action intents before acknowledging or sending them; retry with stable idempotency keys. Recovery assumes persistent storage survives.
> - **Physical effects:** the simulator rescues each survivor once while separately counting duplicated commitments, attempts and wasted travel. It enforces physics, not task allocation.
> - **Restart:** rebuild state from the log, reconcile pending actions with simulator receipts, and resync without reusing event IDs or repeating effects.
> - **Acceptance scenarios:** connected ownership agrees; both drone-and-team islands complete new rescues during a partition; after reconnection and a quiet period, replicated event sets, searched/rescued sets and settled ownership agree within a declared budget (suggestion: 10 gossip intervals); duplicated/reordered gossip repairs gaps without changing rescue counts; conflicting commitments are measured; restarting an actor preserves correctness.
>
> Compare shared replicated state rather than requiring every actor’s entire state to be identical: positions, sensor readings and local execution logs legitimately differ.

## 7. Benchmark: proving it works

Run the **same seeded scenario** in two modes, across comms levels of 100%, 75%, 50%, 25% and 0% links up:

| Mode | Description |
|---|---|
| **HIVE** | Decentralised, as above |
| **Central baseline** | A single dispatcher node assigns all tasks. If an actor can't reach it, the actor idles |

**Metrics (all shown on the dashboard):**
- Mission score and rescues completed over time
- Mean time-to-rescue, weighted by urgency
- **Duplicated work** (double commits) and wasted travel
- Message overhead (gossip bytes per tick)
- Time to converge after reconnection (until all actors' views are identical)

**Headline chart:** rescues against % of links up. The central baseline falls off a cliff; HIVE degrades gracefully. This one chart covers three of the four judging criteria.

---

> **REVIEW NOTE — SUGGESTED CHANGE — Benchmark fairness**
> Keep the idle-on-disconnect baseline, but add a stronger central baseline whose agents finish cached assignments before waiting. Use identical resources, seeds, scoring and outage schedules; document how peer partitions map to dispatcher reachability. Include balanced islands, drones separated from teams, isolated actors and intermittent links. Run at least 10 fixed seeds per configuration and report variability, failures and unrescued survivors. Measure the chart before asserting a cliff or graceful degradation. Link percentage alone does not describe partition topology.

## 8. The 90-second demo

| Time | What happens |
|---|---|
| 0–15 s | Map of Manchester: 4 drones search, 3 teams respond. "Seven independent n8n instances. No server tells them what to do." |
| 15–25 s | A distress text arrives and the AI turns it into a task. Teams bid, and one wins **on every actor's own view at once** |
| 25–35 s | Press **SIMULATE NETWORK BLACKOUT**. Links turn red and the network splits into 3 islands |
| 35–60 s | New incidents arrive. Each island keeps searching and rescuing. The per-actor views **visibly diverge** |
| 60–75 s | Restore links. Gossip floods back, duplicates are flagged, losers re-plan, and the views **snap back to identical** |
| 75–90 s | Benchmark chart: HIVE against the central dispatcher under the same outage. "The central system stopped. HIVE didn't." |

**Interactive bit:** let the judges click individual links on the map to cut them themselves.

---

> **REVIEW NOTE — SUGGESTED CHANGE — Demo promises**
> Use the four-actor MVP and two balanced islands initially. Replace “at once” with “as actors exchange bids” and “snap back to identical” with “replicated task views converge after a quiet period.” Show both central baselines; use measured results in the closing line. Make free-text AI and interactive link cutting optional.

## 9. Build plan (24-hour hackathon, team of 3–4)

| Hours | Track A: Infra and sim | Track B: n8n agents | Track C: Dashboard |
|---|---|---|---|
| 0–3 | Docker Compose with 7 n8n instances plus proxy; world-sim skeleton | Perceive + Act workflows (move, search) | Map rendering from simulator state |
| 3–8 | Chaos proxy link matrix; sensor and move APIs | Gossip + Merge with version vectors; grow-only set CRDTs | Poll each `/state`; per-actor view panels |
| 8–14 | Seeded scenario generator; distress message feed | **CBBA** Bid workflow; commit logic | BLACKOUT button; click-to-cut links |
| 14–18 | Central baseline mode | AI Agent node for interpreting distress text | Metrics charts |
| 18–21 | Benchmark runner (all comms levels, both modes) | Tuning: weights, `commit_radius` | Headline chart; polish |
| 21–24 | **Freeze. Rehearse the demo 5 times.** Record a backup video | | Slides (3 max) |

**Milestone checkpoint (hour 8):** two drones gossiping through the proxy, with a cut link visibly stopping sync. If that works, the rest is incremental.

---

> **REVIEW NOTE — SUGGESTED CHANGE — Build checkpoints**
> By hour 8, demonstrate one drone-to-team rescue plus durable gossip, cut links and replay. By hour 14, demonstrate the four-actor partition/recovery sequence. Cut AI, interactive controls and actor expansion if those milestones slip. Benchmark all three modes and reserve explicit time for correctness checks. Profile four actors before expanding; start with 2–5-second logical ticks and measure latency.

## 10. Stretch goals (in priority order)
1. **"Corrupt an agent" button (Byzantine mode).** A judge picks an actor, which starts gossiping fake survivors and inflated bids. Honest actors sign events (Ed25519), cross-check claims against their own sensor readings, and lower its trust score through gossip. The system stays correct as long as `n ≥ 3f + 1` (n agents, f lying ones). This is Nadir's idea without a blockchain.
2. **Supply-station actors**, with resources allocated the same way via CBBA.
3. **Judges as actors:** open a page on a phone to become a rescue team and play live alongside the agents.

---

> **REVIEW NOTE — SUGGESTED CHANGE — Byzantine claim**
> Rename the first stretch goal “signed events and suspicious-agent detection” and remove the claimed correctness guarantee. Signatures authenticate origin, not truth; trust scores do not implement Byzantine agreement. The `n ≥ 3f + 1` bound requires an appropriate protocol and assumptions, and does not establish this design’s correctness. Reference: [The Byzantine Generals Problem](https://www.microsoft.com/en-us/research/uploads/prod/2016/12/The-Byzantine-Generals-Problem.pdf).

## 11. Risks and how to handle them
| Risk | Mitigation |
|---|---|
| 7 n8n instances are heavy on one laptop | Limit memory per container; fall back to 5 actors; test on day 0 |
| n8n schedule triggers are too slow or jittery for ticks | Keep ticks at about 1 s; slow sim time down to match; or trigger ticks with a webhook from the simulator |
| CBBA bugs eat hours | Write CBBA as one pure JS function in a Code node and unit-test it outside n8n first |
| LLM latency or outage during the demo | Interpret is off the critical path. Cache parsed results; use a regex fallback parser |
| Live demo breaks | Fixed scenario seed, a rehearsed script and a pre-recorded backup video |

---

> **REVIEW NOTE — SUGGESTED CHANGE — Pitch wording**
> Suggested replacement, pending your decision: “HIVE is a simulated emergency-response swarm that keeps coordinating within local groups when central connectivity fails, then reconciles when links return. We measure both the rescues gained and the duplicated work.”

## 12. One-line pitch
**"HIVE is an emergency-response swarm with no centre. Cut its network and it keeps saving people, then heals itself, and we can prove it against a central system."**
