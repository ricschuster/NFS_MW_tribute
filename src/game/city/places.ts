/**
 * The named places: a dock, an airfield, a quarry (#271, ADR-0009 rule 5).
 *
 * A district says how streets and blocks are laid out. Half of what a city
 * needs is not laid out in streets and blocks at all - a wharf, a runway and an
 * excavation each have their own geometry and want **a road in** rather than a
 * grid over, and forcing them through `DistrictKind` is how the port came to
 * define a quarter of Kestrel Bay's street layout.
 *
 * Two things happen here, in this order, and the order is the whole design.
 *
 * **The ground is shaped first.** A runway is flat or it is not a runway, and a
 * quarry is a hole. Both are terrain edits, and they run before a single road is
 * laid so that everything downstream - the router, the grade caps, the block
 * fitting, the sim's own `groundAt` - sees the ground as it will be. This is the
 * displacement ADR-0007 said the height field was baked rather than computed
 * *for*: a formula cannot be dug into.
 *
 * **Then the place's own roads go in**, as ordinary spans, before the graph is
 * built - the same way `boulevards.ts` and `embankment.ts` do it, so they are
 * clipped against the water, split at every crossing and repaired by the same
 * code as everything else. Nothing here builds a graph of its own.
 *
 * The lookout is not here. It is a destination on the hill park's summit and it
 * wants the road that climbs to it, which is the canyon run and not yet built.
 */
import {
  DOCK_APRON,
  DOCK_LEVEL,
  DOCK_PIERS,
  DOCK_PIER_LENGTH,
  PLACE_BLEND,
  QUARRY_BENCH,
  QUARRY_DEPTH,
  QUARRY_FLOOR,
  QUARRY_RAMP_TURNS,
  RUNWAY_APRON,
  RUNWAY_WIDTH,
  TAXIWAY_OFFSET,
} from '../constants';
import { PLAN_PLACES, PLAN_RUNWAY } from './plan';
import { groundAt, type Terrain } from './terrain';
import type { Vec2 } from './types';
import type { Water } from './water';

/** A road a place brings with it, as a polyline to be laid like any other. */
export interface PlaceRoad {
  line: Vec2[];
  /** Closed roads - a taxiway circuit, a quay loop - join their own ends. */
  loop: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** How far a point is from a segment, and how far along it that lands. */
function toSegment(a: Vec2, b: Vec2, p: Vec2): { away: number; along: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const span = dx * dx + dz * dz;
  const t = span < 1 ? 0 : clamp01(((p.x - a.x) * dx + (p.z - a.z) * dz) / span);
  return { away: Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z), along: t };
}

/**
 * Walk every terrain cell that could be within `reach` of a place and offer it a
 * new height.
 *
 * `shape` returns the height it wants, or null to leave the cell alone. The
 * bounding box is worked out from the reach rather than the whole field, because
 * this runs three times over a 10 x 8 km grid and the places are hundreds of
 * metres across.
 */
function reshape(
  terrain: Terrain,
  centre: Vec2,
  reach: number,
  shape: (at: Vec2, was: number) => number | null,
): void {
  const { cells, cols, rows, cell, bounds } = terrain;
  const minCol = Math.max(0, Math.floor((centre.x - reach - bounds.minX) / cell));
  const maxCol = Math.min(cols - 1, Math.ceil((centre.x + reach - bounds.minX) / cell));
  const minRow = Math.max(0, Math.floor((centre.z - reach - bounds.minZ) / cell));
  const maxRow = Math.min(rows - 1, Math.ceil((centre.z + reach - bounds.minZ) / cell));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const i = row * cols + col;
      const at = { x: bounds.minX + col * cell, z: bounds.minZ + row * cell };
      const want = shape(at, cells[i]);
      if (want !== null) cells[i] = want;
    }
  }
}

/**
 * Dig the places into the ground.
 *
 * Runs before any road is laid, so the router prices the runway's flat and the
 * quarry's walls rather than the hillside they replaced.
 */
export function shapeForPlaces(terrain: Terrain, water: Water): void {
  for (const place of PLAN_PLACES) {
    if (place.kind === 'airfield') levelRunway(terrain, water);
    if (place.kind === 'quarry') digQuarry(terrain, place.at, place.radius);
    if (place.kind === 'docks') levelDocks(terrain, water, place.at, place.radius);
  }
}

