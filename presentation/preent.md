# HIVE — five-minute live demo

**Target:** finish speaking at **4:25**, leaving 35 seconds for a slow transition or one question. Timings are elapsed presentation time, not simulation time.

**The story:** seven independent n8n actors share one mission → a distress text reaches a drone and becomes a task → the network splits into three islands → each island keeps rescuing on its own knowledge → links return, the actors gossip what was missing and agree again → the benchmark shows what that is worth.

**Route:** Mission → Swarm / Agent workflows → n8n editor → Swarm / Agent coordination → Insights / Actor knowledge → Swarm / recovery → Insights / Actor knowledge → Insights / Performance comparison → Mission.

The quoted paragraphs are the spoken script (about **380 words**). Everything else is a stage direction.

## 1. What is real, and what you may claim

| Part | Status | Claim you may make |
|---|---|---|
| 7 actors (4 drones, 3 rescue teams), each its own n8n 2.x instance + SQLite store, own Docker network | Built (`scripts/gen-compose.mjs`) | “Seven independent n8n instances. No server tells them what to do.” **Only once you have seen all seven running.** |
| Workflows `hive-tick`, `hive-gossip`, `hive-merge`, `hive-interpret` | Built, tested by `n8n/test/` emulator | “Every actor runs byte-identical workflows; only its store’s role differs.” |
| Decision logic: CBBA, version vectors, gossip, merge | `core/`, unit-tested | The same code runs in n8n and in the benchmark. |
| Network cut | Chaos proxy refuses cross-island requests | “Real refused connections” **only after `scripts/check-isolation.sh` passes on the demo machine.** |
| Distress texts → Claude → provisional task, regex fallback | `hive-interpret` | Say “Claude” only if `ANTHROPIC_API_KEY` is set and the call works; otherwise “a fallback parser”. |
| Dashboard (`http://localhost:8000`) | Read-only observer | It reads stores, simulator and proxy. It never assigns tasks or relays messages. |
| Benchmark | **Measured**: 270 headless runs, real `core/`, 10 seeds each (`bench/results/summary.csv`) | The numbers in §9 exactly as written. |
| Analyst panel | Rule-based | Never say it uses a language model. |
| Swarm “Workflow activity” panel | **Inferred** from proxy, simulator and store changes, not n8n’s execution log (the page footer says so) | For proof of n8n, open the actor’s **real n8n editor → Executions**. |

**Not yet verified end to end:** the README lists the live Docker deployment and e2e/acceptance runs as remaining. Rehearse §2 fully before presenting. If the live stack cannot be made to run, use the fallback in §11. Do not describe the mockup as live n8n.

## 2. Set the stage (before the judges watch)

**Bring up the stack (allow ~10 minutes; n8n instances boot one at a time):**

```bash
node scripts/gen-compose.mjs          # all 7 actors (~5 GB Docker memory)
docker compose up -d
bash scripts/check-isolation.sh       # must pass before you say "real network cut"
bash scripts/deploy-workflows.sh
node tests/e2e/checkpoint14.mjs       # rehearsal: 3-island blackout, every island rescues, then reconverges
```

If the laptop cannot run seven instances, use the 4-actor dev stack (`--actors drone-1,drone-2,team-1,team-2`) and say **“four of the seven actors”**. Note that under the blackout preset team-2 is then alone in its island (its drone, drone-3, is not running), so expect it to rescue only what its own sensor sees.

**Open these tabs, in order:**

1. `http://localhost:8000`: the dashboard.
2. `http://drone-1.localhost:5671`: Drone 01’s own n8n editor, logged in, **Executions** list open.
3. `http://team-1.localhost:5675`: Rescue 01’s own n8n editor, **Executions** list open.
4. A recorded backup run of this exact route, in a separate window.

The n8n editors are also reachable from the dashboard (**Open in n8n ↗** in the Swarm inspector). Actor ports: drone-1…4 → 5671–5674, team-1…3 → 5675–5677.

**On the dashboard:**

1. **Mission** → **Reset**. Reset restores all links and starts the simulator (same seed).
2. Click **Fit mission**. Use **2D** if the projector makes 3D hard to read.
3. Close the **Analyst** panel.
4. Confirm the header shows **Simulate network blackout** (not **Restore all connections**) and that you are **LIVE**, not in a recorded session.
5. Confirm all seven actors appear and none is marked stale.
6. Close notifications and unrelated tabs.

### Cue sheet

| Time | Screen | The one thing to establish |
|---|---|---|
| 0:00–0:40 | Mission | The problem, the shared goal, seven actors |
| 0:40–1:15 | Swarm → Agent workflows → n8n editors | Each actor really is its own n8n |
| 1:15–2:05 | Swarm → Agent coordination | Blackout; a new distress text is handled inside one island |
| 2:05–2:30 | Insights → Actor knowledge | Actors genuinely hold different knowledge |
| 2:30–3:10 | Swarm, then Insights | Gossip delivers the missing events; views agree again |
| 3:10–3:50 | Insights → Performance comparison | The measured result |
| 3:50–4:25 | Mission | Close |
| 4:25–5:00 | Stay on Mission | Buffer / one question |

