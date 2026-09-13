/**
 * Houses on their own driveways, grown off one authored area's own major
 * roads (issue #268, ADR-0009).
 *
 * The first version of this module carved blocks the way `fillSuperblock`
 * does - a lattice, cuts, a rectangle per lot - just clipped to an irregular
 * polygon instead of the whole map. Looked at on Ashford Point, that read as
 * a lower-density city grid, which is not what "a few roads, well spaced,
 * large lots" (`plan.ts`) or "a low-density island of large houses" (the
 * reason this area exists) actually look like. A real low-density island is
 * one road with a scatter of private driveways off it and mostly nothing in
 * between (a live reference: Keats Island, BC - a single road the length of
 * the island, a handful of short spurs, houses each on their own lot, the
 * rest forest). So this walks the district's own roads and drops a house at
 * the end of a short driveway at intervals, rather than dividing the ground
 * into blocks at all.
 *
 * `district` on an existing `AuthoredRoad`/`Span` is not trustworthy for
 * finding "this area's own roads" - it is whatever the road editor tagged a
 * road as, and `waterfront` meant the harbour before ADR-0009 gave the name
 * to Ashford Point instead (roads.ts still had roads tagged `waterfront`
 * clustered near the old harbour, and the roads actually on Ashford Point's
 * own island tagged `midtown` - a data bug worth fixing at the source, but
 * this only has to not depend on it). Being on the area's own body of land is
 * what actually makes a road its spine.
 */
import {
  ASHFORD_DRIVE_MAX,
  ASHFORD_DRIVE_MIN,
  ASHFORD_INTERIOR_COUNT,
  ASHFORD_INTERIOR_SPACING,
  ASHFORD_LOT_GAP,
  ASHFORD_LOT_JITTER,
  ASHFORD_LOT_SIDE,
  ASHFORD_LOT_SKIP,
  ASHFORD_LOT_SPACING,
  ASHFORD_VILLAGE_LOT_GAP,
  ASHFORD_VILLAGE_LOT_SIDE,
  ASHFORD_VILLAGE_RADIUS,
  ASHFORD_VILLAGE_SPACING,
  BOULEVARD_CLEARANCE,
  BOULEVARD_LANES,
  CITY_LANE_WIDTH,
  DISTRICTS,
  ROUTE_ARTERIAL,
} from '../constants';
import { distanceToSegment, segmentToRect } from './grid';
import { anyWater, centre, layRoute, pullClear, type Span } from './spans';
import { inArea, type PlanArea } from './plan';
import type { LandBodies } from './bodies';
import type { Water } from './water';
import type { Router } from './routing';
import type { Rng } from './rng';
import type { CityBlock, Rect, Vec2 } from './types';

function polyCentroid(poly: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p.x;
    z += p.z;
  }
  return { x: x / poly.length, z: z / poly.length };
}

function polyBounds(poly: Vec2[]): Rect {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, minZ, maxX, maxZ };
}

