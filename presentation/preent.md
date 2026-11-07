# HIVE — five-minute UI demo

**Target:** finish speaking at **4:25**, leaving 35 seconds for a slow transition or a question. Timings below are elapsed presentation time, not the simulation clock.

**The story:** a drone discovers people → a local team responds during a network split → disconnected actors have different knowledge → reconnection shares the missing discoveries.

**Route:** Mission → Swarm / Agent workflows → Swarm / Agent coordination → Insights / Actor knowledge → Swarm / recovery → Insights / Actor knowledge → Mission.

The quoted paragraphs are the spoken script: approximately **350 words** on the main route, leaving time for clicks and the rescue to complete. Everything else is a stage direction or preparation note. Rehearse the clicks alongside the words.

## 1. Choose the truthful version before rehearsing

This script matches the current `mockup/` UI: **four browser-simulated actors**, planned n8n canvases, example bids, and illustrative comparison figures. It does not describe four live n8n instances. Some architecture plans in `hack.md` describe a larger system; use the actor count and capabilities actually visible in the demo.

Keep the prototype wording until the backend and its telemetry are connected and tested. The short replacements in §12 are for that later stage. Configuring an **Open in n8n** link alone does not make workflow activity live.

## 2. Set the stage before the timer starts

Do this before the judges begin watching:

1. Open the mockup on a desktop browser. Load the geographic map and fonts in advance.
2. Click **Mission** → **Reset**. Reset starts the simulation running.
3. Immediately click the **pause icon beneath the map**. Its play triangle should now be visible. This is the starting state.
4. In the playback dropdown beside that button, choose **3×**. This accelerates the demo's logical simulation; it does not imply real-world rescue speed.
5. Click **Fit mission**. Leave **3D** selected if it runs smoothly; use **2D** if the projector makes the tilted view harder to read. Do not spend presentation time adjusting the camera.
6. If the right-hand analyst is open, click **Analyst** to close it. Keep attention on the actors. You can reopen it for the optional segment.
7. Confirm the header offers **Simulate network blackout**, rather than **Restore all connections**. Confirm you are **LIVE**, not replaying recorded history.
8. Confirm there are two drones and two rescue teams. The starting total includes **12 people already rescued before the recording**; those are not rescues performed during your pitch.
9. Keep a screen recording of this exact route ready in another window. Close notifications and unrelated tabs.

**Starting screen:** Mission, map framed, simulation paused, 3× selected, all links restored, analyst closed.

### Cue sheet

| Time | Screen | The one thing to establish |
|---|---|---|
| 0:00–0:45 | Mission | What HIVE does and the common goal |
| 0:45–1:15 | Swarm → Agent workflows | Separate actor workflows and local decisions |
| 1:15–2:10 | Swarm → Agent coordination | Local response continues during a partition |
| 2:10–2:35 | Insights → Actor knowledge | Actors really hold different information |
| 2:35–3:15 | Swarm, then Insights | Missing discoveries propagate after reconnecting |
| 3:15–3:45 | Mission | Connect the technical behaviour to a completed rescue |
| 3:45–4:05 | Optional analyst OR verified results | One useful explanation or one measured result |
| 4:05–4:25 | Mission | Close on the project's contribution |
| 4:25–5:00 | Stay on Mission | Buffer / one question |

## 3. Mission — the problem and the goal · 0:00–0:45

**Click:** nothing for the opening. Point to the map.

**Say:**

> “When flooding breaks communications, a responder can still be nearby but cut off from dispatch. HIVE explores a different approach: drones and rescue teams coordinate locally, keep working in connected groups, and reconcile when links return. This is our interactive prototype.”

**Then click:** the **play triangle beneath the map**. Leave the speed at 3×.

**Say:**

> “These two drones find people. These two teams perform rescues. They share one mission: getting people to safety. The dashboard lets us see their movement and the information behind their decisions.”

**Show:** actor movement. Briefly scroll to **How a rescue happens** if it is outside the viewport. Point to **Found → Shared → Assigned → Travelling → Safe**. Do not read every stage.

**Exit cue:** judges understand the roles and shared goal. Move on even if an initial rescue is still travelling.

## 4. Swarm / Agent workflows — what is inside an actor · 0:45–1:15

**Click, in order:**

1. **Swarm** in the top navigation.
2. **Agent workflows**.
3. **Drone 01** in the actor list on the left.
4. **Gossip** in the six-workflow selector.
5. **Rescue 01** in the left actor list.
6. **Merge** in the workflow selector.

Keep the simulation running while you explain.

**Say:**

> “These are the planned n8n workflows for each actor. Gossip shares discoveries with reachable peers. Merge updates the receiving actor’s local memory. In the backend design, each workflow has its own trigger and each actor makes its own decisions.”

**Show:** the selected actor changes, and the canvas changes from sending to receiving. Point once to **Local task knowledge** in the inspector.

**Important wording:** say **planned workflows** in the current prototype. The node shapes are not a live n8n editor, and the example bids are not measured CBBA output.

