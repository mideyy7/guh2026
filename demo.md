# HIVE — Demo script

**Total: ~4 minutes.** Six sections, then a 20-second close on the numbers.

## Before you go on (2 minutes)
- Docker running. Dashboard open at **http://localhost:8000** (Chrome, every other tab closed).
- Second tab: **Drone 02's n8n editor**, http://drone-2.localhost:5672 (the workflow list you'll show in §6).
- Click **Reset** (top right of the dashboard). The mission restarts with all links up.
- Close VS Code and anything else you don't need. The laptop is tight on memory.
- Backup if anything freezes: open `mockup/index.html` directly. It needs no backend.

---

## 1. The story: why HIVE exists (45 s)
**Screen:** dashboard, **Mission** tab, map visible. Don't click yet.

**Say:**
> "It's 1:40 a.m. in Lower Broughton, by the River Irwell. Amara is on her roof with two kids, water rising. She texts for help. The phone mast is dead, so the message just says *Sending…*
>
> A drone flew over her eleven minutes ago and saw her. But the system waits for a central server to tell a boat where to go, and that server is unreachable.
>
> This isn't hypothetical. Hurricane Maria knocked out **95% of Puerto Rico's cell sites**. In Valencia in 2024, more than **220 people died**, and practically all of them before the emergency alert reached their phones. Floods are **more than 40% of all disasters** and have affected **1.65 billion people**. In England, **6.3 million properties** are at risk today, heading for **8 million by 2050**.
>
> Disasters take out the network first. We built a rescue swarm that keeps working when it does."

---

## 2. Working towards a common goal (30 s)
**Click:** nothing yet; point at the **map**, then the **"How a rescue happens"** panel below it.

**Say:**
> "This is real Manchester and Salford. The flood and survivors are simulated. Round markers are drones, square ones are rescue teams: seven actors, one shared goal. Rescue as many people as possible, most urgent first. That's the mission score.
>
> Orange markers are people waiting; green ticks are rescued. This panel follows one rescue end to end: found, shared, assigned, travelling, safe."

**Click:** the **Follow incident** dropdown in "How a rescue happens", pick any incident to show its stages.

---

## 3. Independent decision-making (40 s)
**Click:** the **Swarm** tab → **Agent coordination**. Then click **Drone 02** in the left list.

**Say:**
> "There's no dispatcher. Each actor is its own n8n instance with its own memory. It senses for itself, bids for rescues itself, and agrees with its peers using CBBA, a consensus algorithm with no auctioneer.
>
> On the right is Drone 02's own view: the tasks it knows, the peers it can reach, its group. It reads only its own store."

**Click:** the **Insights** tab → **Actor knowledge**.

**Say:**
> "This table is every actor's separate memory, side by side. Each column is one actor's own belief, not a shared database."

---

## 4. Resilience when communications fail (50 s)
**Click:** back to **Mission**, then **Simulate network blackout** (top right).

**Say:**
> "Now I cut the network. These are real refused connections through our chaos proxy, not a label. The swarm splits into three islands, and HQ is unreachable. Each island still has a drone and a rescue team, so each keeps searching and rescuing on its own."

**Point at:** the **"Who can still work together?"** panel (dashed lines = cut links, island boxes).

**Click:** **Insights → Actor knowledge** → **Add distress text**, then back to **Mission**.

**Say:**
> "A new distress text, like Amara's. It only gets through when a drone is in range, and only that drone's island learns about it. The other islands don't, because they can't. The table shows the memories diverging."

**Optional, if a judge wants to try:** **Swarm** tab → click any line in the diagram to cut or restore that single link.

---

## 5. Something we're excited about: the swarm heals itself (35 s)
**Click:** **Restore all connections** (top right, where the blackout button was).

**Say:**
> "Links come back. The actors gossip only what each other is missing, merge it with version vectors, resolve any conflicting claims with CBBA, and record any duplicated work instead of hiding it. Within a few seconds every actor's view agrees again.
>
> Real distributed-systems theory, applied to saving lives."

**Point at:** the **Insights → Actor knowledge** badge switching back to **"Task knowledge agrees"**, or ask the **Analyst** (right panel): *"Explain recovery"*.

---

## 6. How we use n8n (30 s)
**Click:** the second tab, **Drone 02's n8n editor** (the workflow list).

**Say:**
> "This is one actor. Every actor runs its own n8n instance with these same four workflows:
> - **hive-tick**: each tick it senses, bids and acts.
> - **hive-gossip**: every 4 seconds it shares what it knows with the peers it can reach.
> - **hive-merge**: it merges incoming gossip and resolves who owns which rescue.
> - **hive-interpret**: Claude turns a distress text into a structured rescue task.
>
> Seven of these, with no server between them."

**Optional:** open **hive-tick** to show the canvas.

---

## Close: the numbers (20 s)
**Click:** back to the dashboard → **Insights** → **Performance comparison**.

**Say:**
> "We measured it: 270 runs, 10 seeds per setting, same scenarios for every mode.
>
> Under a blackout, **HIVE rescued 29.7 of 30 survivors. Central dispatch rescued zero.** With only a quarter of links up, HIVE still rescued 29; central rescued 9. Zero duplicated rescues, and every run healed back into agreement.
>
> And to be honest: with every link up, central dispatch is slightly better. It should be. HIVE is built for the night the network goes down."

---

## Likely questions
| Question | Answer |
|---|---|
| "Why don't all seven actors move?" | "Three are live here: Drone 01, Drone 02 and Rescue 01. All seven run the same logic, which we benchmarked across 270 runs. Running seven n8n instances on an 8 GB laptop was our limit." |
| "Is the AI deciding who rescues whom?" | "No. Claude only reads distress texts. Every allocation decision is CBBA, made by each actor from its own information." |
| "What if two islands both rescue the same person?" | "Planning is reversible; arriving is not. If two teams commit, the simulator rescues the person once and we count the duplicate. We had zero in every HIVE run." |
| "Is the analyst panel an AI?" | "It's rule-based and read-only. It explains the state; it can't dispatch anyone." |
| "Where's the data from?" | "Streets and buildings are real (OpenStreetMap). The flood and survivors are simulated. The statistics in the story are sourced in hack.md." |
