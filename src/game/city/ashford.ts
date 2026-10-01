import { CITY_WOODS_STREAM, UNITS_PER_METRE } from '../constants';
import { insideOrNear } from './aprons';
import { distanceToSegment } from './grid';
import { cellRandom, valueNoise } from './highmoor';
import { PLAN_DISTRICTS, inArea } from './plan';
import { hitsSetPiece } from './setpieces';
import { MANOR, VILLA } from './suburb';
import { groundAt, type Terrain } from './terrain';
import { digPonds, pondOutlineOf } from './tidewater';
import type { Apron, AuthoredProp, CityNode, CityRoad, SetPiece, Vec2, WaterBody } from './types';

const M = UNITS_PER_METRE;

/**
 * Ashford Point's landscaping (#293), the owner's four asks: ponds, driveways,
 * woods on the open ground and trees in the gardens. Everything but the ponds
 * is generated from the estates as they stand in `ASHFORD_PROPS`, so a house
 * moved in the area editor takes its drive and its garden with it.
 */

/**
 * Three ponds on the flattest open ground the estates leave, each at least
 * 50 m from a lane, 60 m from a race line and 35 m from a house: one in the
 * south-west, one up on the ridge, one on the open east hillside. Never on
 * ground less than five metres up: a pond's water is set below the lowest
 * ground round it and its bank graded down to it, and near the shore that
 * put dry land under sea level. Metres from the map's origin.
 */
export const ASHFORD_PONDS = [
  { x: -3720, z: 1080, r: 50 },
  { x: -2880, z: 1580, r: 45 },
  { x: -2740, z: 2100, r: 50 },
].map((p) => ({ at: { x: p.x * M, z: p.z * M }, radius: p.r * M }));

const pondOutlines = (): Vec2[][] => ASHFORD_PONDS.map((pond, i) => pondOutlineOf(pond, 4.1 + i * 1.7));

/** Dig Ashford Point's ponds, the way Tidewater Park's are dug: before anything is laid. */
export function digAshfordPonds(terrain: Terrain): WaterBody[] {
  if (!ashford()) return [];
  const outlines = pondOutlines();
  return digPonds(terrain, ASHFORD_PONDS.map((pond, i) => ({ ...pond, outline: outlines[i] })));
}

const ashford = () => PLAN_DISTRICTS.find((a) => a.name === 'Ashford Point');

/** A drive's width, and how far into the lane it runs so the two meet without a seam. */
const DRIVE = 6;
const DRIVE_INTO = 1;
/** The longest a drive is looked for: a house further back than this has none. */
const DRIVE_MAX = 90;

type Seg = { a: Vec2; b: Vec2; half: number };

function surfaceSegments(roads: readonly CityRoad[], nodes: readonly CityNode[]): Seg[] {
  return roads
    .filter((r) => r.class !== 'interstate' && r.class !== 'ramp' && nodes[r.a].level === 'surface' && nodes[r.b].level === 'surface')
    .map((r) => ({ a: nodes[r.a].pos, b: nodes[r.b].pos, half: r.width / 2 }));
}

const kerbGap = (segs: readonly Seg[], p: Vec2): number =>
  Math.min(...segs.map((s) => distanceToSegment(p.x, p.z, s.a.x, s.a.z, s.b.x, s.b.z) - s.half));

/** A strip `width` wide from `from` along `dir` until it is `DRIVE_INTO` into a lane, or nothing if no lane is in reach. */
function stripTo(segs: readonly Seg[], from: Vec2, dir: Vec2, width: number): Vec2[] | null {
  for (let d = 0; d <= DRIVE_MAX; d += 1) {
    const p = { x: from.x + dir.x * d * M, z: from.z + dir.z * d * M };
    if (kerbGap(segs, p) > -DRIVE_INTO * M) continue;
    const n = { x: -dir.z, z: dir.x };
    const h = (width / 2) * M;
    return [
      { x: from.x + n.x * h, z: from.z + n.z * h },
      { x: p.x + n.x * h, z: p.z + n.z * h },
      { x: p.x - n.x * h, z: p.z - n.z * h },
      { x: from.x - n.x * h, z: from.z - n.z * h },
    ];
  }
  return null;
}

/** A point `u` across and `v` forward of a home, in metres of its own frame. */
function local(home: AuthoredProp, u: number, v: number): Vec2 {
  const f = { x: Math.sin(home.angle), z: Math.cos(home.angle) };
  const s = { x: Math.cos(home.angle), z: -Math.sin(home.angle) };
  return { x: (home.x + s.x * u + f.x * v) * M, z: (home.z + s.z * u + f.z * v) * M };
}