**Exit cue:** the judges understand that coordination happens between actors with separate local state. Do not tour all six workflows or open JSON payloads.

## 5. Swarm / Agent coordination — break the links · 1:15–2:10

**Click, in order:**

1. **Agent coordination**.
2. **Pause demo** in the Swarm toolbar. It should change to **Resume demo**.
3. **Simulate network blackout** in the page's upper action row.
4. **Add discovery** in the Swarm toolbar.

**Say while clicking:**

> “Now I’ll split the swarm. Each island still has a drone and a rescue team. This is a new discovery made after the split—not a rescue assigned beforehand.”

**Remember the new task ID** shown in the event feed, normally `RSC-016` after a clean reset. Call it **“this new incident”** aloud; do not rely on a particular ID.

**Then click:**

5. **Drone 01** in the left list. Its inspector should know the new task.
6. **Resume demo**. Keep 3× selected from setup.
7. **Rescue 01** in the left list.
8. Check **Selected actor only** beside **What moved between actors?**

**Say:**

> “The discovery reaches the rescue team inside this island. The other island cannot receive it. This local team can still respond using the information it has.”

**Show:** the delivered-task record, followed by the team’s movement/action. Allow roughly **20–25 seconds** of running time while narrating. Under the current demo, the new local rescue should complete within this window when the initial jobs are already finished.

**Watch for:** a record saying **“Simulator recorded … people rescued”** for the new incident. That is your evidence of completion; moving markers alone do not prove a rescue.

**Once it appears:** click **Pause demo**.

**Say only if that record appeared before reconnection:**

> “That rescue completed while the groups were still disconnected.”

**If it has not completed by 2:10:** pause and say **“The team has received the discovery and is responding while disconnected.”** Continue. Do not wait indefinitely or claim completion.

**Background activity:** the demo can generate additional discoveries during a partition. Stay with the task ID you noted. Extra rows are not a reason to reset.

## 6. Insights / Actor knowledge — prove the separation · 2:10–2:35

**Click:** **Insights** → **Actor knowledge**.

The simulation should still be paused. Find the row for the incident introduced after the blackout.

**Say:**

> “This table shows each actor’s own knowledge. The drone and team in this island know about the new incident. The other two actors do not. The dashboard can observe both groups, but it does not pass information between them.”

**Point to:** the two **Known** entries and the two **Not yet known** entries for that same task.

**Exit cue:** judges have seen the difference between information visible to an observer and information available to an actor.

## 7. Reconnect — show the missing information arriving · 2:35–3:15

**Click, in order:**

1. **Swarm** → **Agent coordination**.
2. Uncheck **Selected actor only** if it is still checked.
3. **Restore all links** in the Swarm toolbar.
4. **Resume demo**.

**Say:**

> “Restoring a link does not magically update everyone’s memory. The actors still have to exchange the missing discoveries. Here are those deliveries arriving.”

**Show:** new delivered-task records in **What moved between actors?** Blue packet animation is a visual aid; the timestamped records are the evidence. Do not depend on catching a brief animation.

After about **three real seconds** at 3×:

5. Click **Pause demo**.
6. Click **Insights** → **Actor knowledge**.

**Say after the same task is Known in all four columns:**

> “Now all four actors know about the same incident. The local groups kept working, and reconnection brought their task knowledge back together.”

**Be precise:** the current mockup reconciles task knowledge. It does not yet prove full event-log agreement, conflict-free bids or duplicate-commit handling.

**If any entry remains unknown:** return to **Swarm**, confirm **6 / 6 available links**, resume for a few more ticks, then return to this table. If the check still fails, report what is visible and move on.

## 8. Mission — return to the people · 3:15–3:45

**Click, in order:**

1. **Mission**.
2. Scroll to **How a rescue happens**.
3. Use **Follow incident** to choose the task introduced after the blackout.

**If its status is Safe, say:**

> “This is the same incident: found, shared locally, responded to, and rescued. The useful result is not the animation or the number of agents. It is a local response that continued despite a wider communication failure.”

**If still Travelling, say instead:**

> “This is the same incident. Its discovery reached a local responder, and the team is acting on it. The interface distinguishes a response in progress from a completed rescue.”

Point to the incident’s stage. Use the **+… during this recording** figure if you mention the mission total. Do not present the starting 12 rescues as new work.

**Optional:** click **Show on map** once to connect the incident to its location. Avoid further camera changes.

## 9. One optional feature — choose before presenting · 3:45–4:05

Use **one** of these, not both. If you are behind schedule, skip this section entirely.

### A. Analyst — works with the current mockup

**Click:** **Analyst** to reopen the right panel → **Explain recovery** in its suggestion buttons. Stay on Mission.

**Say:**

> “The analyst explains the observed state without controlling the swarm. In this prototype its responses are rule-based; the actors remain responsible for their own actions.”

Point to the current knowledge summary or its evidence link. Do not type a fresh question or read a long answer aloud.

### B. Insights / Performance comparison — only with verified results