/**
 * Level the strip under the runway, and grade out from it.
 *
 * The target is the **mean** ground along the centreline rather than its lowest
 * or highest point: the island runs -2 m to 22 m under the line, so cutting to
 * the low end would put a 20 m face across the island and filling to the high
 * end would put the strip on an embankment out over the water at the near end.
 * Mean is a cut at one end and a fill at the other, which is what levelling a
 * strip of ground actually is.
 */
function levelRunway(terrain: Terrain, water: Water): void {
  const [a, b] = PLAN_RUNWAY;
  let sum = 0;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    sum += groundAt(terrain, lerp(a.x, b.x, i / steps), lerp(a.z, b.z, i / steps));
  }
  const target = sum / (steps + 1);

  const half = RUNWAY_WIDTH / 2 + TAXIWAY_OFFSET + RUNWAY_APRON;
  const middle = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const reach = Math.hypot(b.x - a.x, b.z - a.z) / 2 + half + PLACE_BLEND;
  reshape(terrain, middle, reach, (at, was) => {
    // The water keeps its bed: an airfield does not reclaim the sea.
    if (water.isWater(at.x, at.z)) return null;
    const { away } = toSegment(a, b, at);
    if (away > half + PLACE_BLEND) return null;
    if (away <= half) return target;
    return lerp(target, was, (away - half) / PLACE_BLEND);
  });
}

/**
 * Cut the quarry: a stepped bowl, benched rather than smooth.
 *
 * A quarry does not need pre-existing drama because it *is* an excavation - it
 * cuts its own walls, which is where the tunnels and the bridges over the
 * workings come from. The benches are what make it read as worked ground rather
 * than as a crater: the floor is quantised to `QUARRY_BENCH`, so the sides come
 * out as a flight of terraces at whatever grade the radius gives them.
 *
 * It never cuts below `QUARRY_FLOOR`. Below sea level the hole would be a hole
 * with no water in it - the water is a field and knows nothing about height -
 * and a dry pit under the sea reads as a bug in the terrain.
 */
function digQuarry(terrain: Terrain, at: Vec2, radius: number): void {
  const rim = groundAt(terrain, at.x, at.z);
  const floor = Math.max(QUARRY_FLOOR, rim - QUARRY_DEPTH);
  reshape(terrain, at, radius + PLACE_BLEND, (p, was) => {
    const away = Math.hypot(p.x - at.x, p.z - at.z);
    if (away > radius + PLACE_BLEND) return null;
    // Outside the rim, blend back into the hillside.
    if (away > radius) return lerp(was, Math.min(was, rim), 1 - (away - radius) / PLACE_BLEND);
    // A cosine bowl rather than a cone, so the floor is flat and the walls
    // steepen toward the rim the way a worked face does.
    const t = away / radius;
    const smooth = floor + (rim - floor) * (0.5 - Math.cos(Math.PI * t) / 2);
    const benched = floor + Math.round((smooth - floor) / QUARRY_BENCH) * QUARRY_BENCH;
    return Math.min(was, benched);
  });
}

/** Flatten the wharf apron. A dock is level ground beside deep water. */
function levelDocks(terrain: Terrain, water: Water, at: Vec2, radius: number): void {
  reshape(terrain, at, radius + PLACE_BLEND, (p, was) => {
    if (water.isWater(p.x, p.z)) return null;
    const away = Math.hypot(p.x - at.x, p.z - at.z);
    if (away > radius + PLACE_BLEND) return null;
    if (away <= radius) return DOCK_LEVEL;
    return lerp(DOCK_LEVEL, was, (away - radius) / PLACE_BLEND);
  });
}

/**
 * The roads each place is made of.
 *
 * Laid as ordinary spans before the graph exists, so the clip, the junction
 * splitting and the connectivity repair all apply. Nothing here is a special
 * case downstream - a runway is a very wide straight road with a taxiway beside
 * it, and a quarry road is a switchback.
 */
export function placeRoads(terrain: Terrain, water: Water): PlaceRoad[] {
  const roads: PlaceRoad[] = [];
  for (const place of PLAN_PLACES) {
    if (place.kind === 'airfield') roads.push(...airfieldRoads());
    if (place.kind === 'quarry') roads.push(...quarryRoads(terrain, place.at, place.radius));
    if (place.kind === 'docks') roads.push(...dockRoads(water, place.at, place.radius));
  }
  return roads;
}