/**
 * The drives (#293): a villa's runs from its garage door straight out to the
 * lane, block paving; a manor's is a gravel forecourt between its wings with
 * two drives splaying out from it to the lane, the sweep a house that size
 * comes up to. Aprons, so they are paved ground under the car rather than
 * roads: nobody routes through somebody's drive.
 */
export function estateDrives(props: readonly AuthoredProp[], roads: readonly CityRoad[], nodes: readonly CityNode[]): Apron[] {
  if (!ashford()) return [];
  const segs = surfaceSegments(roads, nodes);
  const out: Apron[] = [];
  for (const home of props) {
    const f = { x: Math.sin(home.angle), z: Math.cos(home.angle) };
    const s = { x: Math.cos(home.angle), z: -Math.sin(home.angle) };
    if (home.kind === 'villa') {
      // The garage is the villa's right-hand block, its door on the front.
      const door = local(home, (VILLA.w / 2) - (6 * VILLA.w) / 21 / 2, VILLA.l / 2);
      const strip = stripTo(segs, door, f, DRIVE);
      if (strip) out.push({ outline: strip, margin: 0.5 * M, look: 'cobbles', yard: false });
    } else if (home.kind === 'manor') {
      // The forecourt, between the wings and in front of the main block.
      const inner = (MANOR.w * 7) / 30;
      const back = -MANOR.l / 2 + (14 * MANOR.l) / 22;
      const front = MANOR.l / 2;
      out.push({
        outline: [local(home, -inner, back), local(home, inner, back), local(home, inner, front), local(home, -inner, front)],
        margin: 0.5 * M,
        look: 'gravel',
        yard: false,
      });
      for (const side of [-1, 1]) {
        const dir = { x: f.x + s.x * side * 0.35, z: f.z + s.z * side * 0.35 };
        const len = Math.hypot(dir.x, dir.z);
        const strip = stripTo(segs, local(home, side * inner * 0.7, front - 1), { x: dir.x / len, z: dir.z / len }, DRIVE - 0.5);
        if (strip) out.push({ outline: strip, margin: 0.5 * M, look: 'gravel', yard: false });
      }
    }
  }
  return out;
}

const SIZES: Record<string, { w: number; l: number }> = { villa: VILLA, manor: MANOR, house: { w: 16, l: 19.2 } };
/** How many trees stand in a home's garden, round the back and sides. */
const GARDEN_TREES: Record<string, number> = { house: 2, villa: 3, manor: 7 };
const ROAD_CLEAR = 8;
const TREE_GAP = 7;

const inHome = (homes: readonly AuthoredProp[], p: Vec2, margin: number): boolean =>
  homes.some((h) => {
    const size = SIZES[h.kind];
    if (!size) return false;
    const dx = p.x / M - h.x, dz = p.z / M - h.z;
    const v = dx * Math.sin(h.angle) + dz * Math.cos(h.angle);
    const u = dx * Math.cos(h.angle) - dz * Math.sin(h.angle);
    return Math.abs(u) < size.w / 2 + margin && Math.abs(v) < size.l / 2 + margin;
  });

/**
 * Trees in the gardens (#293): a few behind and beside every house, more
 * round a manor, none in front where the drive and the view of the house are.
 * Each home's numbers come from its own position, so moving one house
 * changes only its own garden.
 */
export function gardenTreesFor(
  props: readonly AuthoredProp[],
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  drives: readonly Apron[],
  isWater: (x: number, z: number) => boolean,
): AuthoredProp[] {
  const area = ashford();
  if (!area) return [];
  const homes = props.filter((p) => p.kind in GARDEN_TREES);
  const streetTrees = props.filter((p) => p.kind === 'street-tree');
  const segs = surfaceSegments(roads, nodes);
  const trees: AuthoredProp[] = [];
  for (const home of homes) {
    const size = SIZES[home.kind];
    const want = GARDEN_TREES[home.kind];
    const cx = Math.round(home.x), cz = Math.round(home.z);
    let placed = 0;
    for (let k = 0; k < want * 6 && placed < want; k++) {
      const r1 = cellRandom(cx, cz, 40 + k * 3), r2 = cellRandom(cx, cz, 41 + k * 3), r3 = cellRandom(cx, cz, 42 + k * 3);
      // Behind the house two times in three, else to one side of it.
      const behind = r1 < 0.66;
      const u = behind ? (r2 * 2 - 1) * (size.w / 2 + 10) : (r2 < 0.5 ? -1 : 1) * (size.w / 2 + 5 + r3 * 12);
      const v = behind ? -size.l / 2 - 5 - r3 * 16 : (r3 * 2 - 1) * (size.l / 2);
      const at = local(home, u, v);
      if (!inArea(area.poly, at) || isWater(at.x, at.z)) continue;
      if (inHome(homes, at, 3)) continue;
      if (kerbGap(segs, at) < ROAD_CLEAR * M) continue;
      if (drives.some((d) => insideOrNear(d.outline, at.x, at.z, 3 * M))) continue;
      if (trees.some((t) => Math.hypot(t.x - at.x / M, t.z - at.z / M) < TREE_GAP)) continue;
      if (streetTrees.some((t) => Math.hypot(t.x - at.x / M, t.z - at.z / M) < TREE_GAP)) continue;
      const angle = Math.round(cellRandom(cx, cz, 90 + k) * Math.PI * 2 * 1000) / 1000;
      trees.push({ kind: 'tree', x: Math.round(at.x / M * 10) / 10, z: Math.round(at.z / M * 10) / 10, angle });
      placed++;
    }
  }
  return trees;
}