The current screen explicitly says **NOT MEASURED RESULTS**. **Skip it in the main pitch until it contains real benchmark evidence.** The sample values 18 rescues, 2 duplicate commitments and 6.2 seconds are not results you can claim.

Once measured results are connected:

**Click:** **Insights** → **Performance comparison**.

**Say, using actual values only:**

> “Across [N] identical scenario seeds under this outage, HIVE rescued [A] people, compared with [B] for central dispatch with cached assignments. The cost was [C] duplicated commitments.”

Point to one comparison and its variability. Return to **Mission** before closing. If you cannot substantiate the numbers and the baseline, use option A or skip the segment.

## 10. Close on Mission · 4:05–4:25

Stop clicking. Leave the map or the selected rescue visible.

**Say:**

> “HIVE’s design combines local decisions, continued response during a split, and shared knowledge after reconnecting. Next, we connect independent n8n actors and validate the results. Losing central connectivity should not mean losing local coordination.”

**Stop speaking.** Leave the remaining time for a question. Do not fill the silence with another feature tour.

## 11. If the timer or demo slips

| Situation | Exact response |
|---|---|
| You reach 3:45 before completing the core story | Skip the analyst and comparison. Finish the knowledge check, return to Mission and close. |
| Map tiles or WebGL fail | Click **Offline** in the map footer. Say: “The geographic background is unavailable; the coordination simulation is still running.” Continue. |
| You accidentally enter recorded history | On Mission, click **RETURN LIVE**. Replay disables scenario-changing buttons. |
| You lose track of whether the demo is paused | In Swarm, **Resume demo** means it is paused; **Pause demo** means it is running. Check before adding a wait. |
| The live UI becomes unreliable | Switch to your recorded demo. Say: “I’ll show the recorded run of the same scenario.” Resume at the blackout; do not spend a minute debugging. |
| A rescue has not finished | Describe the received task and response in progress. Never substitute “rescued” for “travelling.” |

### Do not spend the five minutes on

- Disaster statistics, competitor lists or claims of being the first.
- Terrain, tree models, font choices or map-library details.
- All six workflow canvases, all actor JSON payloads, or a full architecture lecture.
- CAP, Byzantine fault tolerance or mathematical convergence claims.
- Sample benchmark numbers or claims that an entirely disconnected drone can reach a team.

## 12. Update these lines after backend integration

These are replacements for the script, not extra material to add to its length.

| Where | Current wording | Replace only after verification |
|---|---|---|
| Opening | “This is our interactive prototype.” | “This is our live simulated mission, coordinated by independent n8n actors.” |
| Workflow segment | “These are the planned n8n workflows…” | “Each actor runs these workflows in its own n8n instance.” Show real execution identifiers or actual editor activity. |
| Local allocation | Describe the assigned actor without claiming the fixture bids were computed | Explain one real bid using recorded urgency, travel and capacity inputs. |
| Recovery | “Their task knowledge [came] back together.” | Describe exactly the replicated state your acceptance checks demonstrate; retain any limitations. |
| Comparison | Skip illustrative fixtures | Use real paired-run results, seed count, variability and duplicate-work cost. |
| Closing | “Our next step is connecting this observer…” | “We demonstrated local decisions, continued response during this partition, and [the verified recovery result].” |

Do not say “real network cut” until delivery genuinely fails through the proxy and bypass paths have been checked. Do not say the analyst uses a language model until it actually does.

## 13. Three short answers to likely questions

**“Is this really decentralised?”**

> “The current UI models separate local knowledge. The backend design gives each actor its own n8n instance and store; no dispatcher assigns their tasks. The dashboard is an observer.”

After integration, replace the design statement with the deployed evidence you can show.

**“What if two islands respond to the same incident?”**

> “Disconnected groups can duplicate work. We reconcile reversible plans after reconnecting and measure repeated commitments and wasted travel. The current mockup does not yet implement that full conflict-handling path.”

**“What happens with no peer links at all?”**

> “An actor can only use its existing knowledge and its own sensing. A drone cannot send a new discovery to a separate rescue team without a surviving communication path.”

## 14. Rehearsal checklist

**Checked against the current UI:** a click-through rehearsal at 3× completed the newly introduced rescue in about 19 real seconds while the two islands remained disconnected. The incident was known to Drone 01 and Rescue 01, then reached all four actors after reconnection. Use the visible event and knowledge checks as your cues, rather than assuming the same wall-clock timing on every laptop.

- Run the exact route three times with a timer; aim to finish the spoken close by **4:25**.
- Verify the new incident can be delivered, responded to and, ideally, rescued during the partition at the chosen simulation speed.
- Know where its task ID appears in the feed and knowledge table.
- Check that restoration produces actual delivery records and matching task knowledge.
- Decide in advance whether to use the optional analyst or a verified comparison.
- Record one clean backup run after the final UI/backend changes.
- Choose one presenter and one clicker if available. The clicker follows the cue sheet; the presenter watches the judges.
