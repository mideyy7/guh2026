# HIVE mission studio mockup

A local, interactive prototype of the dashboard proposed in `../hack.md`. All existing proposal content is untouched.

## Open

Open `index.html` directly in a browser, or serve this directory:

```sh
cd mockup
python3 -m http.server 8080
```

Visit **http://localhost:8080**. No build, package installation or API keys are required.

## Explore

- **Overview:** four simulated actors, rescue incidents, movement, mission metrics and an event feed. Click actors or incident markers for details.
- **Blackout / restore:** splits actors into two drone-and-team islands. New incidents appear during the partition. Restore delivery to reconcile task knowledge.
- **Swarm:** switch between Agent coordination and Agent workflows. Select an actor, inspect its local state and message receipts, cut individual peer links, inspect planned n8n nodes and view provenance-labelled demo activity. Instance/editor links can be configured later; no live n8n telemetry is connected.
- **Insights → Actor knowledge:** inject an incident and compare local knowledge; it propagates one peer hop per simulation tick.
- **Insights → Performance comparison:** three illustrative comparison curves, explicitly labelled as fixture data rather than measured outcomes.
- **Pause / reset:** pause the logical simulation or restore the original scenario.
- **Live geographic map (default):** MapLibre GL JS with OpenFreeMap Positron vector tiles and OpenStreetMap attribution. No API key is needed for this configuration. Requires internet and WebGL; unavailable map loading falls back to the bundled offline schematic.
- **2D / 3D:** start with a 52-degree perspective and extruded building footprints; switch to an overhead view for operational clarity. Actual building heights depend on source coverage, with an 8-metre visual fallback. This is building context, not a photorealistic scene or flood-depth model.
- **Layers:** toggle actors, incidents, simulated flooding, movement/routes, illustrated vegetation and communication links. Communication is hidden initially to reduce clutter.
- **Camera:** zoom, fit the entire mission, follow a chosen actor, or expand the map. Manual dragging cancels following. Reduced-motion preferences suppress animated camera transitions and packet effects.
- **Map selection:** click an incident to highlight it and show a summary, then inspect its allocation decision. Actor markers open their local-state details.
- **Movement:** actors interpolate between one-second simulation updates and leave short trails. Routes are direct demo paths, not computed road or boat navigation.
- **Offline schematic:** retained as an explicit mode; does not require map tiles. External fonts have system-font fallbacks.

## Scope and accuracy

This is a browser-only UI simulation, not a production distributed system. Decisions, bidding scores and benchmark data are demo fixtures; no n8n, LLM, durable event store, CBBA implementation or real disaster data is connected. Synthetic actor coordinates and the flood polygon are illustrative. Communication visualisations represent the browser's simulated peer deliveries, not real network requests. State resets on page reload.

The belief table models propagation of task identity and the fixture owner, not full replicated event-log or CBBA convergence. Real adapters should supply actor-local `/state` observations, simulator physics, chaos-proxy delivery records and measured benchmark results. The dashboard must remain an observer rather than become an assignment coordinator.

Files: `index.html` (structure), `styles.css` (shared styles), `studio.css` (map-first workspace layout), `theme.css` (Tempo light palette and local typography), `app.js` (demo state), `map.js` (geographic rendering), `vegetation.js` (Three.js scenery), and `studio.js` (analyst, telemetry and replay).


## Map data and dependencies