## 3. Mission — the problem and the goal · 0:00–0:40

**Click:** nothing. Point to the map.

> “When floods take out communications, rescuers can be close to people who need help but cut off from dispatch. A central controller stops working at exactly that moment. HIVE is a rescue swarm with no dispatcher.
>
> These are seven independent actors over a flooded Manchester: four drones that search and receive distress texts, three rescue teams that bid for rescues and carry them out. They share one mission score that rewards urgent rescues and penalises delay. A drone alone saves nobody; a team alone is nearly blind. They have to work together.”

**Show:** actors moving. If visible, point once at **How a rescue happens**. Do not read the stages.

## 4. Inside an actor — real n8n · 0:40–1:15

**Click:** **Swarm** → **Agent workflows** → **Drone 01**. Then switch to the **Drone 01 n8n tab**, then the **Rescue 01 n8n tab**.

> “Each actor is its own n8n instance with its own database and its own store. They all run the same four workflows. Tick is the heartbeat: sense, decide, act. Gossip runs on each actor’s own clock and sends peers the events they are missing. Merge takes in what a peer sent. Interpret turns a distress text into a task.
>
> Here are two of those instances side by side. Their executions run independently. Nothing here is a central server.”

**Show:** the **Executions** list updating in each editor. Open one `hive-tick` execution only if it loads instantly; otherwise just point at the list.

**Exit cue:** the judges have seen two separate n8n editors running. Do not tour every node.

## 5. Break the network · 1:15–2:05

**Click, in order (back on the dashboard):**

1. **Swarm** → **Agent coordination**.
2. **Simulate network blackout** (top action row). The toast says *“Three islands. Each still has a drone and a rescue team.”*
3. **Add distress text** (Swarm toolbar).

> “I’ve just split the swarm into three islands. The links aren’t just drawn red: every actor sits on its own private network and can only reach peers through a proxy, and that proxy is now refusing cross-island requests.
>
> A new distress text has just been sent, messy free text like ‘stuck on roof with two kids, water rising’. It only reaches HIVE when a drone is in range. That drone turns it into a task, which stays provisional until a sensor confirms it.”

**Note the new task ID** (`T-…`) shown in the feed and toast. Refer to it as **“this new incident”**.

4. Click the drone that received it in the actor list, then the rescue team in **the same island**.
5. Tick **Selected actor only** beside **What moved between actors?**

> “The discovery reaches the rescue team in its own island. The other islands cannot hear it. This team still bids for the task and responds with the information it has.”

**Show:** the delivery record, then the team acting. Watch for a rescue receipt from the simulator for that incident; moving markers alone do not prove a rescue.

**If it completes before 2:05:** “That rescue happened while the islands were still disconnected.”
**If not:** “The team has the task and is responding while disconnected.” Move on. Never say “rescued” for something still travelling.

## 6. Prove the separation · 2:05–2:30

**Click:** **Insights** → **Actor knowledge**. The badge should no longer say **Views agree**.

> “This is each actor’s own memory, read from its own store. The actors in that island know about the new incident; the others do not. The dashboard can see all of them, but it never passes information between them.”

**Point to:** **Known** for the island’s actors and **Not yet known** for the rest, on the same task row.

## 7. Reconnect · 2:30–3:10

**Click, in order:**

1. **Swarm** → **Agent coordination**. Untick **Selected actor only**.
2. **Restore all links**.

> “Restoring links doesn’t magically update anyone. Each actor keeps a version vector, a record of the last event it has seen from every other actor, so gossip sends exactly the events a peer is missing. Duplicate or reordered messages have no effect. If two islands claimed the same task, the same deterministic rules pick one winner everywhere, and the loser replans.”

**Show:** new delivery records in **What moved between actors?** The timestamped records are the evidence; the packet animation is decoration.

3. After a few gossip rounds (gossip runs every ~4 s per actor): **Insights** → **Actor knowledge**.

> “Every actor now knows the same incident, and the badge shows their views agree. The islands kept working while apart, and the swarm healed back into one shared picture.”

**If any column is still unknown:** wait one more gossip round. Do not claim agreement until the badge shows **Views agree**.

## 8. Optional — the analyst

Skip in the main pitch. If asked: it explains observed state, is rule-based, and never controls the swarm.

## 9. The measured result · 3:10–3:50

**Click:** **Insights** → **Performance comparison**. It loads the measured results from `bench/results/summary.json`. If it shows an error, say the numbers below and offer `bench/results/report.html` afterwards.

