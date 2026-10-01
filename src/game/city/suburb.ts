import { UNITS_PER_METRE } from '../constants';
import { distanceToSegment } from './grid';
import { cellRandom } from './highmoor';
import { PLAN_DISTRICTS, inArea } from './plan';
import { ESTATE_FOOTING, HOUSE_GROWN, hitsSetPiece } from './setpieces';
import { PAVEMENT } from './highstreet';
import { insideOrNear } from './aprons';
import { groundAt, type Terrain } from './terrain';
import type { AuthoredProp, CityNode, CityRoad, DistrictKind, SetPiece, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * Which midtowns are suburbs with houses on their streets, by their place in
 * the plan's list of midtowns: Midtown north (#477), Midtown south (#487)
 * and Midtown south-west (#488).
 * The drafts take one at a time (`npm run housedraft -- --place P`, whose
 * table in `tools/suburbs.mjs` carries the same indices), since each area's
 * houses go to its own props file.
 */
export const SUBURB_AREAS = [2, 1, 0];

/**
 * A house and a low apartment block, at the size their models are drawn: real
 * proportions grown by `HOUSE_GROWN`, like the castle's houses, so a house
 * reads as one beside a car 4.8 m across. `w` is across the front, `l` front
 * to back.
 */
export const HOUSE = { w: 10 * HOUSE_GROWN, l: 12 * HOUSE_GROWN };
export const APARTMENT = { w: 24 * HOUSE_GROWN, l: 12 * HOUSE_GROWN };
/** A high street's shop with flats over it, and its block of flats (#488). */
export const SHOP = { w: 8 * HOUSE_GROWN, l: 12 * HOUSE_GROWN };
export const FLAT = { w: 16 * HOUSE_GROWN, l: 12 * HOUSE_GROWN };
/** Ashford Point's villa and manor (#293), across their garage or wings. */
export const VILLA = { w: 21 * HOUSE_GROWN, l: 12 * HOUSE_GROWN };
export const MANOR = { w: 30 * HOUSE_GROWN, l: 22 * HOUSE_GROWN };
const HOUSE_COLOURS = ['cream', 'brick', 'blue', 'green'];
const APARTMENT_COLOURS = ['brick', 'render'];
const SHOP_COLOURS = ['red', 'green', 'blue', 'black'];
const ESTATE_COLOURS = ['cream', 'render', 'brick', 'blue'];
type HomeKind = 'house' | 'apartment' | 'shop' | 'flat' | 'villa' | 'manor';
/** The footprint each home kind is drafted at. */
const SIZES: Record<HomeKind, { w: number; l: number }> = { house: HOUSE, apartment: APARTMENT, shop: SHOP, flat: FLAT, villa: VILLA, manor: MANOR };
const isHome = (kind: string): kind is HomeKind => kind in SIZES;

/** Along the street, from one house's middle to the next. */
const HOUSE_FRONTAGE = 27;
const APARTMENT_FRONTAGE = 52;
/** From the kerb to the front wall: the front garden. */
const GARDEN = 7;
/** Between two shops on a high street: a terrace, not a row of houses. */
const SHOP_GAP = 1;
/** How many of a high street's lots are a block of flats rather than a shop. */
const FLATS = 0.25;
/**
 * The garden on a road a race runs on. A driver who runs a corner wide goes
 * further than a front garden - `citylap`'s reference driver leaves the
 * Marrow Field Run's line by up to 54 m - so the houses along a race stand
 * back the way the trees in the parks do.
 */
const RACED_GARDEN = 18;
/** Clear of every road's edge but the one a house faces, and of each other. */
const ROAD_CLEAR = 4;
const HOUSE_GAP = 4;
/** No house this near a road's end: the corner belongs to the street round it. */
const CORNER = 22;
/** How often a lot is left empty: a gap in the row reads as a suburb rather than a terrace. */
const EMPTY = 0.12;
/**
 * How far past the back of a lot the water may not come: closer than this,
 * the lot is the strip between a road and the shore, which is left open.
 */
const WATERFRONT = 40;
/** A house whose ground falls more than this across it is left off: it would float or sink. */
const MAX_FALL = 1.5;

/**
 * Ashford Point's estates (#293, the owner's brief): mostly villas, a size up
 * from a suburb house, some suburb houses among them, and a few manors, which
 * have the ridge to themselves. Lots are wider and gardens deeper than a
 * suburb's, more of them are left empty, and a villa or a manor stands on a
 * footing (`ESTATE_FOOTING`), so it takes ground that falls further across it.
 */
const ESTATE = {
  frontage: 64,
  garden: 14,
  empty: 0.2,
  /** Of the lots off the ridge, how many are suburb houses, and how many manors. */
  houses: 0.22,
  manors: 0.02,
  /** Of the villas, how many are built: the owner found the first draft too dense. */
  villas: 0.5,
  /** Ground this high is the ridge: manors only, far apart, well back. */
  ridge: 32,
  ridgeFrontage: 230,
  ridgeGarden: 30,
  /** Hidden by the footing, with a little left over for the lowest corner. */
  maxFall: ESTATE_FOOTING * HOUSE_GROWN * 1.5,
};

/**
 * Houses on Midtown north's streets (#477): the owner's quiet suburb. Each
 * street, and each boulevard through the area, is walked on both sides, and a
 * house stands every `HOUSE_FRONTAGE` metres facing it across a front garden;
 * a boulevard gets low apartment blocks instead. A house is kept only on dry
 * ground in the area, clear of every other road, every other house and every
 * set piece, and on ground flat enough to stand on.
 *
 * Set pieces rather than `Building`s, because a building is an axis-aligned
 * box and these streets curve and run at every angle: a house turned to face
 * its street is a set piece, the way the castle's buildings are.
 *
 * A draft, not what the game builds (#477, the owner's call): `npm run
 * housedraft` runs this once and writes the houses into the area's props
 * file, the area editor is where they are moved, turned, added and deleted,
 * and `propsync` makes the saved set the city - so a road change no longer
 * moves a house by itself. The numbers come from each lot's own position
 * (`cellRandom`), so a redraft after a street moves changes only the houses
 * on it.
 */
export function suburbHousesFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  isWater: (x: number, z: number) => boolean,
  pieces: readonly SetPiece[],
  clear: readonly Vec2[],
  raced: readonly Vec2[][] = [],
  areas: readonly number[] = SUBURB_AREAS,
  high: readonly Vec2[][] = [],
  district: DistrictKind = 'midtown',
): AuthoredProp[] {
  const midtowns = PLAN_DISTRICTS.filter((a) => a.kind === district);
  const estates = district === 'waterfront';
  const houses: AuthoredProp[] = [];
  // `inner` is the half-width a terrace may close up to; zero for anything
  // that is not on a high street, which keeps its circle of garden.
  const placed: { at: Vec2; r: number; inner: number }[] = [];
  for (const index of areas) {
    const area = midtowns[index];
    if (!area) continue;
    const local = roads.filter((r) => {
      if (r.class === 'interstate' || r.class === 'ramp' || r.bridge) return false;
      const a = nodes[r.a], b = nodes[r.b];
      if (a.level !== 'surface' || b.level !== 'surface') return false;
      return inArea(area.poly, a.pos) || inArea(area.poly, b.pos);
    });
    // Anything with a foot on the street, ramps included: a ramp climbs past
    // a house at head height, and a lot under it is a wall across the climb.
    const segments = roads
      .filter((r) => onTheStreet(nodes, r))
      .map((r) => ({ road: r, a: nodes[r.a].pos, b: nodes[r.b].pos, half: r.width / 2 }));
    const racing = raced.flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })));
    const onRace = (a: Vec2, b: Vec2): boolean =>
      racing.some((s) => distanceToSegment(a.x, a.z, s.a.x, s.a.z, s.b.x, s.b.z) < 3 * M && distanceToSegment(b.x, b.z, s.a.x, s.a.z, s.b.x, s.b.z) < 3 * M);
    const highSegments = high.flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })));
    const onHigh = (a: Vec2, b: Vec2): boolean =>
      highSegments.some((s) => distanceToSegment(a.x, a.z, s.a.x, s.a.z, s.b.x, s.b.z) < 3 * M && distanceToSegment(b.x, b.z, s.a.x, s.a.z, s.b.x, s.b.z) < 3 * M);

    // A road is walked as a run from one junction to the next, not segment by
    // segment: a drawn road is split at every vertex, and most of its pieces
    // are shorter than a house's frontage.
    for (const run of runsOf(local, nodes)) {
      const boulevard = run.road.class === 'boulevard';
      const highStreet = run.raced(onHigh);
      const length = run.length / M;
      const lots: { d: number; side: number; kind: HomeKind; cx: number; cz: number }[] = [];
      const cellAt = (d: number, side: number) => {
        const p = run.at(d * M).p;
        return { cx: Math.round((p.x / M) * 2 + side), cz: Math.round((p.z / M) * 2) };
      };
      if (highStreet) {
        // A high street (#488), lot by lot down each side, since a shop and a
        // block of flats are not the same width: a terrace, no gaps.
        for (const side of [1, -1]) {
          let d = run.junctionAtStart ? CORNER : 0;
          for (;;) {
            const { cx, cz } = cellAt(Math.min(length, d + SHOP.w / 2), side);
            const kind: HomeKind = cellRandom(cx, cz, 13) < FLATS ? 'flat' : 'shop';
            const w = SIZES[kind].w;
            if (d + w / 2 > length - (run.junctionAtEnd ? CORNER + w / 2 : w / 2)) break;
            lots.push({ d: d + w / 2, side, kind, cx, cz });
            d += w + SHOP_GAP;
          }
        }
      } else if (estates) {
        // An estate (#293): one kind per lot, chosen by the lot, and the
        // ridge kept for manors.
        const ridge = groundAt(terrain, run.at(run.length / 2).p.x, run.at(run.length / 2).p.z) / M > ESTATE.ridge;
        const frontage = ridge ? ESTATE.ridgeFrontage : ESTATE.frontage;
        const clear = (run.junctionAtStart ? CORNER : 0) + (ridge ? MANOR.w / 2 : VILLA.w / 2);
        const endClear = (run.junctionAtEnd ? CORNER : 0) + (ridge ? MANOR.w / 2 : VILLA.w / 2);
        for (let d = clear; d <= length - endClear; d += frontage) {
          for (const side of [1, -1]) {
            const { cx, cz } = cellAt(d, side);
            if (cellRandom(cx, cz, 11) < ESTATE.empty) continue;
            const roll = cellRandom(cx, cz, 14);
            const kind: HomeKind = ridge || roll < ESTATE.manors ? 'manor' : roll < ESTATE.manors + ESTATE.houses ? 'house' : 'villa';
            if (kind === 'villa' && cellRandom(cx, cz, 15) >= ESTATE.villas) continue;
            lots.push({ d, side, kind, cx, cz });
          }
        }
      } else {
        // Anything else at a fixed frontage, both sides at once, a gap left
        // now and then: a suburb rather than a terrace.
        const kind: HomeKind = boulevard ? 'apartment' : 'house';
        const size = SIZES[kind];
        const frontage = boulevard ? APARTMENT_FRONTAGE : HOUSE_FRONTAGE;
        const startClear = run.junctionAtStart ? CORNER + size.w / 2 : size.w / 2;
        const endClear = run.junctionAtEnd ? CORNER + size.w / 2 : size.w / 2;
        for (let d = startClear; d <= length - endClear; d += frontage) {
          for (const side of [1, -1]) {
            const { cx, cz } = cellAt(d, side);
            if (cellRandom(cx, cz, 11) < EMPTY) continue;
            lots.push({ d, side, kind, cx, cz });
          }
        }
      }
      // A high street's shops stand at the back of its pavement, on a race
      // too: the sprint down a high street is between the shopfronts, and one
      // set back eighteen metres is a boulevard.
      const garden = highStreet ? PAVEMENT : run.raced(onRace) ? RACED_GARDEN : estates ? ESTATE.garden : GARDEN;
      for (const { d, side, kind, cx, cz } of lots) {
        const size = SIZES[kind];
        const setBack = kind === 'manor' ? Math.max(garden, ESTATE.ridgeGarden) : garden;
        const here = run.at(d * M);
        const n = { x: -here.dir.z * side, z: here.dir.x * side };
        const out = run.road.width / 2 / M + setBack + size.l / 2;
        const at = { x: here.p.x + n.x * out * M, z: here.p.z + n.z * out * M };
        // Facing the street: the model's front is along its heading.
        const angle = Math.round(Math.atan2(-n.x, -n.z) * 1000) / 1000;
        const corners = footprint(at, angle, size);
        if (![at, ...corners].every((p) => inArea(area.poly, p) && !isWater(p.x, p.z))) continue;
        // Nothing between a road and the water close behind it: that side
        // of a waterfront road is the view, not a lot (#487's promenade).
        const behind = out + size.l / 2 + WATERFRONT;
        let onTheWater = false;
        for (let d = run.road.width / 2 / M; d <= behind && !onTheWater; d += 5) onTheWater = isWater(here.p.x + n.x * d * M, here.p.z + n.z * d * M);
        if (onTheWater) continue;
        const r = Math.hypot(size.w, size.l) / 2;
        const inner = highStreet ? Math.min(size.w, size.l) / 2 : 0;
        if (
          placed.some((p) => {
            const apart = Math.hypot(p.at.x - at.x, p.at.z - at.z) / M;
            // Two shops on one high street close up to a terrace; anything
            // else keeps its garden's distance.
            return p.inner && inner ? apart < p.inner + inner : apart < (p.r + r) * 0.82 + HOUSE_GAP;
          })
        )
          continue;
        // Clear of every road's edge; the road it faces is already a garden
        // away, or on a high street a pavement, which is narrower than the
        // clearance and would rule out the street the shop is on.
        const probe = [at, ...corners, ...edgeMiddles(corners)];
        const roadClear = highStreet ? PAVEMENT - 1 : ROAD_CLEAR;
        if (segments.some((s) => probe.some((p) => distanceToSegment(p.x, p.z, s.a.x, s.a.z, s.b.x, s.b.z) < s.half + roadClear * M))) continue;
        if (clear.some((c) => Math.hypot(c.x - at.x, c.z - at.z) / M < r + 6)) continue;
        if (probe.some((p) => hitsSetPiece(pieces, p.x, p.z, -Infinity, 2 * M, Infinity))) continue;
        const heights = probe.map((p) => groundAt(terrain, p.x, p.z) / M);
        const footed = kind === 'villa' || kind === 'manor';
        if (Math.max(...heights) - Math.min(...heights) > (footed ? ESTATE.maxFall : MAX_FALL)) continue;
        const colours = kind === 'shop' ? SHOP_COLOURS : kind === 'house' ? HOUSE_COLOURS : footed ? ESTATE_COLOURS : APARTMENT_COLOURS;
        const variant = colours[Math.floor(cellRandom(cx, cz, 12) * colours.length)];
        houses.push({ kind, x: Math.round((at.x / M) * 10) / 10, z: Math.round((at.z / M) * 10) / 10, angle, variant });
        placed.push({ at, r, inner });
      }
    }
  }
  return houses;
}

