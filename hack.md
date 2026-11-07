# HIVE — Self-Healing Emergency Response Swarm

**Neptune North Challenge · GreatUniHack · November 2026**
*"Actors work better together"*

---

## 0. Why HIVE exists

### "Sending…"

*A composite story. Amara is not a real person, but every kind of failure in it has happened in real disasters: flooded substations, phone masts dying when their backup batteries run out, and whole regions losing most of their cell coverage in a single night.*

It's 1:40 a.m. in Lower Broughton, Salford. The River Irwell has burst its banks again, as it did here on Boxing Day 2015, and the water in Amara's kitchen is now up to the light switches.

She's on the flat roof of the extension with her two kids, Tobi (7) and Zara (4), wrapped in the duvet she grabbed on the way up the stairs. The street lights went out an hour ago, when the local substation flooded. Twenty minutes later, the phone mast that serves her street ran out of battery backup.

She types the message anyway:

> *stuck on roof w/ 2 kids near the Irwell, water rising, please*

The message sits under a grey clock icon: **Sending…**

Three miles away, the control room has drones in the air and rescue boats on the water. Every assignment goes through one central dispatch server, which reaches its crews over the mobile network, and that network is gone. One drone flew over Amara's roof eleven minutes ago and its thermal camera picked up three heat signatures. The detection is stored on the drone and goes nowhere. The nearest boat is 400 metres away, holding position and waiting to be told where to go.

Nobody is careless. Every person in that system is doing their job. **The system simply assumed the network would always be there, and on the one night it was needed most, it wasn't.**

**Now run the same night with HIVE.**

The drone and the boat carry short-range radios that talk to each other directly, without a mast. The drone sees three heat signatures on a roof. It doesn't need permission. It creates a rescue task, scores it as *urgency 5: children, water rising*, and shares it with every peer still in radio range. The boat 400 metres away is one of them. The boat bids on the task, sees no stronger bid, and goes.

On the other side of the city, another group of drones and teams has been cut off too, and it keeps searching its own streets with what it knows. When the network comes back at 3 a.m., the groups exchange everything they learned, resolve the tasks they both claimed, record the one house they both sent a team to, and carry on as a single system again.

Amara's message is still showing **Sending…** when the boat's light reaches the roof.

---

### This has already happened

| When and where | What failed | Cost |
|---|---|---|
| **Hurricane Maria**, Puerto Rico, 2017 | The FCC reported **95.2% of cell sites out of service**, with 48 of the island's 78 municipalities at 100% outage | An estimated **2,975 excess deaths** in the six months after the storm (George Washington University study, adopted as the official count) |
| **Valencia DANA floods**, Spain, Oct 2024 | Spain's met office issued a red warning at **07:36**. The phone alert to residents went out at **20:11**, after water had already reached several towns. Around **300,000** phone lines were affected | **More than 220 people died.** The investigating judge found that by the time the 20:11 alert was sent, practically all the deaths had already happened |
| **Hurricane Helene**, North Carolina, Sept 2024 | **74%** of cell sites in affected counties were down on day one, and **90%** in Mitchell County. Analysts called it the largest cell outage any hurricane has caused | Some mountain communities couldn't call for help for days |
| **Storm Desmond**, Lancaster, UK, Dec 2015 | One flooded substation cut power to about **55,000–61,000 properties** and left most communication services in the city down with it | A UK city was largely offline for up to two days |

### And it's getting worse

- Floods made up **more than 40%** of all recorded disasters between 2000 and 2019 and affected **1.65 billion people**, more than any other kind of disaster (UNDRR).
- In England, **6.3 million properties** are already in areas at risk of flooding. The Environment Agency projects that this could rise to **around 8 million, 1 in 4 properties, by 2050** (NaFRA 2024).

### The pattern

In disaster after disaster, the thing that breaks isn't the willingness to help. It's the **coordination**: warnings that arrive too late, calls that can't connect, and crews who can't be told where to go. Most emergency-response technology, including most past hackathon winners (see §2), is built around a central hub that every decision passes through. When the links to that hub fail, responders who are still perfectly able to help can lose the ability to coordinate.

**HIVE is built for that moment.** No central dispatcher is needed to keep making decisions. Drones and teams that can still reach each other keep coordinating as a local group. They keep searching, claiming rescues and saving people. When the links come back, the groups reconcile into one shared picture, and HIVE measures the duplicated work honestly instead of hiding it.

