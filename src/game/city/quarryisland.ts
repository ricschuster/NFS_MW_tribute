import { CITY_WOODS_STREAM, UNITS_PER_METRE } from '../constants';
import { distanceToSegment } from './grid';
import { cellRandom, valueNoise } from './highmoor';
import { PLAN_PLACES, inArea, planDistrictAt } from './plan';
import { hitsSetPiece } from './setpieces';
import { groundAt, type Terrain } from './terrain';
import type { AuthoredProp, CityNode, CityRoad, SetPiece, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * The quarry island's wild country (2026-10-02): the island east of the strait
 * is Halloway Quarry in its north half and two kilometres of hills in its
 * south, and the owner's call for the rest of it was "wild hill country" -
 * conifer woods, scrub, rock on the tops, open grass, and a couple of dirt
 * tracks through it (`qi…` in the drawn roads, `npm run islanddraft`).
 *
 * Generated rather than placed, as Highmoor Park's woods are (`woodsFor`), and
 * on the same fixed lattice drawn from each cell's own position, so nothing
 * moves when the area grows or a tree is dropped. Three things on it:
 *
 * - **Woods**, where a slow noise peaks: patches a few hundred metres across
 *   with grass between them, thickest on the slopes and thinning out over the
 *   tops and down to the shore, the way a hill wood is left where the ground
 *   is no good for anything else.
 * - **Scrub**: a lone tree here and there over the open ground, so the grass
 *   between the woods is not a lawn.
 * - **Rock**: outcrops of bedrock (`outcrop`) over the upper slopes and the
 *   tops, the bare ground a wood stops short of.
 *
 * The quarry dresses its own ground (`npm run quarrydraft` reaches its rim and
 * the hillside below it), so this starts where that stops and blends in over
 * `BLEND`. Every piece is clear of the roads, the race lines, the placed
 * props and the set pieces; only a trunk and an outcrop's two slabs are solid, so the woods
 * can be driven through between the trunks, at some risk, as Highmoor's can.
 */

const CELL = 13;
/** Past the quarry's own dressing, which runs out to its radius and 260 m beyond, blending in over this. */
const QUARRY_DRESSED = 260, BLEND = 160;
/** Off a road's edge: a dirt track gets a verge a rally car can run wide on; the coast road its tarmac's. */
const TRACK_CLEAR = 9, ROAD_CLEAR = 18;
/**
 * From the middle of a race line. The Halloway Coast Rally runs the island's
 * tracks, and a wood kept 23 m back, as Highmoor's is, left it running between
 * lawns; at 12 no driver tier touched a trunk more than at 23.
 */
const RACED_CLEAR = 12;
const PROP_CLEAR = 10;
/**
 * What makes one stretch of country differ from another: where it is, how
 * much of it each point may carry, and the heights its woods and rock keep to.
 */
export interface CountrySpec {
  /** The ground it covers, in world units. */
  area: Vec2[];
  /** How much of the country a point may carry, 0 to 1, given its metres and ground height. */
  reach: (x: number, z: number, h: number) => number;
  /** A wood thins from `tops` to nothing at `topsBare`, and to the beach below `shoreLow`. */
  tops: number;
  topsBare: number;
  shoreLow: number;
  /** An outcrop stands this high up, or higher. */
  rockHigh: number;
  /** How thick a wood gets where its noise peaks, and how often a lone tree stands in the open. */
  woodShare: number;
  scrub: number;
  /** Keeps two stretches of country from being the same pattern. */
  salt: number;
}

export function quarryIslandWildsFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  clear: readonly AuthoredProp[],
  wet: (x: number, z: number) => boolean,
  raced: readonly Vec2[][] = [],
): AuthoredProp[] {
  // The island is the ground the quarry owns, as the owner traced it in the
  // District Plan: the wharf across the strait and Ashford Point across the
  // channel are other places' ground.
  const quarry = PLAN_PLACES.find((p) => p.kind === 'quarry');
  if (!quarry || !quarry.area) return [];
  const qx = quarry.at.x / M, qz = quarry.at.z / M;
  const dressed = quarry.radius / M + QUARRY_DRESSED;
  return countrysideFor(terrain, roads, nodes, pieces, clear, wet, raced, {
    area: quarry.area,
    // The quarry's own ground, blending out of it.
    reach: (x, z) => Math.max(0, Math.min(1, (Math.hypot(x - qx, z - qz) - dressed) / BLEND)),
    tops: 30,
    topsBare: 42,
    shoreLow: 4,
    rockHigh: 22,
    woodShare: 0.8,
    scrub: 0.035,
    salt: 0,
  });
}

