import { CITY_WOODS_STREAM, UNITS_PER_METRE } from '../constants';
import { insideOrNear } from './aprons';
import { CASTLE_AREAS } from './castle';
import { distanceToSegment } from './grid';
import { PLAN_DISTRICTS, inArea } from './plan';
import { Rng } from './rng';
import { hitsSetPiece } from './setpieces';
import { groundAt, type Terrain } from './terrain';
import type { AuthoredProp, CityNode, CityRoad, SetPiece, Vec2 } from './types';

const M = UNITS_PER_METRE;
const points = (list: [number, number][]): Vec2[] => list.map(([x, z]) => ({ x: x * M, z: z * M }));

/**
 * Highmoor Park's car park (#460): a gravel lot at the western foot of the
 * hill, where the Climb road starts up and the two paths leave, 56 m by 36 m
 * and turned to the way in off the road. An apron, so it drives like the
 * wharf's yard and draws as gravel.
 */
export const HIGHMOOR_CAR_PARK: Vec2[] = (() => {
  const c = { x: 690, z: -48 };
  const along = { x: 0.966, z: 0.259 };
  const across = { x: -along.z, z: along.x };
  const corner = (a: number, b: number): [number, number] => [c.x + along.x * a + across.x * b, c.z + along.z * a + across.z * b];
  return points([corner(-28, -18), corner(28, -18), corner(28, 18), corner(-28, 18)]);
})();

/**
 * The woods (#460): the owner's "a mix" - wooded on the lower slopes, open
 * meadow near the top so the castle stands clear on the skyline and the Climb
 * breaks out of the trees near the gate.
 *
 * Generated rather than placed, because a wood is a couple of thousand trees
 * and none of them is a decision. A tree stands on a jittered grid, kept or
 * not by two things: the height, which thins the wood from `WOODS_FULL` to
 * nothing at `MEADOW`, and a slow noise, which leaves glades in the wood and
 * copses on the meadow's edge so the line between them is not drawn with a
 * ruler. Every tree is clear of the roads, the castle, the car park and every
 * placed prop: a path through a wood is only a path if the trees leave it.
 *
 * Only a trunk is solid (`SET_PIECE_SOLIDS.tree`: the canopy starts above a
 * car), so the woods can be driven through between the trunks, slowly and at
 * some risk, and that is the point of woods on an escape route.
 */
const WOODS_CELL = 13;
const WOODS_FULL = 96;
const MEADOW = 108;
/**
 * How far a trunk stands off a road's edge. A path gets 4 m; the tarmac - the
 * Climb, a race road with hairpins in it - gets a cleared verge of 18, because
 * a driver who runs a hairpin wide goes further than a path's verge. Measured
 * with no trees at all, the reference driver left the Climb's edge by up to
 * 20 m, and by 10 to 20 m on a dozen of its corners; with a 4 m verge it found
 * a tree on the switchbacks and lost 7 s.
 */
const PATH_CLEAR = 4;
const ROAD_CLEAR = 18;
const CASTLE_CLEAR = 12;
const PROP_CLEAR = 14;

export function woodsFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  clear: readonly AuthoredProp[],
): AuthoredProp[] {
  const park = PLAN_DISTRICTS.find((a) => a.name === 'Highmoor Park');
  if (!park) return [];
  const rng = new Rng(CITY_WOODS_STREAM);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of park.poly) {
    minX = Math.min(minX, p.x / M); maxX = Math.max(maxX, p.x / M);
    minZ = Math.min(minZ, p.z / M); maxZ = Math.max(maxZ, p.z / M);
  }
  // Only the roads near the park, as segments in metres, so each tree asks a
  // few dozen rather than the whole map.
  const near = roads
    .map((r) => ({ a: nodes[r.a].pos, b: nodes[r.b].pos, half: r.width / 2 / M + (r.surface === 'asphalt' ? ROAD_CLEAR : PATH_CLEAR) }))
    .filter(({ a, b }) => Math.max(a.x, b.x) / M > minX - 50 && Math.min(a.x, b.x) / M < maxX + 50 && Math.max(a.z, b.z) / M > minZ - 50 && Math.min(a.z, b.z) / M < maxZ + 50);
  const castle = [CASTLE_AREAS.bailey, CASTLE_AREAS.court, CASTLE_AREAS.ward];
  const glade = valueNoise(CITY_WOODS_STREAM, 90);

  const trees: AuthoredProp[] = [];
  for (let gx = minX; gx < maxX; gx += WOODS_CELL) {
    for (let gz = minZ; gz < maxZ; gz += WOODS_CELL) {
      // Every cell draws the same three numbers whatever becomes of it, so
      // a tree kept or dropped never moves the trees after it.
      const x = gx + rng.range(0.1, 0.9) * WOODS_CELL;
      const z = gz + rng.range(0.1, 0.9) * WOODS_CELL;
      const roll = rng.float();
      const angle = Math.round(rng.range(0, Math.PI * 2) * 1000) / 1000;
      const at = { x: x * M, z: z * M };
      if (!inArea(park.poly, at)) continue;
      const h = groundAt(terrain, at.x, at.z) / M;
      const height = Math.max(0, Math.min(1, (MEADOW - h) / (MEADOW - WOODS_FULL)));
      const keep = 0.85 * height * (0.35 + 0.9 * glade(x, z));
      if (roll >= keep) continue;
      if (near.some(({ a, b, half }) => distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < half)) continue;
      if (castle.some((area) => insideOrNear(area, at.x, at.z, CASTLE_CLEAR * M))) continue;
      if (insideOrNear(HIGHMOOR_CAR_PARK, at.x, at.z, 8 * M)) continue;
      if (clear.some((p) => Math.hypot(p.x - x, p.z - z) < PROP_CLEAR)) continue;
      if (hitsSetPiece(pieces, at.x, at.z, -Infinity, 3 * M, Infinity)) continue;
      trees.push({ kind: 'tree', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
    }
  }
  return trees;
}

/** A smooth noise in [0, 1] over a lattice `cell` metres across, the same for a given seed. */
function valueNoise(seed: number, cell: number): (x: number, z: number) => number {
  const hash = (i: number, j: number) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (x, z) => {
    const fx = x / cell, fz = z / cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = ease(fx - i), v = ease(fz - j);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
