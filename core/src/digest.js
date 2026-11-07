// Shared-state digest: FNV-1a 32-bit over canonical JSON (object keys sorted).
// Two actors with equal digests agree on events seen, cells searched, survivors rescued
// and task owners. The dashboard compares digests to show divergence and convergence.
// Plain JS, no imports.
const HiveDigest = (() => {
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  // parts = { vv, searched: [cell] sorted, rescued: [survivor_id] sorted, owners: {task: actor|null} }
  function digest(parts) { return fnv1a(canonical(parts)); }
  return { canonical, fnv1a, digest };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HiveDigest;
