# HIVE dashboard mockup

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
- **Swarm network:** click or keyboard-activate individual links to cut or restore them, including isolating one actor entirely.
- **Actor beliefs:** inject an incident and compare local knowledge; it propagates one peer hop per simulation tick.
- **Benchmarks:** three illustrative comparison curves, explicitly labelled as fixture data rather than measured outcomes.
- **Pause / reset:** pause the logical simulation or restore the original scenario.
- **Street map:** optional Leaflet map with CARTO tiles and OpenStreetMap attribution. Requires internet. The bundled schematic works offline. External fonts also require internet, with system-font fallback.

## Scope and accuracy

This is a browser-only UI simulation, not a production distributed system. Decisions, bidding scores and benchmark data are demo fixtures; no n8n, LLM, durable event store, CBBA implementation or real disaster data is connected. Synthetic actor coordinates and the flood polygon are illustrative. Communication visualisations represent the browser's simulated peer deliveries, not real network requests. State resets on page reload.

The belief table models propagation of task identity and the fixture owner, not full replicated event-log or CBBA convergence. Real adapters should supply actor-local `/state` observations, simulator physics, chaos-proxy delivery records and measured benchmark results. The dashboard must remain an observer rather than become an assignment coordinator.

Files: `index.html` (structure), `styles.css` (responsive design), `app.js` (demo state and interactions).
