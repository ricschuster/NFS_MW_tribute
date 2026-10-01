import { UNITS_PER_METRE } from '../constants';
import { PLAN_DISTRICTS, inArea } from './plan';
import { AUTHORED_ROADS } from './roads';
import { distanceToSegment } from './grid';
import type { Apron, CityNode, CityRoad, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * A midtown's high street (#488): the drawn roads, by id, that are its main
 * street, keyed by the midtown's place in the plan's list. The house drafter
 * puts shops and flats on them instead of houses (`suburbHousesFor`), and the
 * ground between their kerbs and the shopfronts is paved.
 *
 * The owner's choice, which is why it is a list of drawn roads rather than
 * something worked out: which boulevard becomes a high street is the whole
 * character of the area.
 */
export const HIGH_STREETS: Record<number, readonly string[]> = { 0: ['n100'] };

/** From the kerb to the shopfront: what the drafter stands shops behind. */
export const PAVEMENT = 4;

/**
 * Each high street's line, the stretches of it inside its own midtown: a drawn
 * road can run on well past the area, and only the part in it is a high street.
 */
export function highStreetLines(index: number): Vec2[][] {
  const area = PLAN_DISTRICTS.filter((a) => a.kind === 'midtown')[index];
  if (!area) return [];
  const lines: Vec2[][] = [];
  for (const id of HIGH_STREETS[index] ?? []) {
    const road = AUTHORED_ROADS.find((r) => r.id === id);
    if (!road) throw new Error(`high street ${id} is not a drawn road`);
    let run: Vec2[] = [];
    for (const p of road.points) {
      if (inArea(area.poly, p)) run.push(p);
      else {
        if (run.length >= 2) lines.push(run);
        run = [];
      }
    }
    if (run.length >= 2) lines.push(run);
  }
  return lines;
}

/**
 * The pavements of every high street, as paved ground: one outline round each
 * stretch, kerb to shopfront on both sides. The road is drawn over the middle
 * of it, so one outline is both pavements and costs one apron.
 */
export function highStreetAprons(roads: readonly CityRoad[], nodes: readonly CityNode[]): Apron[] {
  return Object.keys(HIGH_STREETS)
    .flatMap((index) => highStreetLines(Number(index)))
    .map((line) => {
      // As wide as the road it is, measured at its middle.
      const mid = line[Math.floor(line.length / 2)];
      let width = 0;
      let best = Infinity;
      for (const r of roads) {
        const a = nodes[r.a].pos;
        const b = nodes[r.b].pos;
        const d = distanceToSegment(mid.x, mid.z, a.x, a.z, b.x, b.z);
        if (d < best) [best, width] = [d, r.width];
      }
      return { outline: band(line, width / 2 + PAVEMENT * M), margin: 1.5 * M, look: 'concrete' as const, yard: false };
    });
}

/** A line widened by `half` on each side, as a closed outline. */
function band(line: Vec2[], half: number): Vec2[] {
  const normals = line.map((_, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
  });
  const left = line.map((p, i) => ({ x: p.x + normals[i].x * half, z: p.z + normals[i].z * half }));
  const right = line.map((p, i) => ({ x: p.x - normals[i].x * half, z: p.z - normals[i].z * half }));
  return [...left, ...right.reverse()];
}