MapLibre GL JS 5.6.1 is loaded from unpkg. The geographic basemap uses `https://tiles.openfreemap.org/styles/positron` ([provider documentation](https://openfreemap.org/quick_start/)). Attribution stays visible on the map. Streets and buildings are geographic data; survivor positions, actors, routes, flood boundaries and task labels remain synthetic. Downloaded map dependencies and tile availability are independent of the simulated peer-link blackout. A real offline deployment would need packaged map assets rather than relying on the fallback schematic.


## Mission studio layout

The dashboard follows the supplied reference's information hierarchy: compact mission header, large geographic viewport, playback timeline, two explanatory mission panels and an analyst panel on the right. Swarm remains a separate workspace. Actor knowledge and performance comparison share the Insights tab. Mission details opens the priority incident and network summary. On a narrow screen, the analyst stacks below the mission workspace.

### Illustrated trees

A Three.js custom MapLibre layer renders up to 1,800 instanced low-poly crowns and trunks. Tree positions are procedurally sampled inside mapped park and woodland polygons from the loaded vector tiles. They are **illustrative scenery, not a surveyed vegetation dataset**. Coverage depends on the green areas loaded into the viewport. Trees are hidden in 2D and can be disabled using Layers. The scene uses real streets/building footprints without inventing a valley or detailed terrain. Three.js 0.160.1 is loaded from unpkg; if unavailable, the map still functions without the scenery layer.

### Analyst panel

The panel is a **deterministic, read-only demo**, not a connected LLM. Free-text questions are matched to supported topics: mission briefing, fixture bids, peer connectivity, actor knowledge, recovery, active incidents and benchmark limitations. Responses show the simulation tick and links to relevant views or map incidents. Unknown questions receive a supported-topic explanation. Requests to dispatch actors are declined by the panel. No API keys, credentials or remote model calls are used.

This panel is relevant to HIVE as an explanation and observability interface. It is not one of the coordinating actors and has no authority to allocate rescues. A future language-model integration should receive permission-limited, timestamped snapshots and produce evidence-based explanations, leaving assignment decisions inside the actors.

### Recorded timeline

The browser records one state snapshot per logical tick, retaining up to 1,800 frames. Use the timeline or previous/next buttons to inspect recorded history. Replay pauses live simulation and disables network mutations and incident injection. Return Live restores the latest recorded state; playback controls support 1×, 2× and 3× speed. Reset starts a new recording. The two bottom panels explain the selected recorded snapshot; they are distinct from the illustrative benchmark fixtures.


## The two bottom panels

The former metric strip and four small telemetry cards have been replaced with two explanatory panels:

1. **How a rescue happens:** choose a task and inspect Found → Shared → Assigned → Travelling → Safe. Only reached stages can be selected. A sentence explains the current state and the evidence behind a clicked stage. People icons show the mission outcome, including the survivors already safe when recording began. The allocation stage explicitly identifies its bids as fixtures.
2. **Who can still work together?:** a four-actor diagram shows reachable peer links, partitions and isolated actors. Its explanation checks whether each connected group contains both a drone and a rescue team. Moving dots represent newly delivered task observations in the browser simulation, not invented background traffic. Use the panel's blackout/restore button or inspect the complete link matrix.
Actor knowledge remains in the **Insights → Actor knowledge** view, where discoveries can be injected and local knowledge compared without duplicating a bottom panel.

Fleet details and the timestamped event feed are retained inside **Mission details**. The internal demo score remains available to the simulation, but its old display and decorative spark bars no longer occupy the mission workspace. Both panels follow the recorded timeline and disable scenario-changing controls during replay. Reduced-motion preferences suppress pulses and delivery animation.

Design inspiration: [Tempo](https://github.com/ernqiteng/Tempo), especially its [staged data diagram](https://github.com/ernqiteng/Tempo/blob/main/pitch/components/DataChart.tsx), [decision explanations](https://github.com/ernqiteng/Tempo/blob/main/pitch/components/DecisionChart.tsx) and [state-driven timing-audit flow](https://github.com/ernqiteng/Tempo/blob/main/pitch/components/TimingChart.tsx). HIVE uses original DOM/SVG/CSS implementation in `panels.js` and `panels.css`; no Tempo application code is bundled. The matching font assets are bundled with their SIL Open Font Licences.


## Tempo light theme

`theme.css` uses the exact palette from Tempo's `pitch/app/globals.css`: paper `#fafaf8`, cards `#ffffff`, rules `#d5d3d1`, grid `#f3f3f1`, ink `#1b1917`, body text `#77716d`, brand `#284c3f`, actual observations `#2563c9`, positive state `#74ca7e` and attention state `#ecaf56`. The matching surface, label, ring and action-tint tokens are included too. Semantic colours are applied consistently to the two mission panels, analyst, navigation, playback controls, map controls, dialogs and secondary views. Geographic scenery retains its map-specific colours.

The same font assets used by Tempo's pitch dashboard are bundled locally: Libre Baskerville for headings and major figures, IBM Plex Sans for interface text, and IBM Plex Mono for labels and identifiers. Font licences are in `fonts/OFL-*.txt`. The interface does not fetch Google Fonts at runtime.


## Swarm workflows

The former Network tab is now **Swarm**, with coordination and workflow views. Each actor has six independently triggered workflow plans rather than one artificial end-to-end chain. The event inspector distinguishes starting fixtures from newly observed browser actions. Interpret remains unrun in the current structured-detection demo. Pause/resume is available within Swarm, and replay permits inspection while blocking scenario mutations.

Backend handoff and editor-link configuration are documented in [SWARM_INTEGRATION.md](SWARM_INTEGRATION.md). The telemetry buffer is separate from actor decision-making; linking an n8n editor does not connect execution data automatically.


## Insights navigation

The main navigation contains Mission, Swarm and Insights. Insights groups Actor knowledge and Performance comparison behind accessible subtabs. Existing analyst evidence links still open the appropriate subsection directly. Performance figures remain explicitly labelled as illustrative fixtures, not measured results.
