import { CITY_WOODS_STREAM, UNITS_PER_METRE } from '../constants';
import { insideOrNear } from './aprons';
import { CASTLE_AREAS } from './castle';
import { distanceToSegment } from './grid';
import { PLAN_DISTRICTS, inArea, planDistrictAt } from './plan';
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
/** From the centre of a road a race runs on: half a path's width and the tarmac's verge. */
const RACED_CLEAR = 5 + ROAD_CLEAR;
const CASTLE_CLEAR = 12;
const PROP_CLEAR = 14;
/**
 * How far the woods run on past the park's edge (#460), over ground no other
 * district has claimed, thinning to nothing: the owner's call, because the
 * west slope path runs along the park's south-west edge and had woods on one
 * side and bare grass on the other.
 */
const WOODS_SPILL = 140;

export function woodsFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  clear: readonly AuthoredProp[],
  raced: readonly Vec2[][] = [],
): AuthoredProp[] {
  const park = PLAN_DISTRICTS.find((a) => a.name === 'Highmoor Park');
  if (!park) return [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of park.poly) {
    minX = Math.min(minX, p.x / M - WOODS_SPILL); maxX = Math.max(maxX, p.x / M + WOODS_SPILL);
    minZ = Math.min(minZ, p.z / M - WOODS_SPILL); maxZ = Math.max(maxZ, p.z / M + WOODS_SPILL);
  }
  // How much of the wood a point outside the park may carry: none on another
  // district's ground, and thinning to none across the spill on unclaimed land.
  const spill = (at: Vec2): number => {
    if (inArea(park.poly, at)) return 1;
    if (planDistrictAt(at) !== null) return 0;
    let d = Infinity;
    for (let i = 0, j = park.poly.length - 1; i < park.poly.length; j = i++) {
      const a = park.poly[j], b = park.poly[i];
      d = Math.min(d, distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M);
    }
    return Math.max(0, 1 - d / WOODS_SPILL);
  };
  // Only the roads near the park, as segments in metres, so each tree asks a
  // few dozen rather than the whole map.
  const near = roads
    .map((r) => ({ a: nodes[r.a].pos, b: nodes[r.b].pos, half: r.width / 2 / M + (r.surface === 'asphalt' ? ROAD_CLEAR : PATH_CLEAR) }))
    .filter(({ a, b }) => Math.max(a.x, b.x) / M > minX - 50 && Math.min(a.x, b.x) / M < maxX + 50 && Math.max(a.z, b.z) / M > minZ - 50 && Math.min(a.z, b.z) / M < maxZ + 50);
  // A road a race runs on gets the tarmac's verge whatever it is made of:
  // with the woods on both sides of the west slope path, the reference driver
  // put the Descent into the trees five times, landing the jump among them.
  const racing = raced.flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })))
    .filter(({ a, b }) => Math.max(a.x, b.x) / M > minX && Math.min(a.x, b.x) / M < maxX && Math.max(a.z, b.z) / M > minZ && Math.min(a.z, b.z) / M < maxZ);
  const castle = [CASTLE_AREAS.bailey, CASTLE_AREAS.court, CASTLE_AREAS.ward];
  const glade = valueNoise(CITY_WOODS_STREAM, 90);

  const trees: AuthoredProp[] = [];
  // A fixed lattice with its own numbers in every cell, drawn from the cell's
  // own position: widening the area, or dropping a tree, moves no other tree.
  for (let i = Math.floor(minX / WOODS_CELL); i * WOODS_CELL < maxX; i++) {
    for (let j = Math.floor(minZ / WOODS_CELL); j * WOODS_CELL < maxZ; j++) {
      const x = (i + 0.1 + 0.8 * cellRandom(i, j, 1)) * WOODS_CELL;
      const z = (j + 0.1 + 0.8 * cellRandom(i, j, 2)) * WOODS_CELL;
      const roll = cellRandom(i, j, 3);
      const angle = Math.round(cellRandom(i, j, 4) * Math.PI * 2 * 1000) / 1000;
      const at = { x: x * M, z: z * M };
      const reach = spill(at);
      if (reach <= 0) continue;
      const h = groundAt(terrain, at.x, at.z) / M;
      if (h < 1) continue;
      const height = Math.max(0, Math.min(1, (MEADOW - h) / (MEADOW - WOODS_FULL)));
      const keep = 0.85 * height * reach * (0.35 + 0.9 * glade(x, z));
      if (roll >= keep) continue;
      if (near.some(({ a, b, half }) => distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < half)) continue;
      if (racing.some(({ a, b }) => distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < RACED_CLEAR)) continue;
      if (castle.some((area) => insideOrNear(area, at.x, at.z, CASTLE_CLEAR * M))) continue;
      if (insideOrNear(HIGHMOOR_CAR_PARK, at.x, at.z, 8 * M)) continue;
      if (clear.some((p) => Math.hypot(p.x - x, p.z - z) < PROP_CLEAR)) continue;
      if (hitsSetPiece(pieces, at.x, at.z, -Infinity, 3 * M, Infinity)) continue;
      trees.push({ kind: 'tree', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
    }
  }
  return trees;
}

/** A number in [0, 1) for one cell of the woods' lattice and one use of it, the same every time. */
export function cellRandom(i: number, j: number, k: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2246822519) + CITY_WOODS_STREAM) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** A smooth noise in [0, 1] over a lattice `cell` metres across, the same for a given seed. */
export function valueNoise(seed: number, cell: number): (x: number, z: number) => number {
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
