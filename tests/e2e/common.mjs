// Shared glue for the live e2e scripts. lib.mjs is Dev A's (see README.md for what it must export).
import * as K from './checks.mjs';
export { K };

export async function loadLib() {
  try { return await import('./lib.mjs'); } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    console.error('tests/e2e/lib.mjs is missing (Dev A, Phase 2). See tests/e2e/README.md.');
    process.exit(2);
  }
}

const failures = [];
export function check(name, r) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name}${r.ok ? '' : `\n      ${r.problems.join('\n      ')}`}`);
  if (!r.ok) failures.push(name);
  return r.ok;
}
export const fact = (ok, problem) => ({ ok: !!ok, problems: ok ? [] : [problem] });
export function done(title) {
  console.log(failures.length ? `\n${title}: ${failures.length} check(s) FAILED` : `\n${title}: all checks passed`);
  process.exit(failures.length ? 1 : 0);
}
export function failuresSoFar() { return failures.length; }

// Pause, then poll until all 7 digests match. Fails after timeoutMs (gate: 10 gossip intervals = 40 s).
export async function waitConverged(l, { timeoutMs = 40_000 } = {}) {
  await l.pause();
  const t0 = Date.now();
  let views;
  while (Date.now() - t0 < timeoutMs) {
    views = await l.actors();
    if (K.agreement(views).digests.length === 1) return { ok: true, ms: Date.now() - t0, views };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, ms: Date.now() - t0, views };
}

// Cut (or restore) every link between one actor and the rest.
export async function cutActor(l, actor, up = false) {
  const links = await l.links();
  for (const o of Object.keys(links.allowed)) {
    if (o === actor) continue;
    if (links.allowed[actor]) links.allowed[actor][o] = up;
    if (links.allowed[o]) links.allowed[o][actor] = up;
  }
  await l.setLinks({ allowed: links.allowed });
}