> “We didn’t want to just claim decentralisation is better, so we built a benchmark that could prove us wrong. Same seeds, same actors, same outage, three strategies: HIVE, a naive central dispatcher, and a stronger one that finishes its existing tasks. It runs the exact decision code the n8n actors run, ten seeds per setting.
>
> Under this three-island blackout, HIVE rescued 29.7 of 30 people on average. Both central dispatchers rescued none. HIVE never sent two teams to the same rescue; the cost was about 107 grid cells of wasted travel.
>
> And to be fair to central dispatch: with every link up, it is slightly better, 90.7 against 90.2. Decentralising costs almost nothing when the network is healthy, and keeps people alive when it isn’t.”

**Numbers you may quote (10 seeds each, `bench/results/summary.csv`):**

| Scenario | HIVE | Central (both) |
|---|---|---|
| 3-island blackout: rescued / 30 | **29.7** (score 84.0 ± 5.5) | **0** |
| All links up: mission score | 90.2 | 90.7 |
| Zero links: rescued / 30 | 18.0 (teams’ own sensors) | 0 |
| One actor isolated: score | 87.1 | 85.1 |
| Duplicate rescue commitments | **0** in every configuration | — |
| Converged after reconnecting | every run (blackout: 4.2 rounds avg) | — |

Do not present “central strong” as a separate win: it equals the naive dispatcher here because the outage starts at tick 1, before HQ has handed out any assignment.

## 10. Close · 3:50–4:25

**Click:** **Mission**. Optionally **Follow incident** → the new incident.

> “HIVE is seven independent n8n actors with no dispatcher. When the network split, each island kept saving people with what it knew. When links came back, they healed into one shared picture. And we measured it: under a blackout, a central system saves nobody; HIVE saves almost everyone, at a small, visible cost. Losing the network shouldn’t mean losing the rescue.”

**Stop speaking.**

## 11. If something slips

| Situation | Response |
|---|---|
| Behind at 3:10 | Say only the blackout line from §9 (29.7 vs 0), then close. |
| Live stack won’t start or an actor is stale | Switch to the recorded backup: “I’ll show the recorded run of the same scenario.” |
| No recording and no stack | Open `mockup/index.html` and say: **“This is our UI prototype on a simulated four-actor slice; the live system runs the same flow across seven n8n instances.”** The mockup’s **Performance comparison** shows illustrative numbers. Don’t open it; quote §9 instead. |
| Distress text never reaches a drone | It only delivers when a drone is in range. Click **Add distress text** again (it is placed near a different drone each time). |
| Map tiles / WebGL fail | Click **Offline**: “The basemap is unavailable; the swarm is still running.” |
| Accidentally in recorded history | **RETURN LIVE** on Mission. |
| Rescue not finished | Describe the response in progress. Never say “rescued” for “travelling”. |

### Don’t spend time on
Disaster statistics, map/terrain/font details, every workflow node, JSON payloads, CAP/Byzantine theory lectures, or any number not in §9.

## 12. Likely questions — short answers

**“Is it really decentralised?”**
> “No dispatcher, no leader, no vote. Each actor has its own n8n, its own store and its own private network. The workflow build fails if any node calls a god-view endpoint like `/world` or `/metrics`, so an actor can’t be built to cheat. The dashboard only observes.”

**“Why n8n?”**
> “n8n is the actor runtime. With concurrency limited to one, each instance runs one execution at a time, so tick, gossip and merge can never overwrite each other. The decision logic is one pure JavaScript bundle injected into the Code nodes, so the benchmark measures the same code.”

**“What if two islands rescue the same person?”**
> “That’s the price of staying available during a split, so we measure it. Planning is reversible; committing on arrival is not. In the benchmark that produced zero duplicate rescues, and about 107 cells of wasted travel under blackout. The simulator never counts a rescue twice.”

**“What does Claude do?”**
> “It turns messy distress texts into structured tasks: location, people, urgency. Its output is clamped and stays provisional until a drone’s sensor confirms it. If the call is slow or fails, a regex parser with a district gazetteer takes over.”

**“What happens with no links at all?”**
> “Each actor uses only its own memory and sensor. Teams have a short-range sensor, so HIVE still rescues 18 of 30 with zero links; central rescues none.”

**“How do you know they actually converge?”**
> “Each actor publishes a digest of its shared state; the dashboard compares digests. In the benchmark, every HIVE run converged after reconnection, about four gossip rounds after a three-island blackout.”

## 13. Rehearsal checklist

- [ ] Full stack up, `check-isolation.sh` passes, workflows deployed, no stale actors.
- [ ] `node tests/e2e/checkpoint14.mjs` passes on this machine.
- [ ] Both n8n editor tabs logged in and showing executions.
- [ ] Distress text → island-local delivery → response seen at least once.
- [ ] **Views agree** returns after **Restore all links**.
- [ ] Performance comparison loads the measured data.
- [ ] Route run three times with a timer; spoken close done by **4:25**.
- [ ] Backup recording made after the final changes.
- [ ] If presenting the 4-actor stack or the mockup, every “seven” in the script is changed accordingly.
