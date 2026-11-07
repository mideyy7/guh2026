#!/usr/bin/env bash
# S5 / acceptance check: proves actors can only talk to each other through shared services.
# For every running actor A, from INSIDE n8n-A:
#   must FAIL : http://n8n-B:5678/healthz and http://store-B:4000/health   for every other actor B
#   must FAIL : http://hq:3100/health  (actors reach HQ only through the proxy's /rpc)
#   must WORK : http://store:4000/health and it must report actor_id == A  (alias resolves to OWN store)
#   must WORK : every shared service that is running (proxy, sim, probe)
# And from each shared service on the actor networks: every n8n-X must be reachable.
# Exit 0 only if every check passes.
set -uo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"

running=$(docker compose ps --status running --services 2>/dev/null)
actors=$(echo "$running" | sed -n 's/^n8n-//p' | sort)
[ -n "$actors" ] || { echo "No n8n-* containers running. Start the stack first."; exit 2; }
shared=""
echo "$running" | grep -qx proxy && shared="$shared proxy:8080/links"
echo "$running" | grep -qx sim   && shared="$shared sim:3000/health"
echo "$running" | grep -qx probe && shared="$shared probe:9000/"

fail=0; checks=0
for a in $actors; do
  others=$(echo "$actors" | grep -vx "$a" | tr '\n' ' ')
  out=$(docker compose exec -T "n8n-$a" node -e '
    const [self, others, shared] = [process.argv[1], process.argv[2].trim().split(/\s+/).filter(Boolean), process.argv[3].trim().split(/\s+/).filter(Boolean)];
    const get = (u) => fetch(u, { signal: AbortSignal.timeout(5000) }).then(async r => ({ ok: r.ok, body: await r.text() }), e => ({ ok: false, err: e.cause?.code || e.name }));
    (async () => {
      const lines = [];
      for (const b of others) for (const u of [`http://n8n-${b}:5678/healthz`, `http://store-${b}:4000/health`]) {
        const r = await get(u); lines.push((r.ok ? "FAIL reachable " : "ok   blocked   ") + u + (r.err ? " (" + r.err + ")" : ""));
      }
      { const u = "http://hq:3100/health"; const r = await get(u); lines.push((r.ok ? "FAIL reachable " : "ok   blocked   ") + u + (r.err ? " (" + r.err + ")" : "")); }
      const own = await get("http://store:4000/health");
      let id = null; try { id = JSON.parse(own.body).actor_id } catch {}
      lines.push((own.ok && id === self ? "ok   own store " : "FAIL own store ") + "http://store:4000 -> " + id);
      for (const s of shared) { const r = await get("http://" + s); lines.push((r.ok ? "ok   shared    " : "FAIL shared    ") + s + (r.err ? " (" + r.err + ")" : "")); }
      console.log(lines.join("\n"));
    })();' "$a" "$others" "$shared" 2>&1)
  n=$(echo "$out" | grep -c -E '^(ok|FAIL)')
  f=$(echo "$out" | grep -c '^FAIL')
  checks=$((checks + n)); fail=$((fail + f))
  if [ "$f" -gt 0 ] || [ "$n" -eq 0 ]; then echo "[$a] $f failures:"; echo "$out" | grep -v '^ok' | sed 's/^/   /'; [ "$n" -eq 0 ] && fail=$((fail + 1)); else echo "[$a] $n/$n checks ok"; fi
done

# Shared services must reach every actor's n8n (they sit on all actor networks).
for svc in probe proxy sim dashboard; do
  echo "$running" | grep -qx "$svc" || continue
  svc_fail=0
  for a in $actors; do
    checks=$((checks + 1))
    if docker compose exec -T "$svc" node -e "fetch('http://n8n-$a:5678/healthz',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1; then :; else
      echo "[$svc] FAIL cannot reach n8n-$a"; fail=$((fail + 1)); svc_fail=$((svc_fail + 1)); fi
  done
  [ "$svc_fail" -eq 0 ] && echo "[$svc] reaches all $(echo "$actors" | wc -w | tr -d ' ') actors"
done

echo "----"
if [ "$fail" -eq 0 ]; then echo "ISOLATION PASS: $checks checks, 0 failures"; exit 0; fi
echo "ISOLATION FAIL: $fail of $checks checks failed"; exit 1
