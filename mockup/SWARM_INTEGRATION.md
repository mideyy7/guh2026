# Swarm workspace: backend handoff

The **Swarm** tab contains two views:

- **Agent coordination:** actor-local state, selectable peer topology, newly delivered task observations, outage controls and a structured event feed.
- **Agent workflows:** six independently triggered workflow plans, node inspection, the selected actor's observed workflow activity and its latest recorded fields.

## Current data source

`swarm-data.js` owns a bounded in-memory telemetry store. `app.js` emits records when the browser simulation discovers a task, shares it with a peer, receives it, applies fixture allocation, moves an actor, rescues survivors or changes link availability. Starting-scenario records have `source: "fixture"`; new browser observations have `source: "browser-demo"`.

These records are not n8n executions. There are no fabricated n8n execution IDs, node durations or live workflow success counts. The workflow diagrams in `swarm.js` are planned shapes, not imported n8n workflow JSON. Interpret has no activity until the demo actually gains a distress-message input path.

The event feed excludes repetitive movement/search ticks but the inspector can show them as recent actor-local observations. Replay filters telemetry to the displayed logical tick. Scenario-changing controls are disabled during replay.

## Links to actor instances

Once real instance/editor URLs are available, configure them per actor:

```js
HiveSwarmTelemetry.setActorLinks('D1', {
  editorUrl: 'https://your-drone-instance.example/',
  workflows: {
    Perceive: 'https://your-drone-instance.example/path-copied-from-editor',
  },
});
HiveSwarm.update(HiveStudio.capture());
```

Use actual URLs copied from the deployed n8n editor. No assumed workflow IDs or instance ports are hardcoded. Only HTTP(S) URLs are accepted. A workflow-specific URL takes precedence over the instance URL. **Open in n8n** stays disabled until a valid URL is configured; adding a link does not connect execution telemetry.

## Normalised records for a future adapter

A server-side observer adapter can translate n8n execution metadata and actor events into this shape:

```js
{
  actorId: 'D1',
  workflow: 'Gossip', // Perceive | Interpret | Bid | Gossip | Merge | Act
  tick: 281,         // Mission's logical clock, correlated by the adapter
  source: 'browser-demo', // Current source; replace deliberately for live integration
  type: 'delivery',
  status: 'observed',
  trigger: 'Demo peer sync',
  peerId: 'T1',
  taskId: 'RSC-016',
  summary: 'Shared RSC-016 with Rescue 01.',
  details: { delivered: true },
}
```

`HiveSwarmTelemetry.emit(record)` is the current frontend ingestion boundary. It accepts the four MVP actor IDs and six workflow names, requires a numeric logical tick, detaches the JSON data from mutable simulation objects and retains the latest 1,600 records. `HiveSwarmTelemetry.at(tick)` filters them for replay. This is a UI adapter contract, not an HTTP endpoint or a production event store.

For live integration, replace the browser state source, map real execution identifiers and statuses, correlate real node activity, and update the source/runtime labels. Preserve event identity and ordering across reconnects. Keep n8n authentication and raw credential-bearing payloads server-side; send only the fields needed by the observer. No browser telemetry callback should allocate tasks, relay peer messages or issue actor commands.

## Files

- `swarm-data.js`: telemetry buffer and validated actor/editor links.
- `swarm.js`: workspace, planned workflow definitions, inspector and feed.
- `swarm.css`: responsive layout using the existing Tempo theme tokens.
- `app.js`: small instrumentation hooks around existing browser simulation actions.

The backend services in the repository are not modified or started by this mockup.