HIVE isn't magic, and the pitch shouldn't pretend it is. An actor that is completely cut off can act only on what it already knows or can sense itself. HIVE's job is to make sure that **every link that still works gets used.**

> **Opening line for the pitch (say it slowly):**
> *"Hurricane Maria knocked out 95% of Puerto Rico's cell sites. In Valencia in 2024, practically everyone who died was already gone before the emergency alert reached their phones. When disaster strikes, the systems we rely on to coordinate rescue are often the first to break. HIVE is a rescue swarm that keeps coordinating when they do, and we'll show you exactly what it gains and what it costs."*

<sub>**Sources:** [FCC Hurricane Maria status reports (via NPSTC)](https://blog.npstc.org/?p=6091) · [BNamericas: Maria telecoms blackout](https://bnamericas.com/en/news/hurricane-maria-causes-telecoms-blackouts-in-us-caribbean-territories) · [GW Today: 2,975 excess deaths](https://gwtoday.gwu.edu/node/9876) · [2024 Spanish floods (Wikipedia)](https://wikiwand.com/en/articles/2024_Spain_floods) · [Maldita.es: DANA warning timeline](https://maldita.es/clima/20241030/cronologia-dana-avisos-amet-ayudas-gobierno-valencia/) · [Copernicus/FloodList: Spain death toll](https://european-flood.emergency.copernicus.eu/en/node/1115) · [El Español: judge on time of deaths](https://www.elespanol.com/valencia/20250226/jueza-dana-recopila-sumario-hora-exacta-muerte-determinar-podian-haberse-evitado/927157542_0.amp.html) · [La Marea: judge's findings](https://lamarea.com/2025/02/19/la-jueza-de-la-dana-los-danos-no-se-podian-evitar-las-muertes-si) · [Spanish Ministry for Digital Transformation: network restoration](https://digital.gob.es/en/comunicacion/notas-prensa/secretaria-estado-telecomunicaciones-e-infraestructuras-digitales/2024/11/2024-11-14) · [Benton Institute: Helene recovery](https://benton.org/blog/road-recovery-western-north-carolina) · [Wireless Estimator: Helene outage](https://wirelessestimator.com/articles/2024/unprecedented-outage-no-hurricane-has-knocked-out-more-cell-sites-than-category-4-helene/) · [Univ. of Birmingham: collapse of Lancaster's infrastructure](https://research.birmingham.ac.uk/en/publications/a-perfect-storm-the-collapse-of-lancasters-critical-infrastructur) · [UN News: UNDRR 2000–2019 report](https://news.un.org/en/node/1075142) · [GOV.UK: NaFRA 2024](https://www.gov.uk/government/publications/national-assessment-of-flood-and-coastal-erosion-risk-in-england-2024/national-assessment-of-flood-and-coastal-erosion-risk-in-england-2024) · [NPR: AT&T "Flying COW" drone in Puerto Rico](https://www.npr.org/sections/thetwo-way/2017/11/17/564879549/faa-approves-drone-as-cell-phone-tower-in-the-sky-for-puerto-rico)</sub>

---

> When disaster takes out the network, emergency response shouldn't go down with it.

HIVE is a simulated, decentralised emergency-response network. Each drone or rescue-team actor runs its own n8n instance, stores its own information and makes its own decisions. **No central dispatcher is required for actors to keep deciding.** Actors that can still reach each other coordinate as local groups during an outage, and an isolated actor works from its own knowledge and sensors. When links return, actors exchange events, reconcile conflicting plans and converge on one shared picture of the mission.

Actors, storage and links can still fail. What HIVE tests is resilience to **communication partitions**: links that drop, delay or split the network into islands.

---

## 1. How HIVE maps to the judging criteria

| Criterion | How HIVE answers it | What the judge sees |
|---|---|---|
| **Working towards a common goal** | All actors share one goal: maximise rescues, weighted by urgency, with limited resources | Shared mission score ticking up on the dashboard |
| **Independent decision-making** | Each actor scores tasks itself and allocates them using CBBA. There is no dispatcher | Each actor's *own* view of who is doing what, shown side by side |
| **Resilience when comms fail** | Real network cuts through a chaos proxy. Each island keeps working with the links it still has, then reconciles when links return | Red **BLACKOUT** button; the islands keep rescuing |
| **Something you're excited about** | Distributed task allocation (CBBA), version vectors and conflict reconciliation applied to a rescue simulation, measured against central dispatch | Live chart: HIVE against two central baselines as comms degrade |

---

## 2. Related projects (past winners)

These links come from our HackFind database of 1,636 winning Devpost projects. They cover disaster response, drone perception, offline messaging and agent swarms. Most focus on one of two halves: a disaster swarm *or* an offline mesh. HIVE's distinction is a **measured partition-and-recovery demonstration**. It shows what local groups can do during an outage, how their beliefs diverge, and how they reconcile afterwards.

> **Before pitching:** the "Gap we think HIVE fills" column is our reading of each project's Devpost page. Check each one before saying it out loud to judges.

### Disaster response swarms and agents (the "common goal" half)
| Project | Hackathon | What they did | Gap we think HIVE fills |
|---|---|---|---|
| [AERIS](https://devpost.com/software/aeris-ej7d9k) | LA Hacks 2025 | Autonomous drones scan disaster zones, triage victims and route responders | Planning appears centralised; outage behaviour not demonstrated |
| [Autonomous AI Society](https://devpost.com/software/autonomous-ai-society) | CalHacks 2024 | AI agents analyse distress calls, dispatch drones and call rescue teams | Agents appear to depend on a shared orchestrator |
| [ContainOS](https://devpost.com/software/containos) | TreeHacks 2026 | Physics-based multi-agent copilot for wildfire containment | Copilot for one central operator |
| [CalTrack](https://devpost.com/software/caltrack-i0pq3n) | TreeHacks 2026 | Predicts disaster impact and coordinates faster emergency response | Central prediction-and-dispatch system |
| [Keryx](https://devpost.com/software/keryx-k49dta) | TreeHacks 2026 | Drones map buildings into world models for assistive agents | Single-pipeline mapping |
| [SkySplat](https://devpost.com/software/skysplat) | TreeHacks 2024 | Drones plus Gaussian splatting for 3D disaster-recovery models | Perception only, no coordination |
| [Unilert](https://devpost.com/software/unilert) | HackPrinceton 2026 | Real-time incident command, "distilled into decisive action" | Central command model |

### Offline and mesh resilience (the "comms fail" half)
| Project | Hackathon | What they did | Gap we think HIVE fills |
|---|---|---|---|
| [ResQme](https://devpost.com/software/resqme-jq52al) | HackHarvard 2025 | ESP32 offline mesh for disaster zones: messaging, GPS, coordination | Keeps *messages* flowing; humans make the allocation decisions |
| [ProtestLink](https://devpost.com/software/protestlink) | TreeHacks 2025 | Encrypted mesh for coordinating people in real time, with AI insights | Humans still make every decision |
| [Meshworks](https://devpost.com/software/meshworks-nlp-lora-mesh-network-for-emergency-response) | TreeHacks 2024 | LoRa mesh plus NLP for responders after telecoms go down | Communication layer only |
| [Lifeline](https://devpost.com/software/lifeline-zi2jt7) | Hack the North 2022 | LoRaWAN and IoT to keep remote communities connected | Communication layer only |
| [Resililink](https://devpost.com/software/resilink) | CalHacks 2024 | "A lifeline when it matters most": resilient emergency comms | Communication layer only |

### Agent swarms and decentralised trust (technical inspiration)
| Project | Hackathon | Why it matters to us |
|---|---|---|
| [Longshot](https://devpost.com/software/longshot) | TreeHacks 2026 | 100+ coding agents in parallel. Agent swarms at scale have won before |
| [REVIVE](https://devpost.com/software/revive-gpb86v) | HackPrinceton 2026 | Distributed LLM inference on old phones. Truly distributed systems have won before |
| [Nadir](https://devpost.com/software/nadir-co0wmk) | HackIllinois 2026 | Reference for trust in disaster information. HIVE's stretch goal explores signed events and suspicious-agent detection |
| [reAgent](https://devpost.com/software/reagent) | HackPrinceton 2026 | Visual IDE for multi-agent swarms and agent-to-agent protocols |
| [Superhuman](https://devpost.com/software/superhuman) | PennApps 2025 | "Swarm of AI agents" as a winning pitch |

**Positioning line for the pitch:** *"Past projects built the swarm or the mesh. HIVE is a swarm that keeps coordinating when the mesh splits, and we measure both what that gains and what it costs."*

---

## 3. The scenario

- A simulated Manchester is split into a **grid of regions** (for example 8×8 cells grouped into 8 districts).
- Flooding is in progress. **Survivors** are hidden in cells. Each one has a stable `survivor_id` in the simulator.
- **Actors (one n8n instance each):**
  - **4 drone agents:** search unexplored cells with a wide sensor footprint, detect survivors and turn detections into rescue tasks. Drones also act as **local receivers for distress texts**. A text only reaches HIVE if a drone is in range of the sender's cell, like the LTE "Flying COW" drone AT&T flew over Puerto Rico after Maria.
  - **3 rescue-team agents:** claim and carry out rescue tasks. They have limited capacity and travel time, and a **short-range sensor** (their own cell and its neighbours). This means even a completely isolated team can find and rescue people nearby.
- **Distress messages** arrive as messy free text ("stuck on roof w/ 2 kids near Piccadilly, water rising"). They stay *provisional* until a sensor confirms them, because a location in a text message does not prove which survivor it is.
- *(Scope cut: supply stations. They add moving parts without adding any new distributed-systems idea. Add them only if ahead of schedule.)*

### What an outage means (the fault model)
| Link | Normal | During BLACKOUT |
|---|---|---|
| Phone network / link to HQ | Up | **Down.** Only the central baselines depend on it |
| Actor-to-actor short-range radio (the chaos proxy's link matrix) | All up | **Split into islands.** Links within an island still work; links across islands are cut |
| Simulator (physics) and chaos proxy | Up | Up. Their failure is outside the fault model |

This model matches the story: the mast dies, but the drone and boat can still reach each other.

**Shared mission score** = Σ over rescued survivors of `urgency × decay(time_to_rescue)`, with `decay(t) = exp(−t / τ)`. Every actor's local bid uses a heuristic aligned with this score. That doesn't guarantee the global optimum, so we publish the weights and τ used in every benchmark.

---

## 4. Architecture

```
                ┌──────────────────────── Docker Compose ────────────────────────┐
                │                                                                │
  ┌──────────┐  │   ┌─────────┐   ┌─────────┐   ┌─────────┐       ┌─────────┐    │
  │ World    │──┼──▶│ drone-1 │   │ drone-2 │   │ team-1  │  ···  │ team-3  │    │
  │ Simulator│  │   │  n8n    │   │  n8n    │   │  n8n    │       │  n8n    │    │
  │ (Node)   │◀─┼───│ store   │   │ store   │   │ store   │       │ store   │    │
  └──────────┘  │   └────┬────┘   └────┬────┘   └────┬────┘       └────┬────┘    │
   physics +    │        │  every peer-to-peer call goes through ▼     │         │
   per-actor    │   ┌────┴─────────────┴─────────────┴─────────────────┴────┐    │
   sensing      │   │              Chaos Proxy (link matrix)                │    │
                │   │  allow / drop / delay / partition per (from → to)     │    │
                │   │  logs every attempted / dropped / delivered message   │    │
                │   └───────────────────────────▲───────────────────────────┘    │
                │                               │ control only                   │
                │   ┌───────────────────────────┴───────────────────────────┐    │
                │   │ Dashboard (READ-ONLY observer; polls each actor)      │    │
                │   │ map · per-actor beliefs · BLACKOUT · metrics          │    │
                │   └───────────────────────────────────────────────────────┘    │
                └────────────────────────────────────────────────────────────────┘
```

### Hard rules (what keeps it honestly decentralised)
1. **One n8n instance per actor.** Every actor runs the *same* set of workflows on its *own* local store. No actor's logic spans more than one instance.
2. **Peers only ever talk to each other through the chaos proxy, and the network enforces it.** Each actor sits on its **own private Docker network**, shared only with the proxy, the simulator and the dashboard. Two actors never share a network. A cut link means the webhook call really fails (connection refused or timeout). It is not just a status label. **Test it:** a direct `curl` from one actor to another must fail.
3. **The dashboard is read-only.** It polls each actor's `/state` endpoint and controls the chaos proxy's link settings. It never relays messages, chooses task winners or issues assignments. Observing two islands must never bridge them.
4. **The world simulator is "physics", not a coordinator.** It holds ground truth, returns **actor-specific** sensor readings (only what that actor could sense from where it is), and carries out movement and rescues. It never tells an actor what to do, and it never exposes hidden survivor locations or global rescue state through a general endpoint. A team only learns a survivor has already been rescued when it arrives and finds the roof empty.
5. **Ticks carry time, never instructions.** If the simulator drives ticks by webhook, the payload is only the tick number.

### Actor storage
n8n's own SQLite database stores workflows and execution history. It is **not** an event store your workflows can query. Each actor gets a separate **application store** (full detail in [implementation.md](implementation.md) §2):

- **A store sidecar per actor** (`store-<id>`): a small Node service using Node 24's built-in `node:sqlite`, on a per-actor volume. It's reachable only on that actor's private network, at `http://store:4000`. In n8n 2.x, Code nodes run in an isolated task runner where npm modules and environment variables are unreliable, so the Code nodes stay pure JavaScript and all storage goes over HTTP.
- **One execution at a time per actor:** `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` makes each n8n instance queue its executions and run them in order, like a true actor. Gossip, Merge and Tick can never overwrite each other's work. As a safety net, the store rejects a write made from a stale version (HTTP 409) and counts it, and acceptance requires that count to be zero.
- Set `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` and turn on execution pruning. Otherwise 7 actors firing workflows every few seconds will bloat n8n's own database within an hour.

### Tech stack
| Component | Tech |
|---|---|
| Actors | n8n 2.x (self-hosted, official `n8nio/n8n` image, version pinned) × 7, each paired with its own store sidecar (Node 24 + `node:sqlite`) on its own volume |
| AI | Claude via the n8n AI Agent node: turns distress text into structured, provisional tasks |
| World simulator | Node.js + Express, tick loop (start at 2 s per tick; tighten only after measuring n8n execution latency) |
| Chaos proxy | Node.js HTTP proxy with a link matrix `allowed[from][to]`, latency and drop-rate controls, and a delivery log |
| Dashboard | Single-page app: Canvas/SVG map, Chart.js for metrics |
| Orchestration | Docker Compose with one private network per actor; peers reachable only via the proxy |
| Benchmark | Headless fast-forward simulator that reuses the *same* pure JS functions (CBBA, merge, scoring) as the n8n Code nodes |

### Live coordination dashboard

The dashboard shows how the running actors discover incidents, exchange information, allocate tasks and act together. It displays actual actor decisions and actually delivered messages, so judges can connect movement on the map to the coordination behind it.

| View | What the judge sees |
|---|---|
| **Live map** | Drones searching cells, survivors discovered, rescue teams travelling and rescues completed. Simulator ground truth is clearly labelled separately from what actors know. |
| **Communication links** | A line flashes for each delivered peer message. Cut links turn red, and islands become visible. Attempted, dropped and delivered messages look different. |
| **Each actor's understanding** | A card for each actor: role, current action, known incidents, bid table and who it believes owns each rescue task. Conflicting beliefs stay visible during a partition. |
| **Activity feed** | Recorded events such as "Drone 1 discovered survivor," "Team 2 bid 8," "Team 1 believes it owns task 14," and "Team 2 replanned after a peer update." Each shows actor ID, task ID and simulation tick. |

**Data sources:**
- Each actor's `/state`, served by its store sidecar, for local beliefs, bids and current action, polled about once per second. Reading the store directly means polling never adds to the actor's n8n execution queue.
- The simulator for physical positions and rescue outcomes. This is for display and scoring only and never feeds back into actor decisions.
- The chaos proxy's delivery log and link settings. Links flash only when the log shows delivery.
- Each panel shows the simulation tick and the last successful poll. An actor that can't be polled is marked **stale**, not stopped.

---

## 5. n8n workflows (identical on every actor)

Each actor imports the same workflows. Role (drone or team) comes from the actor's store (`GET /config`), and nodes branch on it. Perceive, Bid and Act run as three Code nodes inside one `hive-tick` workflow so they always execute in order. Interpret, Gossip and Merge are separate workflows, giving 4 workflow files that contain the 6 stages below.

| # | Workflow | Trigger | What it does |
|---|---|---|---|
| 1 | **Perceive** | Schedule or simulator tick webhook | Asks the simulator for this actor's sensor readings. Drones mark cells searched and detect survivors; teams detect survivors in their short-range footprint. Detections become canonical task events in the local log |
| 2 | **Interpret** | Webhook (distress text received by a drone in range) | **AI Agent node** parses free text → `{location, people, urgency 1–5, hazards}` → creates a *provisional* task event. Regex fallback if the LLM is slow or down |
| 3 | **Bid (CBBA)** | Event-driven: new task, outbid, task completed, or link restored | Scores tasks locally, builds a bundle and updates the winning-bid table (see §6.1) |
| 4 | **Gossip** | Schedule (every 2 s) | Anti-entropy sync: for each *reachable* peer, sends the events that peer's version vector says it hasn't seen, plus this actor's bid table, through the proxy |
| 5 | **Merge** | Webhook (gossip received) | In one transaction: dedupes events by `(actor_id, seq)`, applies them, runs CBBA conflict rules, flags duplicate commitments (see §6.2–6.3) |
| 6 | **Act** | Schedule (each tick) | Takes the top task in the bundle → moves → on arrival, **commits** (irreversible) → sends an idempotent rescue request to the simulator |

The dashboard reads each actor's local beliefs from its store's `/state` endpoint.

> **Demo tip:** show the n8n canvases of two actors side by side while they run. Seeing executions light up on independent instances makes "no central hub" obvious at a glance.

---

## 6. The distributed-systems core

### 6.1 Task allocation: CBBA (Consensus-Based Bundle Algorithm)
Each actor scores a task by itself:

```
U(a, t) = w1 · urgency(t) · decay(age_t)  −  w2 · travel_time(a, t)  −  w3 · load(a)
```

**CBBA** ([Choi, Brunet & How, MIT](https://dspace.mit.edu/entities/publication/53d56696-45cf-46f5-bbde-fc39e88da869)) is a published method for allocating tasks among robots without a controller. HIVE uses an **asynchronous, event-driven** variant:

1. **Bundle phase:** each actor greedily adds the tasks with the highest marginal value to its bundle. For each task it records `winning_bid[t]`, `winner[t]` and a **timestamp**. The bid value is computed once and frozen in the bid record, so it doesn't drift while being compared.
2. **Consensus phase:** actors exchange bid tables with reachable neighbours and resolve conflicts with CBBA's full rule table. That table uses each sender's timestamps to decide whose information is fresher. "Higher bid wins, ties to lower ID" applies only once both sides have current information. If an actor is outbid on a task, it drops that task *and every task it added to its bundle after it*.
3. **Re-bid only on events:** a new task, being outbid, a task completed, or a link restored. Re-bidding on a timer keeps agreement moving forever.

**Honest limits:** CBBA's convergence guarantee assumes a fixed task set and scores with *diminishing marginal gains*. HIVE has arriving tasks and moving actors, and travel-time scoring can break the second assumption. So:
- We make bids non-increasing along each bundle ("bid warping") to restore the property the guarantee relies on.
- CBBA is written as **one pure JS function**, unit-tested outside n8n (including randomised conflict tests), and pasted into the Code node.
- We *measure* convergence (§7) rather than claim it. See also [dynamic replanning research](https://people.csail.mit.edu/nbuckman/pdfs/aiaa2019.pdf).

During a partition, each island runs CBBA among the actors it can reach. Each island optimises with what it knows.

**Line for judges:** *"Actors exchange bids and resolve conflicts with shared, deterministic rules. No central auctioneer, and no vote."*

### 6.2 Eventual consistency: event logs and version vectors
- Each actor keeps an **append-only event log** (`TASK_CREATED`, `CELL_SEARCHED`, `BID`, `COMMITTED`, `RESCUED`). Each event has a unique, persisted ID `(actor_id, seq)`.
- Each actor tracks a **version vector**: for each origin actor, the highest *contiguous* sequence number it holds. If event 7 arrives before event 6, the vector stays at 5 and event 6 is requested on the next sync. The vector never claims events that haven't arrived.
- Gossip sends only the events the peer's version vector says it lacks (anti-entropy sync). There's no separate retry queue: anything missed during an outage is simply resent on the next successful sync, so nothing is lost as long as storage survives.
- Receiving the same event twice has no effect, because the `(actor_id, seq)` primary key rejects it.
- The searched-cells set and the rescued-survivors set are **grow-only set CRDTs** (sets that merge safely without coordination). Merges always succeed and order doesn't matter.

### 6.3 Reversible vs. irreversible decisions (the honest bit)
If two disconnected islands can both accept claims for the same task, HIVE **cannot** guarantee exclusive ownership while both are free to act. That's the availability-versus-consistency trade-off CAP describes, and here it is also physical: neither boat can see the other. HIVE chooses local progress and measures the conflicts.

- **Planning is reversible.** After reconnecting, the losing actor drops its claim and replans. Any travel it already made still counts as **wasted work**: you can change your plan, but you can't get back fuel or time already spent.
- **Commitment happens on arrival and is irreversible.**
- **The simulator rescues each survivor exactly once.** If two actors commit to the same survivor, the second finds the roof empty. Both commitments, both trips and both rescue attempts are **logged and measured**, and the survivor counts once.
- **Experiment:** `commit_radius` (commit before arriving). We measure its effect on duplicated work and rescue time rather than assuming it.

### 6.4 Behaviour while cut off
- Drones bias their search away from cells that a peer they *last heard from* was heading towards. This is a guess at what others are probably covering.
- Confidence in other actors' last known positions drops over time. Older information gets less weight.
- A fully isolated team keeps working from its own short-range sensor and any tasks it already holds. It never "learns" a discovery nobody could send it.

### 6.5 State and correctness rules
1. **Canonical identity:** a sensor-confirmed task ID is derived from `survivor_id`, so two drones seeing the same person create the *same* task. Text-only reports stay provisional until a sensor confirms them.
2. **Unique events:** each actor persists its identity and sequence counter. `(actor_id, seq)` is a primary key, so replays can't apply twice.
3. **Persist before acting:** write an event before acknowledging it. Write an *action intent* before calling the simulator, and reuse its idempotency key on retries.
4. **Restart:** with storage intact, an actor rebuilds state from its log, checks pending intents against simulator receipts, and resyncs with peers without reusing IDs or repeating rescues. Disk loss is outside the fault model.

### 6.6 Acceptance checks (all must pass before the demo freeze)
| Scenario | Pass condition |
|---|---|
| Connected, 7 actors | After a quiet period, all actors agree on one owner per pending task, and team capacity limits hold |
| BLACKOUT into 3 islands | Every island discovers and completes at least one new rescue with no cross-island delivery |
| Reconnection | With new incidents paused, all actors agree on replicated event sets, searched and rescued sets, and task ownership within **10 gossip intervals**. A timeout counts as a failure |
| Duplicate / reordered gossip | Missing events are recovered; replay never changes the rescue count or mission score |
| Conflicting commitments | Two actors committing to one survivor → measurable duplicated work, exactly one rescue |
| Actor restart | Pending actions recover, event IDs stay unique, and no rescue repeats |
| Network isolation | A direct actor-to-actor request fails; a cut proxy link blocks delivery |

We compare **shared replicated state**, not every field. Positions, local sensor readings and execution histories legitimately differ between actors.

---

## 7. Benchmark: proving it works

Run the **same seeded scenarios** in three modes:

| Mode | Description |
|---|---|
| **HIVE** | Decentralised, as above |
| **Central (naive)** | A single dispatcher assigns all tasks. An actor that can't reach it idles |
| **Central (strong)** | The same dispatcher, but a disconnected actor first **finishes its cached assignments**, then waits. This is the fair comparison |

All three modes use the same actors, sensors, resources, scoring function, seeds and outage schedules.

**Outage topologies** (link percentage alone doesn't describe connectivity, so we test shapes):
- Balanced islands (each island has at least one drone and one team)
- All drones cut off from all teams
- One fully isolated actor
- Intermittent links (flapping on and off)
- Sweeps of 100%, 75%, 50%, 25% and 0% of peer links up

For each topology we document how it affects both peer reachability and dispatcher reachability.

**How we run it:** the benchmark uses the **headless fast-forward simulator**, which reuses the exact same JS functions as the n8n actors. That way **10+ seeds per configuration** finish in minutes, not days. We then run a few configurations on the live n8n system to check that the two agree.

**Metrics:**
- Unique rescues and mission score over a fixed horizon, plus **unrescued count and urgency**
- Urgency-weighted mean time-to-rescue
- **Duplicated work** (double commitments, wasted travel)
- Message overhead (attempted and delivered gossip bytes)
- Time to converge after reconnection, with timeouts reported
- Mean and spread across seeds, not just the best run

**Headline chart:** mission score against connectivity, one panel per topology, one curve per mode. Our hypothesis is that HIVE holds up far better than both central modes under balanced islands, and that all modes struggle when drones are cut off from teams. The data decides; we show it either way.

---

## 8. The 90-second demo

| Time | What happens |
|---|---|
| 0–15 s | Map of Manchester: 4 drones search, 3 teams respond. "Seven independent n8n instances. No server tells them what to do." |
| 15–25 s | A distress text reaches a nearby drone and the AI turns it into a task. A drone's sensor confirms it. Teams exchange bids, and the actor cards show ownership **settling as the bids spread** |
| 25–35 s | Press **SIMULATE NETWORK BLACKOUT**. Links turn red and the network splits into 3 islands: {drone-1, drone-2, team-1}, {drone-3, team-2}, {drone-4, team-3} |
| 35–60 s | New incidents arrive. Each island keeps searching and rescuing. The per-actor views **visibly diverge** |
| 60–75 s | Restore links. Gossip flows back, conflicting claims resolve, duplicated work is flagged and counted, and the shared task views **converge** |
| 75–90 s | Benchmark chart: HIVE against both central baselines under the same outage. Close with the measured result: "Under this blackout, HIVE rescued 29.7 of 30 survivors on average; both central dispatchers rescued none. Zero duplicated rescues; the cost was about 107 cells of wasted travel." (10 seeds, `bench/results/summary.csv`) |

**Interactive bit:** let the judges click individual links on the map to cut them themselves.

---

## 9. Build plan (24-hour hackathon, team of 3–4)

| Hours | Track A: Infra and sim | Track B: n8n agents | Track C: Dashboard |
|---|---|---|---|
| 0–3 | Docker Compose: 7 n8n instances + 7 store sidecars, proxy, **one private network per actor**; prove direct peer calls fail; sim skeleton | Prove the n8n spikes (deploy, concurrency, Code node, AI); Perceive + Act workflows | Map rendering from simulator state |
| 3–8 | Proxy link matrix + delivery log; per-actor sensor, move and **idempotent** rescue APIs | Gossip + Merge: version vectors with contiguous tracking, `(actor_id, seq)` dedupe, grow-only set CRDTs | Poll each `/state`; actor cards; link status |
| 8–14 | Seeded scenario generator; distress feed delivered to drones in range; **headless fast-forward sim** reusing the shared JS functions | **CBBA** as a pure, unit-tested JS function → Bid workflow; commit logic | BLACKOUT button; click-to-cut links; activity feed |
| 14–18 | Both central baselines (live and headless) | AI Agent node for distress text + regex fallback | Metrics charts |
| 18–21 | Benchmark runs: all modes × topologies × 10 seeds; live spot checks | Run every §6.6 acceptance check; fix failures; tune weights; `commit_radius` experiment | Headline chart; polish |
| 21–24 | **Freeze. Rehearse the demo 5 times.** Record a backup video | | Slides (3 max) |

**Checkpoint, hour 8:** a drone detection reaches a team through the proxy and the team rescues the survivor. Cutting the link visibly stops sync. Replaying gossip doesn't double-count.

**Checkpoint, hour 14:** the full 7-actor run works: blackout into 3 islands, every island rescues, then reconnect and converge.

---

## 10. Stretch goals (in priority order)
1. **"Corrupt an agent" button: signed events and suspicious-agent detection.** A judge picks an actor, which starts gossiping fake survivors and inflated bids. Honest actors sign their events (Ed25519), so everyone knows *who* made each claim. They then apply a clearly specified detection rule, such as "a survivor claim that a drone's own sensor contradicts lowers the sender's trust", and stop accepting bids from untrusted actors. We report false positives, missed lies and the assumptions behind detection.
   *Honest framing:* a signature proves who said "there are three people here", not that the people exist. This demonstrates authentication and detection. It is not Byzantine consensus, and we don't claim a fault-tolerance bound. See [The Byzantine Generals Problem](https://www.microsoft.com/en-us/research/uploads/prod/2016/12/The-Byzantine-Generals-Problem.pdf).
2. **Supply-station actors**, with resources allocated the same way via CBBA.
3. **Judges as actors:** open a page on a phone to become a rescue team and play live alongside the agents.

---

## 11. Risks and how to handle them
| Risk | Mitigation |
|---|---|
| 7 n8n instances are heavy on one laptop | Limit memory per container; turn off saving successful executions and prune history; profile on day 0; last resort, fall back to 5 actors |
| n8n schedule triggers are too slow or jittery for ticks | Start at 2 s ticks and measure execution latency; or drive ticks with a simulator webhook that carries only the tick number |
| Concurrent workflows corrupt actor state | `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` (one execution at a time per actor); the store rejects stale-version writes and counts them |
| Network cuts are fake (actors reach each other directly) | One private Docker network per actor; an automated test that a direct call fails |
| CBBA bugs eat hours | One pure JS function, unit-tested outside n8n first; the same function powers the headless benchmark |
| Benchmark too slow to run enough seeds | Headless fast-forward sim; live n8n only for spot checks |
| LLM latency or outage during the demo | Interpret is off the critical path. Cache parsed results; regex fallback parser |
| Live demo breaks | Fixed scenario seed, a rehearsed script and a pre-recorded backup video |

---

## 12. One-line pitch
**"HIVE is a rescue swarm with no central dispatcher. Cut its network and every island keeps saving people, then it heals back into one picture, and we measure exactly what that gains and what it costs against central dispatch."**
