// Stylised flood map of central Manchester and Salford on the 8×8 grid (not to scale).
// 8 districts in 2 rows × 4 columns, each 2 cells wide × 4 tall. The River Irwell runs down the
// west side, so the western districts flood worst. y = 0 is north.
export const DISTRICTS = [
  { name: 'Lower Broughton',  x: [0, 1], y: [0, 3], landmark: { name: 'Broughton Bridge',   cell: '1-1' }, flood: 1.0 },
  { name: 'Northern Quarter', x: [2, 3], y: [0, 3], landmark: { name: 'Stevenson Square',   cell: '3-2' }, flood: 0.4 },
  { name: 'Piccadilly',       x: [4, 5], y: [0, 3], landmark: { name: 'Piccadilly Gardens', cell: '4-2' }, flood: 0.5 },
  { name: 'Ancoats',          x: [6, 7], y: [0, 3], landmark: { name: 'Cutting Room Square', cell: '6-1' }, flood: 0.6 },
  { name: 'Salford Quays',    x: [0, 1], y: [4, 7], landmark: { name: 'MediaCityUK',        cell: '0-6' }, flood: 0.9 },
  { name: 'Castlefield',      x: [2, 3], y: [4, 7], landmark: { name: 'Castlefield Basin',  cell: '2-5' }, flood: 0.8 },
  { name: 'Deansgate',        x: [4, 5], y: [4, 7], landmark: { name: 'Deansgate Locks',    cell: '4-5' }, flood: 0.5 },
  { name: 'Hulme',            x: [6, 7], y: [4, 7], landmark: { name: 'Hulme Arch Bridge',  cell: '6-6' }, flood: 0.3 },
];
export const HQ_CELL = '3-3'; // emergency coordination point, where drones launch

export function districtOf(cell) {
  const [x, y] = cell.split('-').map(Number);
  return DISTRICTS.find((d) => x >= d.x[0] && x <= d.x[1] && y >= d.y[0] && y <= d.y[1]) ?? null;
}
export function districtCells(d) {
  const out = [];
  for (let y = d.y[0]; y <= d.y[1]; y++) for (let x = d.x[0]; x <= d.x[1]; x++) out.push(`${x}-${y}`);
  return out;
}
export const districtByName = (name) => DISTRICTS.find((d) => d.name.toLowerCase() === String(name).toLowerCase()) ?? null;