/** The four corners of a house turned to `angle`: across is `w`, along the heading is `l`. */
function footprint(at: Vec2, angle: number, size: { w: number; l: number }): Vec2[] {
  const f = { x: Math.sin(angle), z: Math.cos(angle) };
  const s = { x: Math.cos(angle), z: -Math.sin(angle) };
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({
    x: at.x + (s.x * u * size.w / 2 + f.x * v * size.l / 2) * M,
    z: at.z + (s.z * u * size.w / 2 + f.z * v * size.l / 2) * M,
  }));
}

function edgeMiddles(corners: Vec2[]): Vec2[] {
  return corners.map((c, i) => {
    const d = corners[(i + 1) % corners.length];
    return { x: (c.x + d.x) / 2, z: (c.z + d.z) / 2 };
  });
}

/**
 * The roads as runs from junction to junction (or to a dead end): consecutive
 * pieces of one class through nodes where only two roads meet.
 */
export function runsOf(roads: readonly CityRoad[], nodes: readonly CityNode[]) {
  const ids = new Set(roads.map((r) => r.id));
  const byId = new Map(roads.map((r) => [r.id, r]));
  const used = new Set<number>();
  const through = (node: CityNode, cls: string) => node.roads.length === 2 && node.roads.every((id) => byId.get(id)?.class === cls);
  const runs = [];
  for (const first of roads) {
    if (used.has(first.id)) continue;
    // Back up to the start of the run this piece is in.
    let road = first;
    let head = road.a;
    for (let guard = 0; guard < 500 && through(nodes[head], first.class); guard++) {
      const prev = nodes[head].roads.map((id) => byId.get(id)!).find((r) => r !== road && ids.has(r.id));
      if (!prev || used.has(prev.id) || prev === first) break;
      head = prev.a === head ? prev.b : prev.a;
      road = prev;
    }
    // And walk it forward, collecting the points.
    const points: Vec2[] = [nodes[head].pos];
    let at = head;
    let junctionAtEnd = false;
    for (let guard = 0; guard < 500; guard++) {
      used.add(road.id);
      at = road.a === at ? road.b : road.a;
      points.push(nodes[at].pos);
      if (!through(nodes[at], first.class)) {
        junctionAtEnd = nodes[at].roads.length > 2;
        break;
      }
      const next = nodes[at].roads.map((id) => byId.get(id)!).find((r) => r && r !== road && !used.has(r.id));
      if (!next) break;
      road = next;
    }
    runs.push(makeRun(first, points, nodes[head].roads.length > 2, junctionAtEnd));
  }
  return runs;
}

