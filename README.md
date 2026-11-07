# HIVE

A self-healing emergency-response swarm for the Neptune North challenge (GreatUniHack 2026). Seven independent n8n actors (4 drones, 3 rescue teams) coordinate rescues with no central dispatcher, keep working when the network splits into islands, and reconcile when links return.

- **What and why:** [hack.md](hack.md)
- **How it's built, phase by phase:** [implementation.md](implementation.md)
- **Interfaces between the two halves:** [contracts/README.md](contracts/README.md)

## Quickstart

Needs Docker Desktop (5 GB memory), Node 24 and a `.env` file (copy `.env.example`; see implementation.md §1).

```bash
npm test                              # all unit tests, no Docker needed
node scripts/gen-compose.mjs          # writes docker-compose.yml (all 7 actors)
docker compose up -d                  # first boot takes ~6 minutes: n8n instances start one at a time
bash scripts/check-isolation.sh       # proves actors can only talk through the proxy
open http://localhost:8000            # the dashboard
node tests/e2e/smoke-infra.mjs        # end-to-end infrastructure check
node tests/e2e/demo.mjs --dry         # the 90-second demo timeline
```

Smaller dev stack (about 2 GB): `node scripts/gen-compose.mjs --actors drone-1,drone-2,team-1,team-2`.

Benchmark (no Docker): `node bench/run.mjs --mode hive --topology blackout-3 --seed 1` for one run, or `node bench/matrix.mjs` for the full 270-run matrix → `bench/results/report.html`.

## Layout

| Path | What | Owner |
|---|---|---|
| `world/` | Pure, seeded world model: scenario, physics, link presets, central dispatcher | Dev A |
| `services/` | `store` (per-actor state), `sim`, `proxy` (chaos), `hq`, `dashboard` | Dev A |
| `core/` | Pure decision logic pasted into n8n Code nodes: events, CBBA, actor behaviour | Dev B |
| `n8n/` | Workflow sources and build output | Dev B |
| `bench/` | Headless benchmark (same world + same core, simulated time) | Dev A |
| `tests/e2e/` | Live end-to-end scripts that drive the stack through the dashboard API | Both |
| `scripts/` | Compose generator, isolation check, memory test, fixtures | Dev A |
| `mockup/` | Interactive UI mockup | — |