/**
 * Copses on the open ground between the estates (#293): Highmoor's lattice
 * and numbers, a wider cell, and a slow noise that keeps only its peaks, so
 * the trees stand in clumps and belts with open grass between rather than
 * in a wood. Kept well clear of the houses, whose gardens are the garden
 * trees' business, and off the lanes, the drives, the ponds and the shore.
 */
const WOODS_CELL = 15;
const WOODS_ROAD_CLEAR = 12;
const WOODS_HOME_CLEAR = 35;
const WOODS_POND_CLEAR = 14;
const RACED_CLEAR = 5 + 18;

export function ashfordWoodsFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  props: readonly AuthoredProp[],
  drives: readonly Apron[],
  clear: readonly Vec2[],
  raced: readonly Vec2[][] = [],
): AuthoredProp[] {
  const area = ashford();
  if (!area) return [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of area.poly) {
    minX = Math.min(minX, p.x / M); maxX = Math.max(maxX, p.x / M);
    minZ = Math.min(minZ, p.z / M); maxZ = Math.max(maxZ, p.z / M);
  }
  const segs = surfaceSegments(roads, nodes).filter(
    ({ a, b }) => Math.max(a.x, b.x) / M > minX - 50 && Math.min(a.x, b.x) / M < maxX + 50 && Math.max(a.z, b.z) / M > minZ - 50 && Math.min(a.z, b.z) / M < maxZ + 50,
  );
  const racing = raced.flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })))
    .filter(({ a, b }) => Math.max(a.x, b.x) / M > minX && Math.min(a.x, b.x) / M < maxX && Math.max(a.z, b.z) / M > minZ && Math.min(a.z, b.z) / M < maxZ);
  const homes = props.filter((p) => p.kind in GARDEN_TREES);
  const ponds = pondOutlines();
  const copses = valueNoise(CITY_WOODS_STREAM ^ 0x41736866, 120);

  const trees: AuthoredProp[] = [];
  for (let i = Math.floor(minX / WOODS_CELL); i * WOODS_CELL < maxX; i++) {
    for (let j = Math.floor(minZ / WOODS_CELL); j * WOODS_CELL < maxZ; j++) {
      const x = (i + 0.1 + 0.8 * cellRandom(i, j, 21)) * WOODS_CELL;
      const z = (j + 0.1 + 0.8 * cellRandom(i, j, 22)) * WOODS_CELL;
      const at = { x: x * M, z: z * M };
      if (!inArea(area.poly, at)) continue;
      // Only where the noise peaks: a copse, not a wood.
      const density = Math.max(0, (copses(x, z) - 0.55) / 0.3);
      if (cellRandom(i, j, 23) >= 0.8 * Math.min(1, density)) continue;
      if (groundAt(terrain, at.x, at.z) / M < 1.5) continue;
      if (segs.some((s) => distanceToSegment(at.x, at.z, s.a.x, s.a.z, s.b.x, s.b.z) / M < s.half / M + WOODS_ROAD_CLEAR)) continue;
      if (racing.some(({ a, b }) => distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < RACED_CLEAR)) continue;
      if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < WOODS_HOME_CLEAR + (h.kind === 'manor' ? 15 : 0))) continue;
      if (drives.some((d) => insideOrNear(d.outline, at.x, at.z, 8 * M))) continue;
      if (ponds.some((o) => insideOrNear(o, at.x, at.z, WOODS_POND_CLEAR * M))) continue;
      if (clear.some((c) => Math.hypot(c.x - at.x, c.z - at.z) / M < 8)) continue;
      if (hitsSetPiece(pieces, at.x, at.z, -Infinity, 3 * M, Infinity)) continue;
      const angle = Math.round(cellRandom(i, j, 24) * Math.PI * 2 * 1000) / 1000;
      trees.push({ kind: 'tree', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
    }
  }
  return trees;
}
