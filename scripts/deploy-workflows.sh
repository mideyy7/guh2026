#!/usr/bin/env bash
# Build the workflows and deploy them to every running n8n actor (implementation.md §12.4).
# UNVERIFIED until spike S2 runs on Docker: if S2 needs its fallback (CLI against a stopped
# container, or an owner account first), update this script to match and note it in
# contracts/README.md.
#   ACTORS="drone-1 drone-2 team-1 team-2" bash scripts/deploy-workflows.sh   # dev stack
set -euo pipefail
cd "$(dirname "$0")/.."

ACTORS="${ACTORS:-drone-1 drone-2 drone-3 drone-4 team-1 team-2 team-3}"
node core/build.mjs
node scripts/build-workflows.mjs
# Workflow IDs without jq.
IDS=$(node -e "const fs=require('fs');for(const f of fs.readdirSync('n8n/build'))if(f.endsWith('.json'))console.log(JSON.parse(fs.readFileSync('n8n/build/'+f,'utf8')).id)")

port_of() {   # drone-1..4 → 5671..5674, team-1..3 → 5675..5677
  case "$1" in drone-*) echo $((5670 + ${1#drone-}));; team-*) echo $((5674 + ${1#team-}));; esac
}

for a in $ACTORS; do
  svc="n8n-$a"
  echo "== $svc"
  if [ -f n8n/credentials/anthropic.json ]; then
    docker compose exec -T "$svc" n8n import:credentials --input=/hive/credentials/anthropic.json
  else
    echo "   (no n8n/credentials/anthropic.json yet: skipping credential import, see spike S6)"
  fi
  docker compose exec -T "$svc" n8n import:workflow --separate --input=/hive/build/
  for id in $IDS; do
    docker compose exec -T "$svc" n8n unpublish:workflow --id="$id" >/dev/null 2>&1 || true
    docker compose exec -T "$svc" n8n publish:workflow --id="$id"
  done
done

docker compose restart $(for a in $ACTORS; do printf 'n8n-%s ' "$a"; done)
echo "Waiting for health..."
for a in $ACTORS; do
  p=$(port_of "$a")
  for i in $(seq 1 30); do
    if curl -fsS "localhost:$p/healthz" >/dev/null 2>&1; then echo "  $a :$p ok"; break; fi
    sleep 2
    [ "$i" = 30 ] && { echo "  $a :$p NOT healthy"; exit 1; }
  done
done