/** The point on any of these spans nearest `pt`, or `pt` itself if there are none. */
function nearestOnSpans(pt: Vec2, spans: Span[]): Vec2 {
  let best = pt;
  let bestDist = Infinity;
  for (const s of spans) {
    const dx = s.to.x - s.from.x;
    const dz = s.to.z - s.from.z;
    const lengthSquared = dx * dx + dz * dz;
    const t =
      lengthSquared < 1
        ? 0
        : Math.max(0, Math.min(1, ((pt.x - s.from.x) * dx + (pt.z - s.from.z) * dz) / lengthSquared));
    const cand = { x: s.from.x + dx * t, z: s.from.z + dz * t };
    const d = Math.hypot(pt.x - cand.x, pt.z - cand.z);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}

function distanceToSpans(pt: Vec2, spans: Span[]): number {
  let best = Infinity;
  for (const s of spans) best = Math.min(best, distanceToSegment(pt.x, pt.z, s.from.x, s.from.z, s.to.x, s.to.z));
  return best;
}

/**
 * A handful of roads reaching off the loop into the interior, grown before
 * any house so a house can open onto one of these instead of only the coast
 * road. Each target is a random point well inside the area and well clear of
 * whatever the network already reaches, connected from wherever the network
 * - the loop, or an earlier branch - is already nearest to it. That last part
 * is what forks: a target near an existing branch joins the branch, not the
 * coast.
 */
function growInterior(
  area: PlanArea,
  network: Span[],
  router: Router,
  water: Water,
  land: LandBodies,
  home: number,
  rng: Rng,
): Span[] {
  const bbox = polyBounds(area.poly);
  const targets: Vec2[] = [];
  for (let attempt = 0; attempt < 400 && targets.length < ASHFORD_INTERIOR_COUNT; attempt++) {
    const at = {
      x: bbox.minX + rng.float() * (bbox.maxX - bbox.minX),
      z: bbox.minZ + rng.float() * (bbox.maxZ - bbox.minZ),
    };
    if (!inArea(area.poly, at) || water.isWater(at.x, at.z) || land.at(at.x, at.z) !== home) continue;
    if (distanceToSpans(at, network) < ASHFORD_INTERIOR_SPACING) continue;
    if (targets.some((t) => Math.hypot(t.x - at.x, t.z - at.z) < ASHFORD_INTERIOR_SPACING)) continue;
    targets.push(at);
  }

  const spans: Span[] = [];
  const grown = [...network];
  for (const target of targets) {
    const anchor = nearestOnSpans(target, grown);
    const routed = router.route(anchor, target, ROUTE_ARTERIAL);
    if (routed.length <= 1 || crossesWater(routed, water)) continue;
    const before = spans.length;
    layRoute(routed, water, spans, 'street', area.kind, false);
    grown.push(...spans.slice(before));
  }
  return spans;
}

function crossesWater(line: Vec2[], water: Water): boolean {
  let run = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const mx = (line[i].x + line[i + 1].x) / 2;
    const mz = (line[i].z + line[i + 1].z) / 2;
    run = water.isWater(mx, mz) ? run + 1 : 0;
    if (run >= 2) return true;
  }
  return false;
}

const square = (at: Vec2, side: number): Rect => ({
  minX: at.x - side / 2,
  maxX: at.x + side / 2,
  minZ: at.z - side / 2,
  maxZ: at.z + side / 2,
});

