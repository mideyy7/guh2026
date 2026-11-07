// Seeded scenario: survivors, starting positions and the distress-text schedule.
// Same seed + same params → identical scenario, every time.
import { makeRng } from './rng.mjs';
import { DISTRICTS, HQ_CELL, districtCells } from './gazetteer.mjs';

const TEAM_STARTS = { 'team-1': '1-2', 'team-2': '5-1', 'team-3': '5-6' };

// Distress templates. {n} people, {d} district, {l} landmark. `kids`/`elderly`/`injury` mark urgency cues.
const TEMPLATES = [
  { t: 'stuck on roof w/ {n} kids near {d}, water rising', cue: 'kids' },
  { t: 'elderly neighbour trapped upstairs in {d} pls help', cue: 'elderly' },
  { t: '{n} of us on the bus shelter by {l}, water up to the seats', cue: null },
  { t: 'HELP {d} my dad cant walk, ground floor flooded', cue: 'injury' },
  { t: 'we r {n} ppl in an attic near {l}. phone dying', cue: null },
  { t: 'water coming in fast at {d}. baby with us', cue: 'kids' },
  { t: 'trapped in car near {l}, water at the windows', cue: 'injury' },
  { t: '{n} adults on 1st floor balcony {d}, ok for now', cue: null },
];

export function makeScenario(seed, params, actorIds) {
  const rng = makeRng(seed);
  const all = [...params.actors.drones, ...params.actors.teams];
  const actors = (actorIds ?? all).map((id) => ({
    id,
    role: params.actors.drones.includes(id) ? 'drone' : 'team',
    start: params.actors.drones.includes(id) ? HQ_CELL : TEAM_STARTS[id],
  }));

  // Flood-weighted district choice: western (Irwell-side) districts flood worst.
  const totalFlood = DISTRICTS.reduce((s, d) => s + d.flood, 0);
  const pickDistrict = () => {
    let r = rng.next() * totalFlood;
    for (const d of DISTRICTS) { r -= d.flood; if (r <= 0) return d; }
    return DISTRICTS[DISTRICTS.length - 1];
  };

  const survivors = [];
  const distress = [];
  for (let i = 0; i < params.survivors; i++) {
    const d = pickDistrict();
    const cell = rng.pick(districtCells(d));
    const people = rng.int(1, 5);
    const tpl = rng.pick(TEMPLATES);
    // Urgency: base 1-3, raised by cues and group size, capped at 5.
    let urgency = rng.int(1, 3) + (tpl.cue ? 2 : 0) + (people >= 4 ? 1 : 0);
    urgency = Math.min(5, urgency);
    // A third of survivors are there from the start, the rest appear over time.
    const appear_tick = i < Math.ceil(params.survivors / 3) ? 0 : rng.int(1, params.appear_by_tick);
    const id = `s${String(i + 1).padStart(2, '0')}`;
    survivors.push({ id, cell, people, urgency, appear_tick, district: d.name });

    // About 40% of survivors manage to send a text. It keeps "Sending…" until a drone is in range.
    if (rng.chance(0.4)) {
      const text = tpl.t.replace('{n}', String(people)).replace('{d}', d.name).replace('{l}', d.landmark.name);
      distress.push({
        msg_id: `m${String(distress.length + 1).padStart(2, '0')}`,
        survivor_id: id, cell, text, district: d.name, cue: tpl.cue,
        sent_tick: appear_tick + rng.int(0, 5),
      });
    }
  }
  distress.sort((a, b) => a.sent_tick - b.sent_tick || (a.msg_id < b.msg_id ? -1 : 1));
  return { seed: Number(seed), actors, survivors, distress };
}