function makeRun(road: CityRoad, points: Vec2[], junctionAtStart: boolean, junctionAtEnd: boolean) {
  const lengths = points.slice(1).map((b, i) => Math.hypot(b.x - points[i].x, b.z - points[i].z));
  const length = lengths.reduce((s, l) => s + l, 0);
  return {
    road,
    length,
    junctionAtStart,
    junctionAtEnd,
    /** Whether a good part of the run is on a race line. */
    raced: (onRace: (a: Vec2, b: Vec2) => boolean) => {
      let on = 0;
      for (let i = 1; i < points.length; i++) if (onRace(points[i - 1], points[i])) on += lengths[i - 1];
      return on > length / 4;
    },
    at: (d: number) => {
      for (let i = 1; i < points.length; i++) {
        const l = lengths[i - 1];
        if (d <= l || i === points.length - 1) {
          const a = points[i - 1], b = points[i];
          const t = Math.min(1, d / (l || 1));
          return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, dir: { x: (b.x - a.x) / (l || 1), z: (b.z - a.z) / (l || 1) } };
        }
        d -= l;
      }
      return { p: points[0], dir: { x: 1, z: 0 } };
    },
  };
}

/** From the kerb to a street tree's trunk, in the verge. */
const VERGE = 2.5;
const TREE_SPACING = 30;
const AVENUE_SPACING = 36;
/** Of the street trees an estate's lanes could take, how many they get: the owner's 40%. */
const ESTATE_TREES = 0.4;
/** An estate's street trees stand back from the lane, the owner's call: the first of these that fits. */
const ESTATE_VERGES = [VERGE + 4, VERGE + 2, VERGE];
/** A hedge stands this far back from the kerb, along the front of the garden. */
const HEDGE_BACK = 1.6;