export function localStreetsFor(
  area: PlanArea,
  existing: Span[],
  router: Router,
  water: Water,
  land: LandBodies,
  mapCentre: Vec2,
  rng: Rng,
): { spans: Span[]; blocks: CityBlock[] } {
  const home = land.at(polyCentroid(area.poly).x, polyCentroid(area.poly).z);

  const spine = existing.filter((s) => land.at(s.from.x, s.from.z) === home || land.at(s.to.x, s.to.z) === home);
  if (spine.length === 0) return { spans: [], blocks: [] };

  // Wherever the spine comes closest to the middle of the whole map is
  // wherever it reaches this body of land from the rest of the city - an
  // island's own road reaches inland from the side facing the mainland, and
  // the mainland is toward the map's own centre from an outlying body of
  // land's point of view. That is where a village centre reads as itself.
  let village = spine[0].from;
  let bestDist = Infinity;
  for (const s of spine) {
    for (const p of [s.from, s.to]) {
      const d = Math.hypot(p.x - mapCentre.x, p.z - mapCentre.z);
      if (d < bestDist) {
        bestDist = d;
        village = p;
      }
    }
  }

  const blocks: CityBlock[] = [];
  const placed: Vec2[] = [];
  const lots: { lotCentre: Vec2; lotSide: number }[] = [];

  // Real interior roads, grown before any house - so a house has more to
  // open onto than just the coast road, and so the island has some actual
  // distance to lap for a race rather than one ring with nothing inside it.
  const spans: Span[] = growInterior(area, spine, router, water, land, home, rng);
  const trunk = [...spine, ...spans];

  const tooClose = (at: Vec2, gap: number) => placed.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < gap);

  // A boulevard (the spine) carries `BOULEVARD_LANES`, not this district's
  // own lane count - `generate.ts`'s own `LANES_FOR` table overrides it, the
  // same way it overrides an arterial's. A 'street' (every driveway here) has
  // no override, so it falls back to the district. Missing that the first
  // time through meant lots pulled clear here at half the real boulevard
  // width and then clipped again by the generator's own post-connect sweep,
  // which reads the real width off the finished road.
  const clearFor = (cls: Span['class']) =>
    ((cls === 'boulevard' ? BOULEVARD_LANES : DISTRICTS[area.kind].lanes) * CITY_LANE_WIDTH) / 2 + BOULEVARD_CLEARANCE;

  // A candidate is tried every `spacing`-ish along the spine, and the spine
  // is dozens of short pieces (`layRoute` splits every road into its own
  // point-to-point spans) - so the distance walked has to carry over from
  // one piece to the next. Resetting it at every span meant almost every
  // span was shorter than the spacing target and never got a candidate at
  // all, which is a scatter of six houses on a 4 km² island.
  let untilNext = ASHFORD_LOT_SPACING * 0.3;

  for (const road of trunk) {
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const along = { x: dx / length, z: dz / length };
    const perp = { x: -along.z, z: along.x };

    let at = 0;
    for (;;) {
      if (untilNext > length - at) {
        untilNext -= length - at;
        break;
      }
      at += untilNext;

      const point = { x: road.from.x + along.x * at, z: road.from.z + along.z * at };
      const inVillage = Math.hypot(point.x - village.x, point.z - village.z) < ASHFORD_VILLAGE_RADIUS;
      const spacing = inVillage ? ASHFORD_VILLAGE_SPACING : ASHFORD_LOT_SPACING;
      untilNext = spacing * (1 + rng.range(-ASHFORD_LOT_JITTER, ASHFORD_LOT_JITTER));
      if (!inVillage && rng.chance(ASHFORD_LOT_SKIP)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const driveLength = inVillage
        ? ASHFORD_DRIVE_MIN
        : rng.range(ASHFORD_DRIVE_MIN, ASHFORD_DRIVE_MAX);
      const end = {
        x: point.x + perp.x * driveLength * side,
        z: point.z + perp.z * driveLength * side,
      };
      if (!inArea(area.poly, end) || water.isWater(end.x, end.z) || land.at(end.x, end.z) !== home) continue;

      const gap = inVillage ? ASHFORD_VILLAGE_LOT_GAP : ASHFORD_LOT_GAP;
      if (tooClose(end, gap)) continue;

      const routed = router.route(point, end, ROUTE_ARTERIAL);
      if (routed.length <= 1 || crossesWater(routed, water)) continue;

      // The lot sits *beyond* the driveway's end, not centred on it - a lot
      // this wide (up to 95 m) centred on an end point only 25-70 m off the
      // road put its own near edge back across the road it is meant to face,
      // which is not a lot pulled clear so much as a lot mostly discarded.
      const lotSide = inVillage ? ASHFORD_VILLAGE_LOT_SIDE : ASHFORD_LOT_SIDE;
      const lotCentre = {
        x: end.x + perp.x * (lotSide / 2) * side,
        z: end.z + perp.z * (lotSide / 2) * side,
      };

      // Laid now, but not carved into a block yet. A later driveway further
      // along the spine can still reach into this lot's own ground - blocks
      // are only cut once every driveway on the whole area exists, in the
      // second pass below, or the order candidates happened to be tried in
      // would decide which of two neighbours keeps its lot.
      layRoute(routed, water, spans, 'street', area.kind, false);
      placed.push(end);
      lots.push({ lotCentre, lotSide });
    }
  }

  const network = [...spine, ...spans];
  const overlapsRect = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  for (const { lotCentre, lotSide } of lots) {
    const fitted = pullClear(
      square(lotCentre, lotSide),
      (r) =>
        anyWater(r, water) ||
        network.some((s) => segmentToRect(s.from, s.to, r) < clearFor(s.class)) ||
        blocks.some((b) => overlapsRect(b.bounds, r)),
    );
    if (!fitted) continue;
    const fittedMid = centre(fitted);
    if (land.at(fittedMid.x, fittedMid.z) !== home || !inArea(area.poly, fittedMid)) continue;
    blocks.push({ district: area.kind, bounds: fitted, open: false });
  }

  return { spans, blocks };
}
