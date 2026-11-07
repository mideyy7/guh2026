// Grid helpers shared by world, links and the dashboard. Cells are "x-y"; distance is Chebyshev.
export const cellId = ({ x, y }) => `${x}-${y}`;
export const parseCell = (id) => { const [x, y] = id.split('-').map(Number); return { x, y }; };
export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const samePos = (a, b) => a.x === b.x && a.y === b.y;
export function stepToward(from, to) {
  return { x: from.x + Math.sign(to.x - from.x), y: from.y + Math.sign(to.y - from.y) };
}
export function cellsWithin(center, radius, grid) {
  const out = [];
  for (let y = Math.max(0, center.y - radius); y <= Math.min(grid - 1, center.y + radius); y++)
    for (let x = Math.max(0, center.x - radius); x <= Math.min(grid - 1, center.x + radius); x++) out.push(`${x}-${y}`);
  return out;
}