/**
 * A road a prop has to keep clear of: one with an end on the street. Both
 * ends is too narrow, because a ramp has one end up on the deck and the
 * other on the street, and its first hundred metres are low enough to drive
 * into anything standing there (#487: a street tree halfway up ramp 4 made
 * the interstate unreachable from Midtown south). The deck itself is
 * scenery, held high over everything (`DECK_HEADROOM`), so it is not one.
 */
export function onTheStreet(nodes: readonly CityNode[], r: CityRoad): boolean {
  return nodes[r.a].level === 'surface' || nodes[r.b].level === 'surface';
}
/**
 * Front hedges and street trees round the houses already placed (#477): what
 * turns a row of boxes into a street. Drafted with the houses by `npm run
 * housedraft`, from the houses in the file rather than freshly generated
 * ones, so a house moved or deleted by hand keeps or loses its hedge with it.
 *
 * A hedge runs along the kerb side of a house's garden, a gap in it for the
 * path to the door; an apartment block has none. A street tree stands in the
 * verge every `TREE_SPACING` metres, kept off junctions, off every road, out of
 * the houses and their hedges - and off a road a race runs on, because a trunk
 * in the verge is a wall to a car that runs a corner wide.
 */
export function suburbExtrasFor(
  houses: readonly AuthoredProp[],
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  isWater: (x: number, z: number) => boolean,
  raced: readonly Vec2[][] = [],
  clear: readonly Vec2[] = [],
  areas: readonly number[] = SUBURB_AREAS,
  district: DistrictKind = 'midtown',
  /** Ground a tree may not stand on: Ashford Point's drives (#293). */
  avoid: readonly Vec2[][] = [],
): AuthoredProp[] {
  const midtowns = PLAN_DISTRICTS.filter((a) => a.kind === district);
  const estates = district === 'waterfront';
  const segments = roads
    .filter((r) => onTheStreet(nodes, r))
    .map((r) => ({ a: nodes[r.a].pos, b: nodes[r.b].pos, half: r.width / 2 }));
  const kerbGap = (p: Vec2) => Math.min(...segments.map((s) => distanceToSegment(p.x, p.z, s.a.x, s.a.z, s.b.x, s.b.z) - s.half)) / M;
  const homes = houses.flatMap((h) => (isHome(h.kind) ? [{ h, size: SIZES[h.kind] }] : []));
  const inHome = (p: Vec2, margin: number) =>
    homes.some(({ h, size }) => {
      const dx = p.x / M - h.x, dz = p.z / M - h.z;
      const v = dx * Math.sin(h.angle) + dz * Math.cos(h.angle);
      const u = dx * Math.cos(h.angle) - dz * Math.sin(h.angle);
      return Math.abs(u) < size.w / 2 + margin && Math.abs(v) < size.l / 2 + margin;
    });
  const out: AuthoredProp[] = [];
  const r1 = (v: number) => Math.round(v * 10) / 10;

  // Hedges: out from each house's front until the kerb, and back a little.
  const hedges: Vec2[] = [];
  // None on Ashford Point's estates (#293): the owner took them out.
  for (const { h, size } of estates ? [] : homes) {
    if (h.kind !== 'house') continue;
    const f = { x: Math.sin(h.angle), z: Math.cos(h.angle) };
    for (let d = size.l / 2 + 2; d < size.l / 2 + 30; d += 0.5) {
      const p = { x: (h.x + f.x * d) * M, z: (h.z + f.z * d) * M };
      if (kerbGap(p) > HEDGE_BACK) continue;
      const at = { x: h.x + f.x * (d - 0.6), z: h.z + f.z * (d - 0.6) };
      if (d - 0.6 - size.l / 2 < 2) break; // no garden to speak of
      out.push({ kind: 'hedge', x: r1(at.x), z: r1(at.z), angle: h.angle });
      hedges.push({ x: at.x * M, z: at.z * M });
      break;
    }
  }

  // Street trees, in the verge of every street and boulevard through a suburb.
  const racing = raced.flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })));
  const onRace = (a: Vec2, b: Vec2): boolean =>
    racing.some((s) => distanceToSegment(a.x, a.z, s.a.x, s.a.z, s.b.x, s.b.z) < 3 * M && distanceToSegment(b.x, b.z, s.a.x, s.a.z, s.b.x, s.b.z) < 3 * M);
  const trees: Vec2[] = [];
  for (const index of areas) {
    const area = midtowns[index];
    if (!area) continue;
    const local = roads.filter((r) => {
      if (r.class === 'interstate' || r.class === 'ramp' || r.bridge) return false;
      const a = nodes[r.a], b = nodes[r.b];
      return a.level === 'surface' && b.level === 'surface' && (inArea(area.poly, a.pos) || inArea(area.poly, b.pos));
    });
    for (const run of runsOf(local, nodes)) {
      if (run.raced(onRace)) continue;
      const spacing = run.road.class === 'boulevard' ? AVENUE_SPACING : TREE_SPACING;
      const length = run.length / M;
      const clearStart = run.junctionAtStart ? CORNER : 6;
      const clearEnd = run.junctionAtEnd ? CORNER : 6;
      for (let d = clearStart + spacing / 2; d <= length - clearEnd; d += spacing) {
        const here = run.at(d * M);
        for (const side of [1, -1]) {
          const n = { x: -here.dir.z * side, z: here.dir.x * side };
          const spot = (verge: number) => {
            const out1 = run.road.width / 2 / M + verge;
            return { x: here.p.x + n.x * out1 * M, z: here.p.z + n.z * out1 * M };
          };
          // Which trees there are is settled at the verge, wherever each one
          // then stands, so moving them back does not change the set.
          const base = spot(VERGE);
          const cell = { x: Math.round(base.x / M), z: Math.round(base.z / M) };
          // Ashford Point keeps two in five (#293): estates, not an avenue.
          if (estates && cellRandom(cell.x, cell.z, 16) >= ESTATE_TREES) continue;
          const fits = (at: Vec2, verge: number) =>
            inArea(area.poly, at) &&
            !isWater(at.x, at.z) &&
            kerbGap(at) >= verge - 0.5 &&
            !inHome(at, 2) &&
            !hedges.some((q) => Math.hypot(q.x - at.x, q.z - at.z) / M < 7) &&
            !trees.some((q) => Math.hypot(q.x - at.x, q.z - at.z) / M < 10) &&
            // Not on a billboard, a speed camera or a breakable.
            !clear.some((c) => Math.hypot(c.x - at.x, c.z - at.z) / M < 6) &&
            !avoid.some((outline) => insideOrNear(outline, at.x, at.z, 3 * M));
          // And on an estate, further back from the lane where there is room.
          const verge = (estates ? ESTATE_VERGES : [VERGE]).find((v) => fits(spot(v), v));
          if (verge === undefined) continue;
          const at = spot(verge);
          const angle = Math.round(cellRandom(cell.x, cell.z, 13) * Math.PI * 2 * 1000) / 1000;
          out.push({ kind: 'street-tree', x: r1(at.x / M), z: r1(at.z / M), angle });
          trees.push(at);
        }
      }
    }
  }
  return out;
}
