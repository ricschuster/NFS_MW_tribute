import { CITY_WOODS_STREAM, UNITS_PER_METRE } from '../constants';
import { distanceToSegment } from './grid';
import { cellRandom, valueNoise } from './highmoor';
import { PLAN_PLACES, planDistrictAt } from './plan';
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

/** Round the island, in metres: its land is found inside this by filling out from the quarry. */
const BOX = { minX: -4000, maxX: -1300, minZ: -2900, maxZ: 800 };
/** The fill's cell: fine enough that the island's edge is the beach, not a staircase. */
const FILL = 20;
const CELL = 13;
/** Past the quarry's own dressing, which runs out to its radius and 260 m beyond, blending in over this. */
const QUARRY_DRESSED = 260, BLEND = 160;
/** Off a road's edge: a dirt track gets a verge a rally car can run wide on; the coast road its tarmac's. */
const TRACK_CLEAR = 9, ROAD_CLEAR = 18;
/** From the middle of a race line. */
const RACED_CLEAR = 23;
const PROP_CLEAR = 10;
/** Above this, a wood thins out to the bare top; below `SHORE_LOW` it thins to the beach. */
const TOPS = 30, TOPS_BARE = 42, SHORE_LOW = 4;
/** A boulder of an outcrop stands this high up, or higher. */
const ROCK_HIGH = 22;

export function quarryIslandWildsFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  clear: readonly AuthoredProp[],
  wet: (x: number, z: number) => boolean,
  raced: readonly Vec2[][] = [],
): AuthoredProp[] {
  const quarry = PLAN_PLACES.find((p) => p.kind === 'quarry');
  if (!quarry) return [];
  const qx = quarry.at.x / M, qz = quarry.at.z / M;
  const dressed = quarry.radius / M + QUARRY_DRESSED;
  const inBox = (x: number, z: number) => x > BOX.minX && x < BOX.maxX && z > BOX.minZ && z < BOX.maxZ;
  // The island is the land joined to the quarry: a flood fill over the box,
  // so the wharf's island across the strait and Ashford Point's across the
  // channel, both inside it, take none of this.
  const cols = Math.ceil((BOX.maxX - BOX.minX) / FILL) + 1, rows = Math.ceil((BOX.maxZ - BOX.minZ) / FILL) + 1;
  const island = new Uint8Array(cols * rows);
  const stack = [[Math.round((qx - BOX.minX) / FILL), Math.round((qz - BOX.minZ) / FILL)]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (i < 0 || j < 0 || i >= cols || j >= rows || island[j * cols + i]) continue;
    if (wet((BOX.minX + i * FILL) * M, (BOX.minZ + j * FILL) * M)) continue;
    island[j * cols + i] = 1;
    stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  const onIsland = (x: number, z: number) => island[Math.round((z - BOX.minZ) / FILL) * cols + Math.round((x - BOX.minX) / FILL)] === 1;
  const segs = roads
    .filter((r) => r.class !== 'interstate' && r.class !== 'ramp' && nodes[r.a].level === 'surface' && nodes[r.b].level === 'surface')
    .map((r) => ({ a: nodes[r.a].pos, b: nodes[r.b].pos, half: r.width / 2 / M + (r.surface === 'asphalt' || !r.surface ? ROAD_CLEAR : TRACK_CLEAR) }))
    .filter(({ a, b }) => inBox(a.x / M, a.z / M) || inBox(b.x / M, b.z / M));
  const racing = raced
    .flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })))
    .filter(({ a, b }) => inBox(a.x / M, a.z / M) || inBox(b.x / M, b.z / M));
  const props = clear.filter((p) => inBox(p.x, p.z));
  const woods = valueNoise(CITY_WOODS_STREAM ^ 0x48616c6c, 170);
  const rocks = valueNoise(CITY_WOODS_STREAM ^ 0x526f636b, 60);

  const clearOf = (x: number, z: number, verge: number): boolean => {
    const at = { x: x * M, z: z * M };
    if (segs.some((s) => distanceToSegment(at.x, at.z, s.a.x, s.a.z, s.b.x, s.b.z) / M < s.half + verge)) return false;
    if (racing.some(({ a, b }) => distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < RACED_CLEAR + verge)) return false;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < PROP_CLEAR + verge)) return false;
    if (hitsSetPiece(pieces, at.x, at.z, -Infinity, 3 * M, Infinity)) return false;
    return true;
  };

  const out: AuthoredProp[] = [];
  for (let i = Math.floor(BOX.minX / CELL); i * CELL < BOX.maxX; i++) {
    for (let j = Math.floor(BOX.minZ / CELL); j * CELL < BOX.maxZ; j++) {
      const x = (i + 0.1 + 0.8 * cellRandom(i, j, 31)) * CELL;
      const z = (j + 0.1 + 0.8 * cellRandom(i, j, 32)) * CELL;
      const at = { x: x * M, z: z * M };
      // The quarry's own ground, blending out of it.
      const reach = Math.max(0, Math.min(1, (Math.hypot(x - qx, z - qz) - dressed) / BLEND));
      if (reach <= 0) continue;
      if (!onIsland(x, z) || wet(at.x, at.z) || planDistrictAt(at) !== null) continue;
      const h = groundAt(terrain, at.x, at.z) / M;
      if (h < 1.5) continue;
      const roll = cellRandom(i, j, 33);
      const angle = Math.round(cellRandom(i, j, 34) * Math.PI * 2 * 1000) / 1000;

      // Rock on the high ground, in outcrops where a second noise peaks: one
      // boulder in a cell big enough for it, and clear of what a car runs on.
      // The owner liked these (2026-10-02) and asked for more: they reach
      // further down the hills, and the patches are wider and fuller.
      if (h >= ROCK_HIGH && (i + j) % 2 === 0) {
        const outcrop = Math.max(0, (rocks(x, z) - 0.5) / 0.25) * Math.min(1, (h - ROCK_HIGH) / 8 + 0.4);
        if (cellRandom(i, j, 35) < 0.85 * Math.min(1, outcrop) * reach && clearOf(x, z, 8)) {
          out.push({ kind: 'outcrop', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
          continue;
        }
      }

      // Woods where the noise peaks, thinning over the tops and to the shore.
      const height =
        Math.max(0, Math.min(1, (TOPS_BARE - h) / (TOPS_BARE - TOPS))) * Math.max(0, Math.min(1, (h - 1.5) / (SHORE_LOW - 1.5)));
      const wood = Math.max(0, Math.min(1, (woods(x, z) - 0.5) / 0.22));
      // And scrub: a lone tree over the open ground now and then.
      const keep = (0.8 * wood * height + 0.035) * reach;
      if (roll >= keep) continue;
      if (!clearOf(x, z, 0)) continue;
      out.push({ kind: 'tree', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
    }
  }
  return out;
}
