#!/usr/bin/env bash
# Starts 7 idle n8n instances with the HIVE memory caps, reports real memory use, then removes them.
# Usage:  N8N_VERSION=2.x.y LIMIT=560m bash scripts/memtest.sh
set -euo pipefail
V="${N8N_VERSION:-latest}"
LIMIT="${LIMIT:-560m}"
HEAP="${HEAP:-320}"
cleanup() { docker rm -f $(docker ps -aq --filter name=hive-memtest) >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker info >/dev/null 2>&1 || { echo "Docker engine is not running. Open Docker Desktop and wait for 'Engine running'."; exit 1; }
echo "Docker has $(docker info --format '{{.MemTotal}}' | awk '{printf "%.1f", $1/1073741824}') GB. Image: n8nio/n8n:$V, limit $LIMIT per instance, heap cap ${HEAP} MB."
docker pull -q "n8nio/n8n:$V" >/dev/null

ready() { docker exec "$1" node -e "fetch('http://localhost:5678/healthz/readiness',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))" 2>/dev/null; }
# Staggered, like the real stack: 7 instances migrating at once overload an 8 GB laptop.
for i in 1 2 3 4 5 6 7; do
  t0=$(date +%s)
  docker run -d --name "hive-memtest-$i" --memory "$LIMIT" \
    -e N8N_DIAGNOSTICS_ENABLED=false -e EXECUTIONS_DATA_SAVE_ON_SUCCESS=none \
    -e N8N_CONCURRENCY_PRODUCTION_LIMIT=1 -e NODE_OPTIONS="--max-old-space-size=$HEAP" \
    "n8nio/n8n:$V" >/dev/null
  for _ in $(seq 1 100); do sleep 3; ready "hive-memtest-$i" && break; done
  if ready "hive-memtest-$i"; then echo "  instance $i ready in $(( $(date +%s)-t0 ))s"; else echo "  instance $i NOT ready after 300s"; fi
done
echo "All started. Settling 60 s..."
sleep 60

echo; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' $(docker ps -q --filter name=hive-memtest)
ok=0
for i in 1 2 3 4 5 6 7; do
  if ready "hive-memtest-$i"; then ok=$((ok+1)); fi
done
total=$(docker stats --no-stream --format '{{.MemUsage}}' $(docker ps -q --filter name=hive-memtest) | awk '{v=$1; if (v ~ /GiB/) {sub(/GiB/,"",v); v*=1024} else {sub(/MiB/,"",v)}; s+=v} END {printf "%.0f", s}')
echo; echo "Healthy: $ok/7   Total n8n memory: ${total} MiB"
echo "macOS swap now: $(sysctl -n vm.swapusage)"
if [ "$ok" -eq 7 ] && [ "$total" -lt 3000 ]; then
  echo "PASS: 7 n8n fit with room for stores, sim, proxy and dashboard (~400 MiB)."
else
  echo "TIGHT/FAIL: see implementation.md §1.2 'If the memory test fails'."
fi
