// Flood map of central Salford and Manchester on the 8×8 grid. The grid is laid over a real
// geographic box (GEO) so the live map shows each district where it really is: every district's
// real centre falls inside its own rectangle. 2 rows × 4 columns, each district 2 cells wide × 4
// tall (~500 m × 415 m per cell). The River Irwell winds through Lower Broughton, along Greengate
// and down past Ordsall and Castlefield, so those flood worst. y = 0 is north.
export const GEO = { west: -2.285, east: -2.225, north: 53.495, south: 53.465 };
export const DISTRICTS = [
  { name: 'Pendleton',        x: [0, 1], y: [0, 3], landmark: { name: 'Salford Shopping Centre', cell: '0-1' }, flood: 0.5 },
  { name: 'Lower Broughton',  x: [2, 3], y: [0, 3], landmark: { name: 'Lower Broughton Road',    cell: '3-0' }, flood: 1.0 },
  { name: 'Greengate',        x: [4, 5], y: [0, 3], landmark: { name: 'Greengate Square',        cell: '5-2' }, flood: 0.9 },
  { name: 'Northern Quarter', x: [6, 7], y: [0, 3], landmark: { name: 'Stevenson Square',        cell: '6-3' }, flood: 0.3 },
  { name: 'Ordsall',          x: [0, 1], y: [4, 7], landmark: { name: 'Ordsall Hall',            cell: '0-6' }, flood: 0.8 },
  { name: 'Castlefield',      x: [2, 3], y: [4, 7], landmark: { name: 'Castlefield Basin',       cell: '3-5' }, flood: 0.8 },
  { name: 'Deansgate',        x: [4, 5], y: [4, 7], landmark: { name: 'Deansgate Locks',         cell: '4-5' }, flood: 0.5 },
  { name: 'Piccadilly',       x: [6, 7], y: [4, 7], landmark: { name: 'Piccadilly station',      cell: '7-4' }, flood: 0.3 },
];
// Cell centre → [longitude, latitude] inside GEO.
export function cellToLngLat(cell, grid = 8) {
  const [x, y] = typeof cell === 'string' ? cell.split('-').map(Number) : [cell.x, cell.y];
  return [GEO.west + ((x + 0.5) / grid) * (GEO.east - GEO.west), GEO.north - ((y + 0.5) / grid) * (GEO.north - GEO.south)];
}
export const HQ_CELL = '3-3'; // emergency coordination point (Lower Broughton, by the Irwell), where drones launch

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