/**
 * The runway, and a taxiway beside it joined at both ends.
 *
 * A strip on its own is a straight line you drive up and turn round at the end
 * of. Paired with a taxiway it is a circuit, which is the difference between a
 * feature and a cul-de-sac 2.3 km long - and it is what an airfield looks like
 * from the air anyway.
 */
function airfieldRoads(): PlaceRoad[] {
  const [a, b] = PLAN_RUNWAY;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = -(b.z - a.z) / length;
  const nz = (b.x - a.x) / length;
  const off = RUNWAY_WIDTH / 2 + TAXIWAY_OFFSET;
  // Pulled in at both ends, so the taxiway's turn is inside the levelled ground
  // rather than out on the blend where the runway meets the hillside.
  const inset = 0.06;
  const at = (t: number, side: number): Vec2 => ({
    x: lerp(a.x, b.x, t) + nx * off * side,
    z: lerp(a.z, b.z, t) + nz * off * side,
  });
  return [
    { line: [a, b], loop: false },
    {
      line: [at(inset, 1), at(1 - inset, 1), at(1 - inset, -1), at(inset, -1)],
      loop: true,
    },
  ];
}

/**
 * A road down into the quarry: a switchback that loses height on every turn.
 *
 * Not a spiral of one radius - that is a helix, and a helix inside a bowl is a
 * road cut into the wall the whole way round, which is a tunnel with the roof
 * off. It steps in as it descends, so each leg sits on the bench below the last.
 */
function quarryRoads(terrain: Terrain, at: Vec2, radius: number): PlaceRoad[] {
  const line: Vec2[] = [];
  const turns = QUARRY_RAMP_TURNS;
  const steps = Math.round(turns * 16);
  const start = Math.atan2(1, 0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = start + t * turns * Math.PI * 2;
    // From just inside the rim to the middle of the floor.
    const r = radius * lerp(0.92, 0.16, t);
    line.push({ x: at.x + Math.cos(angle) * r, z: at.z + Math.sin(angle) * r });
  }
  // The rim road, so the descent has something to leave from and the workings
  // can be looked at from above without driving into them.
  const rim: Vec2[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const r = radius + PLACE_BLEND * 0.5;
    const p = { x: at.x + Math.cos(angle) * r, z: at.z + Math.sin(angle) * r };
    // A rim road only where there is rim: the bowl can sit against a coast.
    if (groundAt(terrain, p.x, p.z) > QUARRY_FLOOR) rim.push(p);
  }
  const roads: PlaceRoad[] = [{ line, loop: false }];
  if (rim.length > 8) roads.push({ line: rim, loop: true });
  return roads;
}

/**
 * The wharves: a road along the apron and the piers running off it.
 *
 * The piers are what make it a port rather than a car park by the sea, and they
 * are dead ends on purpose - a pier is somewhere a pursuit can corner you, which
 * is the whole argument for putting the docks on an island (ADR-0009 rule 6).
 */
function dockRoads(water: Water, at: Vec2, radius: number): PlaceRoad[] {
  const roads: PlaceRoad[] = [];
  const apron: Vec2[] = [];
  const sides = 14;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    apron.push({ x: at.x + Math.cos(angle) * DOCK_APRON, z: at.z + Math.sin(angle) * DOCK_APRON });
  }
  roads.push({ line: apron, loop: true });

  // Piers go where there is water to put them in, found by looking outward.
  for (let i = 0; i < DOCK_PIERS; i++) {
    const angle = ((i + 0.5) / DOCK_PIERS) * Math.PI * 2;
    const from = {
      x: at.x + Math.cos(angle) * DOCK_APRON,
      z: at.z + Math.sin(angle) * DOCK_APRON,
    };
    const to = {
      x: from.x + Math.cos(angle) * DOCK_PIER_LENGTH,
      z: from.z + Math.sin(angle) * DOCK_PIER_LENGTH,
    };
    // Only where the pier would actually reach the water, and only where it
    // stays inside the place: a jetty across dry ground is a road to nowhere.
    if (!water.isWater(to.x, to.z)) continue;
    if (Math.hypot(to.x - at.x, to.z - at.z) > radius + DOCK_PIER_LENGTH) continue;
    roads.push({ line: [from, to], loop: false });
  }
  return roads;
}
