// Builds tests/ai/fixtures.json for Dev B's AI accuracy check (implementation.md Phase 4):
// 20 texts from the real scenario generator, labelled with ground truth, plus 5 hand-written messy ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeScenario } from '../world/scenario.mjs';
import { DISTRICTS } from '../world/gazetteer.mjs';

const params = JSON.parse(readFileSync(new URL('../contracts/params.json', import.meta.url), 'utf8'));
const picked = [], seenText = new Set(), perDistrict = {};
for (let seed = 1; picked.length < 20 && seed < 500; seed++) {
  const sc = makeScenario(seed, params);
  for (const m of sc.distress) {
    const s = sc.survivors.find((x) => x.id === m.survivor_id);
    // Spread across districts (at most 3 each) and avoid duplicate wording.
    if (seenText.has(m.text) || (perDistrict[m.district] || 0) >= 3) continue;
    seenText.add(m.text); perDistrict[m.district] = (perDistrict[m.district] || 0) + 1;
    picked.push({ id: `gen-${String(picked.length + 1).padStart(2, '0')}`, source: `scenario seed ${seed} ${m.msg_id}`, text: m.text,
      expected: { district: m.district, people: s.people, urgency: s.urgency, cue: m.cue } });
    if (picked.length === 20) break;
  }
}
const messy = [
  { text: 'pls help were stuck on the roof nr picadilly gardens 3 kids n my mum water still risin', expected: { district: 'Piccadilly', people: 4, urgency: 5, cue: 'kids' } },
  { text: 'SALFORD QUAYS by mediacity. car park flooded. 2 of us on top of the car', expected: { district: 'Salford Quays', people: 2, urgency: 3, cue: null } },
  { text: 'grandad (87) cant get downstairs, castlefield near the basin, power out', expected: { district: 'Castlefield', people: 1, urgency: 5, cue: 'elderly' } },
  { text: 'lower broughton - by the bridge - water in the house, we r upstairs, 5 ppl, 1 hurt leg', expected: { district: 'Lower Broughton', people: 5, urgency: 5, cue: 'injury' } },
  { text: 'ancoats near cutting room sq, think were ok for now but cant leave building x4', expected: { district: 'Ancoats', people: 4, urgency: 2, cue: null } },
].map((m, i) => ({ id: `messy-${i + 1}`, source: 'hand-written', ...m }));

const out = {
  about: 'Labelled distress texts for the Interpret workflow accuracy check. Pass: correct district for at least 18 of the 20 generated texts (implementation.md Phase 4). Urgency labels are the simulator ground truth; text cues hint at them but do not determine them exactly, so score urgency as within ±1.',
  districts: DISTRICTS.map((d) => ({ name: d.name, landmark: d.landmark.name })),
  generated: picked, messy,
};
writeFileSync(new URL('../tests/ai/fixtures.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`tests/ai/fixtures.json: ${picked.length} generated across ${Object.keys(perDistrict).length} districts + ${messy.length} messy`);