/**
 * Country over a place's open ground: woods, scrub and rock, generated on a
 * fixed lattice. The quarry island's hills were the first (above), and Marrow
 * Field's rise the second.
 */
export function countrysideFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  clear: readonly AuthoredProp[],
  wet: (x: number, z: number) => boolean,
  raced: readonly Vec2[][],
  spec: CountrySpec,
): AuthoredProp[] {
  const island = spec.area;
  const BOX = {
    minX: Math.min(...island.map((p) => p.x)) / M, maxX: Math.max(...island.map((p) => p.x)) / M,
    minZ: Math.min(...island.map((p) => p.z)) / M, maxZ: Math.max(...island.map((p) => p.z)) / M,
  };
  const inBox = (x: number, z: number) => x > BOX.minX && x < BOX.maxX && z > BOX.minZ && z < BOX.maxZ;
  const onIsland = (x: number, z: number) => inArea(island, { x: x * M, z: z * M });
  const segs = roads
    .filter((r) => r.class !== 'interstate' && r.class !== 'ramp' && nodes[r.a].level === 'surface' && nodes[r.b].level === 'surface')
    .map((r) => ({ a: nodes[r.a].pos, b: nodes[r.b].pos, half: r.width / 2 / M + (r.surface === 'asphalt' || !r.surface ? ROAD_CLEAR : TRACK_CLEAR) }))
    .filter(({ a, b }) => inBox(a.x / M, a.z / M) || inBox(b.x / M, b.z / M));
  const racing = raced
    .flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })))
    .filter(({ a, b }) => inBox(a.x / M, a.z / M) || inBox(b.x / M, b.z / M));
  const props = clear.filter((p) => inBox(p.x, p.z));
  const woods = valueNoise((CITY_WOODS_STREAM ^ 0x48616c6c) + spec.salt, 170);
  const rocks = valueNoise((CITY_WOODS_STREAM ^ 0x526f636b) + spec.salt, 60);

  // Everything clearOf asks about, bucketed in 100 m cells, so a tree asks
  // the few roads and props round it rather than the island's every one.
  // The furthest anything can matter is a road's half-width plus its verge
  // and the extra an outcrop asks for, which stays well inside one cell.
  const BUCKET = 100;
  const key = (i: number, j: number) => i * 100003 + j;
  const segBuckets = new Map<number, number[]>();
  const raceBuckets = new Map<number, number[]>();
  const propBuckets = new Map<number, number[]>();
  const file = (into: Map<number, number[]>, id: number, ax: number, az: number, bx: number, bz: number) => {
    for (let i = Math.floor(Math.min(ax, bx) / BUCKET) - 1; i <= Math.floor(Math.max(ax, bx) / BUCKET) + 1; i++)
      for (let j = Math.floor(Math.min(az, bz) / BUCKET) - 1; j <= Math.floor(Math.max(az, bz) / BUCKET) + 1; j++) {
        const k = key(i, j);
        const list = into.get(k);
        if (list) list.push(id);
        else into.set(k, [id]);
      }
  };
  segs.forEach((sg, id) => file(segBuckets, id, sg.a.x / M, sg.a.z / M, sg.b.x / M, sg.b.z / M));
  racing.forEach((sg, id) => file(raceBuckets, id, sg.a.x / M, sg.a.z / M, sg.b.x / M, sg.b.z / M));
  props.forEach((pr, id) => file(propBuckets, id, pr.x, pr.z, pr.x, pr.z));
  const around = (into: Map<number, number[]>, x: number, z: number) => into.get(key(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) ?? [];

  const clearOf = (x: number, z: number, verge: number): boolean => {
    const at = { x: x * M, z: z * M };
    for (const id of around(segBuckets, x, z)) {
      const sg = segs[id];
      if (distanceToSegment(at.x, at.z, sg.a.x, sg.a.z, sg.b.x, sg.b.z) / M < sg.half + verge) return false;
    }
    for (const id of around(raceBuckets, x, z)) {
      const { a, b } = racing[id];
      if (distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < RACED_CLEAR + verge) return false;
    }
    for (const id of around(propBuckets, x, z)) {
      const pr = props[id];
      if (Math.hypot(pr.x - x, pr.z - z) < PROP_CLEAR + verge) return false;
    }
    if (hitsSetPiece(pieces, at.x, at.z, -Infinity, 3 * M, Infinity)) return false;
    return true;
  };

  const out: AuthoredProp[] = [];
  for (let i = Math.floor(BOX.minX / CELL); i * CELL < BOX.maxX; i++) {
    for (let j = Math.floor(BOX.minZ / CELL); j * CELL < BOX.maxZ; j++) {
      const x = (i + 0.1 + 0.8 * cellRandom(i, j, 31 + spec.salt)) * CELL;
      const z = (j + 0.1 + 0.8 * cellRandom(i, j, 32 + spec.salt)) * CELL;
      const at = { x: x * M, z: z * M };
      if (!onIsland(x, z) || wet(at.x, at.z) || planDistrictAt(at) !== null) continue;
      const h = groundAt(terrain, at.x, at.z) / M;
      const reach = spec.reach(x, z, h);
      if (reach <= 0) continue;
      if (h < 1.5) continue;
      const roll = cellRandom(i, j, 33 + spec.salt);
      const angle = Math.round(cellRandom(i, j, 34 + spec.salt) * Math.PI * 2 * 1000) / 1000;

      // Rock on the high ground, in outcrops where a second noise peaks: one
      // boulder in a cell big enough for it, and clear of what a car runs on.
      // The owner liked these (2026-10-02) and asked for more: they reach
      // further down the hills, and the patches are wider and fuller.
      if (h >= spec.rockHigh && (i + j) % 2 === 0) {
        const outcrop = Math.max(0, (rocks(x, z) - 0.5) / 0.25) * Math.min(1, (h - spec.rockHigh) / 8 + 0.4);
        if (cellRandom(i, j, 35 + spec.salt) < 0.85 * Math.min(1, outcrop) * reach && clearOf(x, z, 8)) {
          out.push({ kind: 'outcrop', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
          continue;
        }
      }

      // Woods where the noise peaks, thinning over the tops and to the shore.
      const height =
        Math.max(0, Math.min(1, (spec.topsBare - h) / (spec.topsBare - spec.tops))) * Math.max(0, Math.min(1, (h - 1.5) / (spec.shoreLow - 1.5)));
      const wood = Math.max(0, Math.min(1, (woods(x, z) - 0.5) / 0.22));
      // And scrub: a lone tree over the open ground now and then.
      const keep = (spec.woodShare * wood * height + spec.scrub) * reach;
      if (roll >= keep) continue;
      if (!clearOf(x, z, 0)) continue;
      out.push({ kind: 'tree', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
    }
  }
  return out;
}

/**
 * Marrow Field's rise (2026-10-02): the ridge that runs the length of the
 * airfield island between the runway strips and the shore, which the owner
 * wanted as countryside rather than more airfield. It starts where the ground
 * climbs off the field, so the line between the two is the foot of the rise
 * rather than a fence drawn on the map: copses on its flanks, scrub, and rock
 * along the crest.
 */
export function airfieldRiseFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  clear: readonly AuthoredProp[],
  wet: (x: number, z: number) => boolean,
  raced: readonly Vec2[][] = [],
): AuthoredProp[] {
  const field = PLAN_PLACES.find((p) => p.kind === 'airfield');
  if (!field || !field.area) return [];
  return countrysideFor(terrain, roads, nodes, pieces, clear, wet, raced, {
    area: field.area,
    reach: (_x, _z, h) => Math.max(0, Math.min(1, (h - RISE_FOOT) / 2)),
    tops: 13.5,
    topsBare: 17,
    shoreLow: 4,
    rockHigh: 12.5,
    woodShare: 0.55,
    scrub: 0.05,
    salt: 101,
  });
}

/** Where Marrow Field's rise starts, in metres of ground: the field is 5 to 10 m, the rise 10 to 15. */
const RISE_FOOT = 10;
