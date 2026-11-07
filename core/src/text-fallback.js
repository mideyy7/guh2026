// Regex fallback for distress texts, used when the AI call fails (bad key, 400, refusal,
// timeout). Finds the district through the gazetteer's names, landmarks and aliases, plus
// a rough people count, urgency and hazards. Plain JS, no imports.
const HiveText = (() => {
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };
  const N = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
  const num = (w) => (/^\d+$/.test(w) ? +w : NUM[w]);
  const norm = (t) => ` ${String(t).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9+/]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const RE = {
    kids: /\b(kids?|children|child|baby|babies|toddlers?|infants?|sons?|daughters?)\b/,
    elderly: /\b(elderly|old (man|woman|lady|couple|neighbou?r)|pensioners?|grand(ma|mother|pa|father|ad|dad)|nan|nana|frail|wheelchair|disabled|85|90)\b/,
    injury: /\b(injur\w*|hurt|bleeding|blood|broken|unconscious|cant walk|cannot walk|fell|fallen|wound\w*|diabetic|heart|insulin|breathing)\b/,
    rising: /\b(rising|getting higher|up to (my|our) (waist|chest|neck)|waist deep|chest deep|neck deep|coming in|filling)\b/,
    calm: /\b(safe for now|ok for now|not urgent|no rush|were fine|we are fine)\b/,
  };

  // Every alias of every district, longest first, so "piccadilly gardens" beats "piccadilly".
  function aliasList(gazetteer) {
    const out = [];
    for (const [name, d] of Object.entries(gazetteer)) {
      const all = new Set([name, d.landmark.name, ...(d.aliases || [])].map((a) => norm(a).trim()));
      for (const a of all) if (a) out.push({ alias: a, district: name });
    }
    return out.sort((x, y) => y.alias.length - x.alias.length);
  }

  function findDistrict(t, gazetteer) {
    let best = null;
    for (const { alias, district } of aliasList(gazetteer)) {
      const at = t.indexOf(` ${alias} `);
      if (at < 0) continue;
      // longest alias wins; equal length → the one mentioned first
      if (!best || alias.length > best.len || (alias.length === best.len && at < best.at)) best = { district, alias, at, len: alias.length };
    }
    return best;
  }

  function people(t) {
    let m;
    if ((m = t.match(new RegExp(`\\b(?:me|i|im|myself)\\b[^.]*?(?:with|w/|and|\\+)\\s*(?:my\\s+)?${N}\\s+(?:kids?|children|others?|people|ppl|adults?|neighbou?rs?|friends?)`)))) return num(m[1]) + 1;
    if ((m = t.match(new RegExp(`\\b(?:with|w/|\\+)\\s*(?:my\\s+)?${N}\\s+(?:kids?|children|little ones)`)))) return num(m[1]) + 1;
    if ((m = t.match(new RegExp(`\\bfamily of\\s+${N}`)))) return num(m[1]);
    if ((m = t.match(new RegExp(`\\b${N}\\s+(?:of us|people|ppl|persons|adults|kids|children|elderly|pensioners)\\b`)))) return num(m[1]);
    if ((m = t.match(/\b(?:me|i|im)\b[^.]*?\b(?:and|with|\+)\s+my\s+(?:wife|husband|partner|mum|mom|dad|son|daughter|nan|grandad|grandma|neighbou?r|friend|dog)\b/))) return 2;
    if (/\b(we|us|our)\b/.test(t)) return null;
    if (/\b(i|im|me|my)\b/.test(t)) return 1;
    return null;
  }

  function urgency(t) {
    let u = 3;
    if (RE.kids.test(t)) u += 1;
    if (RE.elderly.test(t)) u += 1;
    if (RE.injury.test(t)) u += 1;
    if (RE.rising.test(t)) u += 1;
    if (RE.calm.test(t)) u -= 1;
    return Math.max(1, Math.min(5, u));
  }

  function hazards(t) {
    const h = [];
    if (RE.rising.test(t) || /\bwater\b/.test(t)) h.push('rising water');
    if (RE.kids.test(t)) h.push('children');
    if (RE.elderly.test(t)) h.push('elderly or vulnerable');
    if (RE.injury.test(t)) h.push('injury');
    if (/\b(roof|upstairs|attic|loft)\b/.test(t)) h.push('trapped above flood');
    if (/\b(electric\w*|power lines?|sparks?|gas)\b/.test(t)) h.push('electrical or gas');
    return h;
  }

  // → {district, landmark, people, urgency, hazards}, or null if no district is recognised.
  function parse(text, gazetteer) {
    const t = norm(text);
    const d = findDistrict(t, gazetteer);
    if (!d) return null;
    const lm = gazetteer[d.district].landmark.name;
    return {
      district: d.district,
      landmark: norm(lm).trim() === d.alias ? lm : null,
      people: people(t),
      urgency: urgency(t),
      hazards: hazards(t),
    };
  }

  return { parse, norm };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HiveText;
