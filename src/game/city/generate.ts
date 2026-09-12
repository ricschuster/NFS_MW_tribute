import {
  CITY_WIDTH,
  CITY_DEPTH,
  CITY_ARTERIAL_SPACING,
  CITY_AUTHORED_ROADS,
  CITY_FREEWAY,
  CITY_STREET_GRID,
  CITY_BODY_CELL,
  CITY_ARTERIAL_JITTER,
  CITY_ARTERIAL_LANES,
  CITY_ARTERIAL_SPEED,
  CITY_LANE_WIDTH,
  CITY_LAND_STREAM,
  CITY_BRIDGES,
  CITY_MAX_BRIDGE,
  CITY_BRIDGE_SPACING,
  CITY_CLIP_STEP,
  CITY_MIN_STREET,
  BOULEVARD_CLEARANCE,
  CITY_MIN_BODY,
  ROUTE_ARTERIAL,
  ROUTE_COUNTRY,
  EMBANKMENT_SETBACK,
  CAR_RADIUS,
  DECK_HEADROOM,
  DECK_MIN_BUILDING,
  RAMP_CLEARANCE,
  BOULEVARD_LANES,
  BOULEVARD_SPEED,
  DENSITY_RANGE,
  OPEN_BLOCK_CHANCE,
  WINDING_BOW,
  WINDING_STEP,
  DISTRICTS,
} from '../constants';
import { Rng } from './rng';
import { buildingsOn } from './buildings';
import { furnitureFor } from './furniture';
import { collectiblesFor } from './collectibles';
import { parksFor } from './parks';
import { findsFor } from './streetfinds';
import { routesFor } from './routes';
import { ambushesFor } from './ambushes';
import { repairsFor } from './repairs';
import { breakablesFor } from './breakables';
import { addInterstate, draftLoop } from './interstate';
import { boulevardRoutes } from './boulevards';
import { embankmentRoutes } from './embankment';
import { makeWater, nearWater, type Water } from './water';
import { groundAt, makeTerrain, type Terrain } from './terrain';
import { makeRouter } from './routing';
import { inArea, PLAN_DISTRICTS, PLAN_PLACES, planDensityAt, planDistrictAt } from './plan';
import { placeApproach, placeRoads, shapeForPlaces } from './places';
import { landBodies, type LandBodies } from './bodies';
import { AUTHORED_ROADS } from './roads';
import { cutAndFill } from './cutfill';
import { SegmentIndex, segmentIntersection, segmentToRect } from './grid';
import type {
  Axis,
  Building,
  City,
  CityBlock,
  CityNode,
  CityRoad,
  DistrictKind,
  Rect,
  RoadClass,
  Superblock,
  Vec2,
} from './types';

/**
 * Generate Kestrel Bay from a seed (issue #83; ADR-0005 for its shape).
 *
 * Water comes first and land second, which is the point of ADR-0005: a bay eats
 * into the north edge and a river runs inland from it, and the street network
 * is cut against them rather than drawn around them. The passes run largest to
 * smallest:
 *
 *  1. **Water.** A wandering shoreline, and a river that severs the city.
 *  2. **Arterials.** A handful of roads crossing the whole city. They are laid
 *     before anything else because every later street runs from one arterial to
 *     another, which is what keeps the network connected on land.
 *  3. **Districts.** The cells between the arterials get a character each, from
 *     seeded anchors: a downtown, a harbour, an industrial edge.
 *  4. **Streets.** Each cell is divided into blocks at its district's spacing.
 *  5. **The cut.** Every road is clipped to the land, and a chosen few of the
 *     water gaps become bridges.
 *  6. **The repair.** Cutting a network can strand a district, so generation
 *     ends by proving the city is drivable and fixing it if it is not.
 *  7. **Boulevards and the interstate.** Curves laid over the finished grid,
 *     and an elevated circuit over all of it.
 *  7b. **The interstate.** An elevated circuit on its own alignment, joined to
 *     the streets only by ramps. See `interstate.ts`: this is the one ADR-0004
 *     was written for.
 *  8. **Buildings and furniture.** Each block is divided into lots and built
 *     on, and the finished streets get lamps, signs and bridge parapets. Both
 *     are descriptions and never meshes: see `buildings.ts`, `furniture.ts`.
 *
 * Roads are axis-aligned, which keeps blocks rectangular for the extrusions in
 * #84 and "which road am I on" cheap for #86. ADR-0005 rule 4 ends that for the
 * residential streets, and records the cost there rather than leaving it to be
 * discovered.
 *
 * Pure: same seed, same city, no `Math.random`, no DOM.
 */
export function generateCity(seed: number): City {
  const rng = new Rng(seed);

  const bounds: Rect = {
    minX: -CITY_WIDTH / 2,
    minZ: -CITY_DEPTH / 2,
    maxX: CITY_WIDTH / 2,
    maxZ: CITY_DEPTH / 2,
  };

  // The land is authored and does not vary with the seed (ADR-0009 rule 2):
  // the plan is polygons in world metres, and a coastline that moved under them
  // would make them mean nothing.
  const water = makeWater(new Rng(CITY_LAND_STREAM), bounds);
  // The land the city stands on (ADR-0007). Water first, and the height field
  // shaped to agree with it - which is why this is here and not earlier.
  const terrain = makeTerrain(CITY_LAND_STREAM, bounds, water);
  // The places are dug into the ground **before** anything is laid on it
  // (ADR-0009 rule 5): a runway is flat or it is not a runway, and a quarry is a
  // hole. Everything downstream - the router's grades, the block fitting, the
  // sim's own `groundAt` - then sees the ground as it will be rather than the
  // hillside it replaced.
  shapeForPlaces(terrain, water);
  // And cut and fill the roads into it (#252). After the places, because a road
  // to the quarry is graded against the quarry and not the hill it replaced;
  // before anything is laid, so the network, the blocks and the sim's own
  // `groundAt` all see the shelf rather than the hillside.
  if (CITY_AUTHORED_ROADS) cutAndFill(terrain, AUTHORED_ROADS);

  // Which body of land each point is on. Wanted in three places now - the roads
  // between the bodies, the blocks that must not cross a channel, and the places.
  const land = landBodies(bounds, water);

  const cols = Math.round((bounds.maxX - bounds.minX) / CITY_ARTERIAL_SPACING) + 1;
  const rows = Math.round((bounds.maxZ - bounds.minZ) / CITY_ARTERIAL_SPACING) + 1;
  const xLines = arterialLines(rng, bounds.minX, bounds.maxX, cols);
  const zLines = arterialLines(rng, bounds.minZ, bounds.maxZ, rows);

  // A cell with no land in it is open water: no streets, no blocks, no district.
  //
  // And a cell outside every district in the plan is **country**: the grid stops
  // there (ADR-0009 rule 3). It used to run over every cell of the rectangle,
  // which made the whole map one even sprawl, and then over a radius around the
  // town, which left four of the five bodies of land with no city on them at
  // all. `builtUp` is the line between the two, and everything outside it is
  // what #260 will fill with roads that are not city.
  const onLand = cellsBetween(xLines, zLines).filter((cell) => !allWater(cell, water));
  const cells = onLand.filter((cell) => builtUp(centre(cell)));
  const districts = assignDistricts(cells);
  // Each superblock gets its own density, so the city has thin quarters and
  // dense ones rather than one even spread of buildings.
  const superblocks: Superblock[] = cells.map((c, i) => ({
    bounds: c,
    district: districts[i],
    // The plan's own density for this area multiplies the roll, so two areas of
    // the same kind can be different places: the northern midtown is the edge of
    // the city and the one behind downtown is an inner suburb.
    density: (1 + rng.range(-DENSITY_RANGE, DENSITY_RANGE)) * planDensityAt(centre(c)),
    // Whether the streets here bend. Decided per quarter for the same reason
    // density is: a city where every street bends a little is a wobbly grid,
    // where a winding quarter beside a gridded one is two neighbourhoods.
    winding: rng.chance(DISTRICTS[districts[i]].winding),
  }));

  const laid: Span[] = [];
  const blocks: CityBlock[] = [];

  const router = makeRouter(bounds, terrain, water);

  // The street grid, when there is one. Superblocks are assigned either way,
  // because they carry the district a piece of ground belongs to and everything
  // downstream reads that; with the grid off they simply have nothing in them.
  const arterialHalf = roadWidth(CITY_ARTERIAL_LANES) / 2;
  if (CITY_STREET_GRID) {
    // The arterials are the grid's spine and they stop where the grid does. Run
    // to the map edge and they are six lanes of nothing crossing open country to
    // a coast with no town on it.
    for (const x of xLines) {
      for (const run of builtRuns({ x, z: bounds.minZ }, { x, z: bounds.maxZ })) {
        laid.push({ from: run.from, to: run.to, axis: 'z', class: 'arterial', district: 'midtown' });
      }
    }
    for (const z of zLines) {
      for (const run of builtRuns({ x: bounds.minX, z }, { x: bounds.maxX, z })) {
        laid.push({ from: run.from, to: run.to, axis: 'x', class: 'arterial', district: 'midtown' });
      }
    }
    for (const cell of superblocks) {
      fillSuperblock(rng, cell, arterialHalf, water, land, laid, blocks);
    }
  }

  if (CITY_AUTHORED_ROADS) {
    // **The roads are drawn** (`city/roads.ts`).
    //
    // Laid through `layRoute` like every other routed road, and for the reason
    // that function exists: a drawn road arrives as a chain of short pieces, and
    // `clip` looks for a gap *inside* a span, so a crossing that falls between
    // two pieces is never offered as a bridge candidate. `layRoute` lays each
    // crossing as one span from bank to bank, which is the shape `clip` knows.
    //
    // Every one of them is `required`. The author decided where this city
    // crosses its water; the spacing rule in `chooseBridges` is for picking
    // among crossings nobody chose.
    for (const road of AUTHORED_ROADS) {
      layRoute(road.points, water, laid, road.kind, road.district, true);
    }
  } else {
  // Boulevards go in as ordinary spans, so they are cut against the water and
    // split at every crossing by the same code as everything else.
    //
    // **Routed, not swept** (ADR-0008 rule 2). `boulevardRoutes` still picks where
    // one starts and ends - across the map, spread out, alternating sides - and
    // the router decides how it gets there. A swept curve is a quadratic bowed by
    // a random number, and a random number knows nothing about the ground: it
    // reads as a line drawn on a map because that is what it is. A routed one
    // bends because the hill is there.
    for (const route of boulevardRoutes(rng, bounds)) {
      const line = router.route(route[0], route[route.length - 1], ROUTE_ARTERIAL);
      layRoute(line.length > 1 ? line : route, water, laid);
    }

    // And the roads that follow the water, in the same way and for the same
    // reason (#241). A street cut off by the river used to end at the bank; now
    // it ends onto the embankment, which is what a street meeting a river
    // actually does.
    //
    // A boulevard, because that is what this codebase calls a road that bends:
    // arterials are asserted to be axis-aligned - they are the grid's spine - and
    // blocks are already swept clear of boulevards. Classing it as an arterial
    // broke both of those, which is the tests earning their keep.
    for (const route of embankmentRoutes(water, builtUp)) {
      for (let i = 1; i < route.length; i++) {
        laid.push({
          from: route[i - 1],
          to: route[i],
          class: 'boulevard',
          district: 'waterfront',
          embankment: true,
        });
      }
    }

    // A road to each of the other bodies of land, from a district on this side to
    // a district on that one, **routed** over the ground rather than drawn across
    // it (ADR-0008 rule 2).
    //
    // Two things make these necessary at all. `clip` only offers a gap as a
    // bridge candidate where an arterial or a boulevard crosses water, and
    // bounding the grid to the built-up area (rule 3) stopped the arterials well
    // short of the coast - so the roads that used to cross the channels by
    // accident stopped existing, no gap was ever a candidate, and `prune` deleted
    // every district across the water. Measured: three bodies of land and *zero*
    // bridges.
    //
    // Routed rather than laid, because a straight line between two lobes crosses
    // whatever is in the way. The router prices water per metre, so it finds the
    // narrows on its own and the crossing chooses itself; and it prices the
    // square of the gradient, so it arrives at the water along the ground rather
    // than over a ridge.
    const links = linkRoutes(water, land);
    for (const link of links) {
      layRoute(router.route(link.from, link.to, ROUTE_ARTERIAL), water, laid, 'boulevard', 'midtown', true);
    }

    // The places, and the road in to each (#271). Their own roads go in as
    // ordinary spans for the same reason the boulevards and the embankment do -
    // the clip, the junction splitting and the connectivity repair are all one
    // piece of code and nothing here should have a second copy of them.
    for (const road of placeRoads(terrain, water)) {
      const line = road.loop ? [...road.line, road.line[0]] : road.line;
      for (let i = 1; i < line.length; i++) {
        laid.push({ from: line[i - 1], to: line[i], class: 'boulevard', district: 'industrial' });
      }
    }
    // And a road *to* each place, routed over the ground. A place with no way in
    // is scenery, and `prune` deletes it: the docks, the airfield and the quarry
    // are each on a different body of land, so the road in is the thing that makes
    // four of the five crossings earn themselves.
    for (const place of PLAN_PLACES) {
      if (place.kind === 'lookout') continue;
      const body = land.at(place.at.x, place.at.z);
      const link = links.find((l) => l.body === body);
      const from = link ? link.to : nearestDistrictAnchor(place.at, water, land, body);
      if (!from) continue;
      // Stopping where the place begins, which is not always the middle of it: a
      // quarry's middle is the floor of the pit, and a road routed to it drives
      // down the workings.
      layRoute(router.route(from, placeApproach(place, from, terrain), ROUTE_ARTERIAL), water, laid, 'boulevard', 'midtown', true);
    }

    // Kestrel Head to Halloway Quarry: the lookout on the main body's summit to
    // the quarry on the eastern one.
    //
    // The two ends are what make it worth having. It starts at 116 m on the
    // steepest ground on the map, so the router has to switchback down off the
    // massif; it crosses to another body of land, so it brings a bridge; and it
    // ends 60 m up in an excavation. `ROUTE_COUNTRY` rather than the arterial
    // profile: this is a road between two places and not a city street, so it
    // tolerates a steeper grade and minds the shore more.
    {
      const head = PLAN_PLACES.find((p) => p.kind === 'lookout');
      const pit = PLAN_PLACES.find((p) => p.kind === 'quarry');
      if (head && pit) {
        layRoute(router.route(head.at, pit.at, ROUTE_COUNTRY), water, laid, 'boulevard', 'midtown', true);
      }
    }
  }

  // Cut the network against the water, keeping what crosses it as candidates.
  const dry: Span[] = [];
  const gaps: Gap[] = [];
  for (const span of laid) clip(span, water, dry, gaps);

  const { nodes, roads } = connect(dry, gaps, chooseBridges(gaps), water, terrain);

  // Blocks are checked against the water at block resolution, which a river
  // can slip through at building resolution. Buildings are cheap to test
  // exactly, so test them exactly rather than widening the block probe.
  // The interstate goes on after the surface network is whole, and joins it
  // only through its ramps. It is deliberately not part of the connectivity
  // repair above: the surface city has to stand up without it.
  // draftLoop stands in for a hand-routed one (#261) until there is one to
  // pass instead - it reproduces today's rectangle-inset-from-the-land as an
  // authored four-point path, so addInterstate never computes its own shape.
  if (CITY_FREEWAY) addInterstate(rng, bounds, nodes, roads, water, terrain, draftLoop(bounds, water));

  // A boulevard runs through ground the grid had already parcelled up, so the
  // blocks it crosses have to make way for it.
  //
  // Asked through a `SegmentIndex` rather than by scanning every boulevard for
  // every block: this sweep and the two below it were half the cost of
  // generating the city (#262). The index returns a superset of what could be
  // in range, so the test below is the same test it always was.
  // Arterials are in here with the boulevards now that they bend. Blocks are
  // measured off the superblock's rectangle and inset by half an arterial, which
  // was exact while an arterial ran dead straight along the cell's edge; a
  // routed one wanders in and out of the block it used to bound.
  const swept = new SegmentIndex(
    roads.filter((road) => road.class === 'boulevard' || road.class === 'arterial'),
    nodes,
    (road) => road.width / 2 + BOULEVARD_CLEARANCE,
  );
  const onBoulevard = (r: Rect) =>
    swept.near(r).some((road) => {
      const a = nodes[road.a].pos;
      const b = nodes[road.b].pos;
      return segmentToRect(a, b, r) < road.width / 2 + BOULEVARD_CLEARANCE;
    });

  // A ramp comes down through ground the grid had already parcelled up, and
  // unlike a boulevard it only needs the room where it is *low*: the sim treats
  // blocks as solid below `CAR_RADIUS * 2`, so a ramp above that flies over
  // rooftops and a ramp below it walls the car in against whatever it passes.
  // Clearing only the low stretch is what keeps the interstate looking like it
  // was threaded through the city rather than bulldozed across it (#212).
  // A margin over the height blocks stop mattering at, because the car has to
  // be *clear* of a block rather than level with its roofline as it goes by.
  const solidTo = CAR_RADIUS * 3;
  const climbing = new SegmentIndex(
    roads.filter((road) => road.class === 'ramp'),
    nodes,
    (road) => road.width / 2 + RAMP_CLEARANCE,
  );
  const underRamp = (r: Rect) =>
    climbing.near(r).some((road) => {
      const a = nodes[road.a];
      const b = nodes[road.b];
      if (segmentToRect(a.pos, b.pos, r) > road.width / 2 + RAMP_CLEARANCE) return false;
      // How high the ramp is where it passes this block - at its *lowest*, over
      // the block's whole extent. Projecting only the middle reads a long block
      // as higher than its near end, which left five ramps walled in at 3-4 m
      // by the corner of a block the test had cleared on its centre.
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const span = dx * dx + dz * dz;
      let lowest = Infinity;
      for (const [px, pz] of [
        [r.minX, r.minZ],
        [r.maxX, r.minZ],
        [r.minX, r.maxZ],
        [r.maxX, r.maxZ],
      ]) {
        const t =
          span < 1 ? 0 : Math.max(0, Math.min(1, ((px - a.pos.x) * dx + (pz - a.pos.z) * dz) / span));
        lowest = Math.min(lowest, a.y + (b.y - a.y) * t);
      }
      return lowest < solidTo;
    });

  const standing: CityBlock[] = [];
  for (const block of blocks) {
    // Trim against the water as well as the boulevard: pulling a block back
    // moves its corners, and the water test samples corners, so a block that
    // was clear can stop being clear once it has been trimmed.
    const fitted = pullClear(block.bounds, (r) => onBoulevard(r) || underRamp(r) || anyWater(r, water));
    if (fitted) standing.push({ ...block, bounds: fitted });
  }
  blocks.length = 0;
  blocks.push(...standing);

  // How built up a block is comes from the superblock it sits in, so the whole
  // quarter thins together rather than block by block.
  const densityAt = (block: CityBlock) => {
    const x = (block.bounds.minX + block.bounds.maxX) / 2;
    const z = (block.bounds.minZ + block.bounds.maxZ) / 2;
    const cell = superblocks.find(
      (s) => x >= s.bounds.minX && x <= s.bounds.maxX && z >= s.bounds.minZ && z <= s.bounds.maxZ,
    );
    return cell?.density ?? 1;
  };

  // How high the elevated road is over a point, or null where it does not pass.
  //
  // The interstate is 12 m up and the median building here is 21 m, so it went
  // straight through them: 197 of the 255 places it crosses a footprint had the
  // building standing above the road surface, the worst by 105 m. A deck that
  // is drawn *through* a tower is the most conspicuous thing in an aerial shot
  // of the city and it had been there since the interstate was built.
  //
  // Held under rather than swept away, because an elevated road over a city
  // ought to have something beneath it.
  const overhead = new SegmentIndex(
    roads.filter((r) => r.class === 'interstate' || r.class === 'ramp'),
    nodes,
    (road) => road.width / 2 + RAMP_CLEARANCE,
  );
  const deckOver = (r: Rect): number | null => {
    let lowest: number | null = null;
    for (const road of overhead.near(r)) {
      const a = nodes[road.a];
      const b = nodes[road.b];
      if (segmentToRect(a.pos, b.pos, r) > road.width / 2 + RAMP_CLEARANCE) continue;
      // The deck's height where it passes this footprint, at its lowest over
      // the whole rectangle - a ramp is a slope, so which end matters.
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const span = dx * dx + dz * dz;
      for (const [px, pz] of [
        [r.minX, r.minZ],
        [r.maxX, r.minZ],
        [r.minX, r.maxZ],
        [r.maxX, r.maxZ],
      ]) {
        const t =
          span < 1 ? 0 : Math.max(0, Math.min(1, ((px - a.pos.x) * dx + (pz - a.pos.z) * dz) / span));
        const y = a.y + (b.y - a.y) * t;
        if (lowest === null || y < lowest) lowest = y;
      }
    }
    return lowest;
  };

  const buildings: Building[] = [];
  for (const block of blocks) {
    if (block.open) continue;
    let built = 0;
    for (const building of buildingsOn(rng, block, densityAt(block))) {
      if (anyWater(building.footprint, water)) continue;
      const deck = deckOver(building.footprint);
      if (deck !== null) {
        const room = deck - DECK_HEADROOM;
        // Too little headroom to put anything under: leave the ground open,
        // which #185's parkland then covers like any other empty land.
        if (room < DECK_MIN_BUILDING) continue;
        if (building.height > room) building.height = room;
      }
      buildings.push(building);
      built++;
    }
    // A block that ended up with nothing on it is open ground, whatever the
    // roll said. Left as a paved block it reads as an enormous empty forecourt.
    if (built === 0) block.open = true;
  }

  const city: City = {
    seed,
    bounds,
    water: water.bodies,
    terrain,
    nodes,
    roads,
    blocks,
    superblocks,
    buildings,
    furniture: [],
    collectibles: [],
    finds: [],
    routes: [],
    ambushes: [],
    repairs: [],
    breakables: [],
  };
  // Whatever the street grid did not claim becomes parkland (#185). After the
  // blocks and before anything that reads them, and before the furniture in
  // particular: a lamp belongs on a kerb, and the leftovers have no kerbs.
  city.blocks.push(...parksFor(city, water, land));
  // Furniture is placed from the finished road graph, so it goes on kerbs that
  // actually exist rather than on ones that were bridged or pruned away.
  city.furniture = furnitureFor(rng, city);
  // Collectibles come last, off the finished graph and the finished buildings:
  // a billboard is placed on a kerb that exists and out of a wall that does.
  city.collectibles = collectiblesFor(rng, city);
  // Street Finds go on the open blocks, which are only settled once the
  // buildings are placed: a block that ended up with nothing on it is open
  // whatever the roll said.
  city.finds = findsFor(rng, city);
  // Routes come off the finished graph: a lap has to be a loop of roads that
  // survived the water-clipping and the connectivity repair, not of ones that
  // were laid out and then pruned.
  city.routes = routesFor(city);
  city.ambushes = ambushesFor(city);
  city.repairs = repairsFor(city);
  city.breakables = breakablesFor(rng, city);
  return city;
}

/**
 * A road centreline before it is cut at its crossings.
 *
 * A segment between two points, not a coordinate on an axis. That is what lets
 * a boulevard go through the same pipeline as a street: cut against the water,
 * split at every crossing, repaired if it strands anything. `axis` survives
 * only as a fast path - most spans really are axis-aligned, and knowing it
 * turns a crossing test into two comparisons.
 */
interface Span {
  from: Vec2;
  to: Vec2;
  class: RoadClass;
  district: DistrictKind;
  bridge?: boolean;
  /**
   * This span is not optional: neither its crossing nor the runs either side.
   *
   * `chooseBridges` picks crossings for where they are (#247), which is right
   * for the ones inside the city and wrong for the one road that reaches a body
   * of land. A link route is the *only* way onto its island, so a spacing rule
   * that declines it does not thin the crossings out - it deletes a district,
   * and `prune` then deletes every road on it. Measured: the waterfront, the
   * quarry and the docks all vanished at once when the routed arterials stopped
   * leaving spare gaps for the chooser to find.
   */
  required?: boolean;
  embankment?: boolean;
  axis?: Axis;
}

/** A stretch of water a road would have to cross: a bridge, or a dead end. */
interface Gap {
  span: Span;
  /** Where the land ends and starts again, as fractions along the span. */
  from: number;
  to: number;
  length: number;
}

const spanLength = (span: Span) =>
  Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z);

/** A point a fraction `t` along a span. */
function pointAt(span: Span, t: number): Vec2 {
  return {
    x: span.from.x + (span.to.x - span.from.x) * t,
    z: span.from.z + (span.to.z - span.from.z) * t,
  };
}

/** Where two spans cross, or null. Axis-aligned pairs take the cheap route. */
function crossing(a: Span, b: Span): Vec2 | null {
  if (a.axis && b.axis) {
    if (a.axis === b.axis) return null;
    const [along, across] = a.axis === 'x' ? [a, b] : [b, a];
    const x = across.from.x;
    const z = along.from.z;
    if (x < Math.min(along.from.x, along.to.x) || x > Math.max(along.from.x, along.to.x)) return null;
    if (z < Math.min(across.from.z, across.to.z) || z > Math.max(across.from.z, across.to.z)) return null;
    return { x, z };
  }
  return segmentIntersection(a.from, a.to, b.from, b.to);
}

function roadWidth(lanes: number): number {
  return lanes * CITY_LANE_WIDTH;
}

/** Road classes that carry their own lane count and speed, whatever district they cross. */
const LANES_FOR: Partial<Record<RoadClass, number>> = {
  arterial: CITY_ARTERIAL_LANES,
  boulevard: BOULEVARD_LANES,
};
const SPEED_FOR: Partial<Record<RoadClass, number>> = {
  arterial: CITY_ARTERIAL_SPEED,
  boulevard: BOULEVARD_SPEED,
};

/**
 * Positions for `count` arterials spanning [min, max], both edges included.
 * Interior ones wander, so the city is not an even lattice.
 */
function arterialLines(rng: Rng, min: number, max: number, count: number): number[] {
  const spacing = (max - min) / (count - 1);
  const wander = spacing * CITY_ARTERIAL_JITTER;
  const lines = [min];
  for (let i = 1; i < count - 1; i++) {
    lines.push(min + i * spacing + rng.range(-wander, wander));
  }
  lines.push(max);
  return lines;
}

function cellsBetween(xLines: number[], zLines: number[]): Rect[] {
  const cells: Rect[] = [];
  for (let i = 0; i < xLines.length - 1; i++) {
    for (let j = 0; j < zLines.length - 1; j++) {
      cells.push({ minX: xLines[i], minZ: zLines[j], maxX: xLines[i + 1], maxZ: zLines[j + 1] });
    }
  }
  return cells;
}

const centre = (r: Rect) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

/** The nine points that stand in for a rectangle when asking about the water. */
function probes(r: Rect): { x: number; z: number }[] {
  const xs = [r.minX, (r.minX + r.maxX) / 2, r.maxX];
  const zs = [r.minZ, (r.minZ + r.maxZ) / 2, r.maxZ];
  const out: { x: number; z: number }[] = [];
  for (const x of xs) for (const z of zs) out.push({ x, z });
  return out;
}

const allWater = (r: Rect, water: Water) => probes(r).every((p) => water.isWater(p.x, p.z));
const anyWater = (r: Rect, water: Water) => probes(r).some((p) => water.isWater(p.x, p.z));

/**
 * Put a routed road into the generator as spans.
 *
 * Not simply one span per pair of points, which is what a boulevard does. A
 * routed road bends, so it arrives as a chain of thirty-metre pieces - and
 * `clip` looks for a gap *inside* a span, so a crossing that falls between two
 * pieces is never offered as a bridge candidate. Measured: the router found the
 * narrows at 243 m and 183 m, comfortably inside `CITY_MAX_BRIDGE`, and the
 * city came out with **zero** bridges and the districts pruned away.
 *
 * So where the line crosses water, the crossing is laid as **one straight
 * span** from the last dry point to the first dry point on the far side. That
 * span contains land, water and land, which is exactly the shape `clip` knows
 * how to turn into a gap - and from there the crossing goes through the same
 * selection (#247) and the same repair pass as every other one.
 */
function layRoute(
  line: Vec2[],
  water: Water,
  laid: Span[],
  kind: RoadClass = 'boulevard',
  district: DistrictKind = 'midtown',
  required = false,
): void {
  if (line.length < 2) return;
  const wet = (a: Vec2, b: Vec2) => water.isWater((a.x + b.x) / 2, (a.z + b.z) / 2);

  let i = 0;
  while (i < line.length - 1) {
    if (!wet(line[i], line[i + 1])) {
      laid.push({ from: line[i], to: line[i + 1], class: kind, district, required });
      i++;
      continue;
    }
    // A crossing. Laid as one piece from well back on this bank to well past
    // the far one, because `clip` throws away a dry run shorter than
    // `CITY_MIN_STREET` - and a span that reaches only one point onto land has
    // a twelve-metre stub at each end, so both runs are discarded and the gap
    // between them is never recorded. Measured: crossings of 243 m and 183 m,
    // both inside the bridge limit, and no bridge built.
    let j = i + 1;
    while (j < line.length - 1 && wet(line[j], line[j + 1])) j++;
    const back = reachBack(line, i, -1);
    const on = reachBack(line, Math.min(j + 1, line.length - 1), 1);
    laid.push({ from: line[back], to: line[on], class: kind, district, required });
    // Resume where the crossing ended, not where the water did. Resuming at the
    // far bank leaves the span's far end joined to nothing, so the bridge is its
    // own two-node island and `prune` deletes it - a chosen crossing that never
    // appears in the city.
    i = on;
  }
}

/**
 * The roads that join the bodies of land: one per body, from a district on this
 * side to a district on that one.
 *
 * These both start and end **at the plan** (ADR-0009). They used to run from
 * `water.town` to the middle of each other body, and the two halves of that were
 * wrong in different ways. Sharing one start point put four routed roads in one
 * corridor - the router prices the ground, so four roads out of the same place
 * get four nearly identical answers, and they arrive as a bundle of parallel
 * lines that reads worse than a single road would. And a body's *middle* is not
 * where anybody wants to go: the district on it is.
 */
function linkRoutes(water: Water, land: LandBodies): { from: Vec2; to: Vec2; body: number }[] {
  const step = CITY_BODY_CELL;
  // Every district's middle, on land and with a body under it. A traced polygon
  // is 75 to 100% land, so its centroid can fall in the water - and a target in
  // the water makes the router bridge out to sea to reach it, which is the one
  // failure ADR-0008 rule 2 calls out by name.
  const anchors: { at: Vec2; body: number }[] = [];
  for (const region of PLAN_DISTRICTS) {
    let x = 0;
    let z = 0;
    for (const p of region.poly) {
      x += p.x;
      z += p.z;
    }
    const middle = onLandNear({ x: x / region.poly.length, z: z / region.poly.length }, water, step);
    if (!middle) continue;
    const id = land.at(middle.x, middle.z);
    if (id >= 0) anchors.push({ at: middle, body: id });
  }

  // Home is the body downtown is on, which is the plan's answer to a question
  // `water.town` used to answer and had drifted 2566 m away from.
  const downtownAt = anchors.find((a) => inArea(PLAN_DISTRICTS[0].poly, a.at));
  const home = downtownAt ? downtownAt.body : -1;

  const routes: { from: Vec2; to: Vec2; body: number }[] = [];
  for (let id = 0; id < land.size.length; id++) {
    if (id === home) continue;
    // A road to a rock is not a road. Anything smaller than a superblock is
    // left to be scenery.
    if (land.size[id] <= CITY_MIN_BODY) continue;
    const onIt = anchors.filter((a) => a.body === id);
    const to =
      onIt.length > 0 ? nearest(onIt.map((a) => a.at), land.middle[id]) : onLandNear(land.middle[id], water, step);
    if (!to) continue;
    const fromHome = anchors.filter((a) => a.body === home).map((a) => a.at);
    if (fromHome.length > 0) routes.push({ from: nearest(fromHome, to), to, body: id });
  }
  return routes;
}

/**
 * The middle of the nearest district on a given body of land.
 *
 * The fallback for a place whose body has no link route - the home body, where
 * `linkRoutes` has nothing to return because there is nothing to cross to.
 */
function nearestDistrictAnchor(to: Vec2, water: Water, land: LandBodies, body: number): Vec2 | null {
  const on: Vec2[] = [];
  for (const region of PLAN_DISTRICTS) {
    let x = 0;
    let z = 0;
    for (const p of region.poly) {
      x += p.x;
      z += p.z;
    }
    const middle = onLandNear({ x: x / region.poly.length, z: z / region.poly.length }, water, CITY_BODY_CELL);
    if (middle && land.at(middle.x, middle.z) === body) on.push(middle);
  }
  return on.length > 0 ? nearest(on, to) : null;
}

/** Whichever of these is closest to `to`. */
function nearest(points: Vec2[], to: Vec2): Vec2 {
  let best = points[0];
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - to.x, p.z - to.z);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** The point itself if it is dry, or the nearest dry ground in a spiral out. */
function onLandNear(at: Vec2, water: Water, step: number): Vec2 | null {
  if (!water.isWater(at.x, at.z)) return at;
  for (let r = step; r < step * 30; r += step) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const p = { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r };
      if (!water.isWater(p.x, p.z)) return p;
    }
  }
  return null;
}

/**
 * Walk along the line from `at` in `step` until `CITY_MIN_STREET` of it is
 * behind you, so a crossing lands on a piece of road long enough to survive the
 * clip rather than on a stub it will discard.
 */
function reachBack(line: Vec2[], at: number, step: number): number {
  let run = 0;
  let i = at;
  while (i + step >= 0 && i + step < line.length && run < CITY_MIN_STREET * 1.5) {
    run += Math.hypot(line[i + step].x - line[i].x, line[i + step].z - line[i].z);
    i += step;
  }
  return i;
}

/**
 * The stretches of a line that run through built-up ground.
 *
 * An arterial is the grid's spine and it stops where the grid does, or it is six
 * lanes of nothing crossing open country to a coast with no town on it.
 */
function builtRuns(from: Vec2, to: Vec2): { from: Vec2; to: Vec2 }[] {
  const runs: { from: Vec2; to: Vec2 }[] = [];
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(length / CITY_CLIP_STEP));
  let start: Vec2 | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const at = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    if (builtUp(at)) {
      if (!start) start = at;
    } else if (start) {
      runs.push({ from: start, to: at });
      start = null;
    }
  }
  if (start) runs.push({ from: start, to });
  return runs.filter((r) => Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) > CITY_MIN_STREET);
}

/**
 * Is this point in the built-up part of the city, or out in the country?
 *
 * **The plan decides** (ADR-0009 rule 3). This was a radius around `water.town`
 * - one number for the whole map - and it is why four of the five bodies of land
 * had no city on them at all: the grid could not reach past the main lobe's
 * middle, so the districts across the water were laid, pruned as unreachable,
 * and deleted. A district polygon is the bound now, per body of land, and
 * everywhere outside one is the periphery (#260).
 */
function builtUp(at: Vec2): boolean {
  return planDistrictAt(at) !== null;
}

/**
 * Give every land cell a district, from the plan (ADR-0009 rule 1).
 *
 * This used to place them: three seeded anchors - downtown pulled toward the
 * water, a harbour along the shore, an industrial edge in a far corner - and
 * every superblock took the nearest one inside a radius. It is a reasonable way
 * to place districts and four months of it produced a map its author did not
 * want (#269), so the map was drawn instead (#271, #272).
 *
 * A cell takes the district of its **middle**. A superblock is 560 m and the
 * plan's areas are 0.7 to 4.2 km², so a cell straddling a boundary is a real
 * case and the middle is the least surprising answer to it: the alternative,
 * whichever kind covers most of the cell, moves boundaries by up to half a
 * superblock in a direction nobody drew.
 *
 * Cells outside every area are not the country - `builtUp` already dropped
 * those - they are the slivers a 560 m grid leaves against a traced edge. They
 * take the nearest area's kind rather than a default, or a boundary cell would
 * come out as midtown wherever the plan happens to be one metre away.
 */
function assignDistricts(cells: Rect[]): DistrictKind[] {
  return cells.map((cell) => {
    const c = centre(cell);
    const here = planDistrictAt(c);
    if (here) return here;
    let best: DistrictKind = 'midtown';
    let bestDist = Infinity;
    for (const region of PLAN_DISTRICTS) {
      for (const p of region.poly) {
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d < bestDist) {
          bestDist = d;
          best = region.kind;
        }
      }
    }
    return best;
  });
}

/** Move one edge of a rectangle inward by `t` of its span. */
function pullIn(r: Rect, edge: 'minX' | 'maxX' | 'minZ' | 'maxZ', t: number): Rect {
  const span = edge === 'minX' || edge === 'maxX' ? r.maxX - r.minX : r.maxZ - r.minZ;
  const by = span * t;
  return {
    ...r,
    [edge]: edge === 'minX' || edge === 'minZ' ? r[edge] + by : r[edge] - by,
  };
}

const area = (r: Rect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);

/**
 * Pull a block back off whatever is in the way, instead of deleting it.
 *
 * Used for both the water and the boulevards, and for the same reason in each:
 * deleting a whole block because something clips its corner takes a hundred
 * metres of city out for the sake of ten. A diagonal boulevard clips a corner
 * off every block it passes, so without this it carves a staircase-shaped hole
 * far wider than the road.
 *
 * Whatever it is almost always arrives from one side, so each edge is tried in
 * turn and the roomiest clear result wins. A block reached from two sides is a
 * sliver, not a plot, and is dropped.
 */
function pullClear(block: Rect, blocked: (r: Rect) => boolean): Rect | null {
  if (!blocked(block)) return block;

  let best: Rect | null = null;
  for (const edge of ['minX', 'maxX', 'minZ', 'maxZ'] as const) {
    for (let t = 0.1; t <= 0.7; t += 0.05) {
      const pulled = pullIn(block, edge, t);
      if (blocked(pulled)) continue;
      if (!best || area(pulled) > area(best)) best = pulled;
      break;
    }
  }
  return best && area(best) >= area(block) * 0.3 ? best : null;
}

/**
 * Divide [min, max] at its district's spacing, and hand back the cut positions.
 * The walk stops while there is still most of a block left, so the last block
 * is a block and not a sliver.
 */
function divide(rng: Rng, min: number, max: number, target: number, jitter: number): number[] {
  const cuts: number[] = [];
  let at = min;
  for (;;) {
    const next = at + target * (1 + rng.range(-jitter, jitter));
    if (next > max - target * 0.6) break;
    cuts.push(next);
    at = next;
  }
  return cuts;
}

/**
 * Lay one cell's streets and blocks.
 *
 * Streets run from arterial centreline to arterial centreline so they meet the
 * skeleton exactly; the blocks between them are inset by half a carriageway on
 * every side, which is the gap #84 builds in and #86 keeps the car out of. A
 * block with any water in it is dropped rather than clipped, so the coast steps
 * along block edges the way a quay does.
 */
function fillSuperblock(
  rng: Rng,
  cell: Superblock,
  arterialHalf: number,
  water: Water,
  land: LandBodies,
  spans: Span[],
  blocks: CityBlock[],
): void {
  const character = DISTRICTS[cell.district];
  const { bounds, district } = cell;
  const streetHalf = roadWidth(character.lanes) / 2;

  // **A park gets no street grid.** It is not a quarter that happens to be
  // empty, it is ground that was chosen (ADR-0009 rule 5): the hill park is the
  // highest land on the map with 41% of it too steep for any street to climb,
  // and laying a grid over that produces a slab of blocks up a mountainside.
  // What a park has is the road *through* it, which the arterials and the routed
  // roads already bring - and, in time, the climb that is the reason it is here.
  if (district === 'park') {
    const home = land.at(centre(bounds).x, centre(bounds).z);
    const whole = pullClear(bounds, (r) => anyWater(r, water));
    if (whole && land.at((whole.minX + whole.maxX) / 2, (whole.minZ + whole.maxZ) / 2) === home) {
      blocks.push({ district, bounds: whole, open: true });
    }
    return;
  }

  const inner: Rect = {
    minX: bounds.minX + arterialHalf,
    minZ: bounds.minZ + arterialHalf,
    maxX: bounds.maxX - arterialHalf,
    maxZ: bounds.maxZ - arterialHalf,
  };

  // A thin superblock gets fewer streets as well as fewer buildings; without
  // that it is a full grid with gaps in it rather than somewhere emptier.
  const skip = Math.min(0.6, character.skip / Math.max(0.35, cell.density));
  const keep = () => !rng.chance(skip);
  // Density sizes the blocks as well as thinning them. Skipping streets alone
  // has almost no purchase where the district skips hardly any - downtown is at
  // 0.03 - so "denser than the rest of its kind" has to mean smaller blocks or
  // it means nothing. Square-rooted, because block size is an area of city per
  // block and a linear one turns a 35% denser quarter into 35% closer streets,
  // which is a different kind of place rather than a busier one.
  const grain = 1 / Math.sqrt(Math.max(0.35, cell.density));
  const xCuts = divide(rng, bounds.minX, bounds.maxX, character.blockX * grain, character.jitter).filter(keep);
  const zCuts = divide(rng, bounds.minZ, bounds.maxZ, character.blockZ * grain, character.jitter).filter(keep);

  // Collected separately so the blocks below can be trimmed off them. In a
  // winding quarter the streets no longer sit on the lines the blocks were
  // measured from, so without this a building ends up in the road.
  const local: Span[] = [];
  for (const x of xCuts) {
    lay(local, { x, z: bounds.minZ }, { x, z: bounds.maxZ }, cell, character.blockX, rng, district);
  }
  for (const z of zCuts) {
    lay(local, { x: bounds.minX, z }, { x: bounds.maxX, z }, cell, character.blockZ, rng, district);
  }
  spans.push(...local);

  const clearsStreets = (r: Rect) =>
    !cell.winding ||
    !local.some((street) => segmentToRect(street.from, street.to, r) < streetHalf);

  // A block belongs to the body of land its superblock is on. A 560 m cell on a
  // coast reaches across a channel, and the land on the far side is dry, so the
  // grid happily built on it: measured, 22 downtown blocks on the island the
  // docks are meant to have to themselves, and midtown blocks on three bodies of
  // land the plan gives no midtown at all. The water test cannot catch this -
  // the far bank is not water.
  const home = land.at(centre(cell.bounds).x, centre(cell.bounds).z);
  const onHomeBody = (r: Rect) => land.at((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2) === home;

  const xEdges = [inner.minX, ...xCuts, inner.maxX];
  const zEdges = [inner.minZ, ...zCuts, inner.maxZ];
  for (let i = 0; i < xEdges.length - 1; i++) {
    for (let j = 0; j < zEdges.length - 1; j++) {
      const block: Rect = {
        minX: xEdges[i] + (i === 0 ? 0 : streetHalf),
        maxX: xEdges[i + 1] - (i + 2 === xEdges.length ? 0 : streetHalf),
        minZ: zEdges[j] + (j === 0 ? 0 : streetHalf),
        maxZ: zEdges[j + 1] - (j + 2 === zEdges.length ? 0 : streetHalf),
      };
      const fitted = pullClear(block, (r) => anyWater(r, water) || !clearsStreets(r));
      if (!fitted || !onHomeBody(fitted)) continue;
      // Some of a city is gaps: a park, a yard, a car park, a lot nobody built on.
      const open = rng.chance(Math.min(0.5, OPEN_BLOCK_CHANCE / Math.max(0.35, cell.density)));
      blocks.push({ district, bounds: fitted, open });
    }
  }
}

/**
 * Find where a span leaves the land, to within a metre or so, as a fraction
 * along it. Sampling alone would put the bank up to a whole sample away from
 * where it is, and a bridge that starts short of the water is a road that
 * stops in a field.
 */
function edge(span: Span, water: Water, dry: number, wet: number): number {
  let lo = dry;
  let hi = wet;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    const p = pointAt(span, mid);
    if (water.isWater(p.x, p.z)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * Cut one span against the water: the stretches on land go to `dry`, and the
 * stretches of water between them are recorded as gaps a bridge could cross.
 */
function clip(span: Span, water: Water, dry: Span[], gaps: Gap[]): void {
  const length = spanLength(span);
  const runs: { from: number; to: number }[] = [];
  let start: number | null = null;
  let previous = 0;

  const steps = Math.max(1, Math.ceil(length / CITY_CLIP_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pointAt(span, t);
    const land = !water.isWater(p.x, p.z);
    if (land && start === null) {
      start = i === 0 ? t : edge(span, water, t, previous);
    } else if (!land && start !== null) {
      runs.push({ from: start, to: edge(span, water, previous, t) });
      start = null;
    }
    previous = t;
  }
  if (start !== null) runs.push({ from: start, to: 1 });

  // "Too short to be a street" has to mean short *for this span*, not short in
  // absolute terms. A curve arrives as a chain of 55 m pieces, and a flat
  // minimum of 70 m silently deleted every one of them - which is not a stub
  // being tidied away but a whole neighbourhood's streets going missing.
  //
  // And a **required** span keeps every run it has, however short. This is the
  // one road onto a body of land, and the run on the far bank is whatever is
  // left between the water and the place the road was going to - often a few
  // metres, because the place's own roads take over from there. Discarding it
  // discards the bank the bridge lands on, so the bridge joins nothing, the
  // island stays its own component and `prune` deletes the lot: measured, four
  // crossings picked and built and two surviving, with the airfield and the
  // waterfront left with no roads at all.
  const minRun = span.required ? 0 : Math.min(CITY_MIN_STREET, length * 0.85);
  const kept = runs.filter((r) => (r.to - r.from) * length >= minRun);
  for (const run of kept) {
    dry.push({ ...span, from: pointAt(span, run.from), to: pointAt(span, run.to) });
  }

  // Only a major road is worth bridging; a side street stops at the bank.
  if (span.class !== 'arterial' && span.class !== 'boulevard') return;
  for (let i = 0; i < kept.length - 1; i++) {
    const from = kept[i].to;
    const to = kept[i + 1].from;
    const gap = (to - from) * length;
    if (gap <= CITY_MAX_BRIDGE) gaps.push({ span, from, to, length: gap });
  }
}

const bridgeSpan = (gap: Gap): Span => ({
  ...gap.span,
  from: pointAt(gap.span, gap.from),
  to: pointAt(gap.span, gap.to),
  bridge: true,
});

/**
 * Pick the crossings the city is designed around (ADR-0005 rule 2).
 *
 * The first is the shortest gap on the map: with nothing to spread away from,
 * the cheapest crossing is the one to build. Every one after it is the
 * candidate **furthest from every crossing already chosen**, until they would
 * be closer together than `CITY_BRIDGE_SPACING` or there are `CITY_BRIDGES` of
 * them. The repair pass adds more only if it has to.
 *
 * Furthest-first rather than shortest-first, which is what this did and is why
 * a 4 km river got three bridges with a 2.7 km round trip between two of them.
 * Shortest-first picks where the channel is narrow, and where the channel is
 * narrow is one place; the spacing rule then rejected eight of eleven
 * candidates for being near what it had already taken, so the *number* of
 * crossings was never the constraint the tuning constant said it was. What the
 * player feels is not how many bridges exist but how far they are from one, and
 * that is the quantity this maximises.
 */
function chooseBridges(gaps: Gap[]): number[] {
  if (gaps.length === 0) return [];
  const midpoint = (gap: Gap) => pointAt(gap.span, (gap.from + gap.to) / 2);
  const between = (a: number, b: number) => {
    const p = midpoint(gaps[a]);
    const q = midpoint(gaps[b]);
    return Math.hypot(p.x - q.x, p.z - q.z);
  };

  // Whatever else is chosen, the roads that reach a body of land keep their
  // crossings: they are the only way onto it, and a declined one is a deleted
  // district rather than a longer drive.
  const chosen: number[] = [];
  for (let i = 0; i < gaps.length; i++) if (gaps[i].span.required) chosen.push(i);

  // The shortest crossing is still taken as well, as it always was: with
  // nothing to spread away from, the cheapest crossing is the one to build
  // (#247). Seeding the spread with the required ones *instead* is what took the
  // map from seven crossings to two - they are clustered where the link roads
  // happen to reach, so the furthest-first that follows had less to push away
  // from and stopped early.
  let shortest = -1;
  for (let i = 0; i < gaps.length; i++) {
    if (chosen.includes(i)) continue;
    if (shortest === -1 || gaps[i].length < gaps[shortest].length) shortest = i;
  }
  if (shortest !== -1) chosen.push(shortest);

  while (chosen.length < CITY_BRIDGES) {
    let best = -1;
    let bestReach = 0;
    for (let i = 0; i < gaps.length; i++) {
      if (chosen.includes(i)) continue;
      const reach = Math.min(...chosen.map((j) => between(i, j)));
      // Ties go to the cheaper crossing; two candidates equally far from
      // everything else are the same decision, and one of them is less bridge.
      if (reach > bestReach || (reach === bestReach && best !== -1 && gaps[i].length < gaps[best].length)) {
        best = i;
        bestReach = reach;
      }
    }
    if (best === -1 || bestReach < CITY_BRIDGE_SPACING) break;
    chosen.push(best);
  }

  return chosen;
}

/**
 * Put one street down: straight across a gridded quarter, or bowed across a
 * winding one.
 *
 * A winding street is a single smooth arc rather than a wiggle, because a
 * street that changes its mind twice reads as a mistake. It is chopped into
 * short segments, which the rest of the pipeline treats exactly as it treats
 * any other road - the machinery stopped caring about direction when
 * boulevards arrived.
 */
function lay(
  spans: Span[],
  from: Vec2,
  to: Vec2,
  cell: Superblock,
  blockSize: number,
  rng: Rng,
  district: DistrictKind,
): void {
  const axis: Axis = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) ? 'x' : 'z';

  if (!cell.winding) {
    spans.push({ from, to, axis, class: 'street', district });
    return;
  }

  // Bow perpendicular to the run, by less than half a block so neighbouring
  // streets stay clear of each other.
  const bow = rng.range(-1, 1) * WINDING_BOW * blockSize;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.max(1, Math.hypot(dx, dz));
  const across = { x: -dz / length, z: dx / length };

  const steps = Math.max(3, Math.round(length / WINDING_STEP));
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const arc = Math.sin(t * Math.PI) * bow;
    const next = {
      x: from.x + dx * t + across.x * arc,
      z: from.z + dz * t + across.z * arc,
    };
    spans.push({ from: previous, to: next, class: 'street', district });
    previous = next;
  }
}

/** Snap a coordinate before it is used as a node key, so a shared line is one node. */
const snap = (v: number) => Math.round(v * 1000) / 1000;
const key = (x: number, z: number) => `${snap(x)}|${snap(z)}`;

interface Graph {
  nodes: CityNode[];
  roads: CityRoad[];
  at: Map<string, CityNode>;
}

/**
 * Turn overlapping centrelines into a graph: cut every span at each span that
 * crosses it, and share a node wherever two roads meet.
 */
function buildGraph(spans: Span[], terrain: Terrain): Graph {
  const nodes: CityNode[] = [];
  const at = new Map<string, CityNode>();
  const roads: CityRoad[] = [];
  const seen = new Set<string>();

  const nodeAt = (x: number, z: number): CityNode => {
    const k = key(x, z);
    let node = at.get(k);
    if (!node) {
      // **On the ground, not at zero** (#255). A surface node's height is the
      // land under it, which is what makes a street climb a hill: everything
      // downstream reads `y` - the sim rides it, the renderer draws it, the
      // pursuit and the routing ask about it - and until now every one of them
      // was told the city was flat.
      //
      // `level` is what says which network a node is on (#250), so this does
      // not muddle the two the way `y === 0` used to.
      const pos = { x: snap(x), z: snap(z) };
      node = { id: nodes.length, pos, y: groundAt(terrain, pos.x, pos.z), level: 'surface', roads: [] };
      at.set(k, node);
      nodes.push(node);
    }
    return node;
  };

  for (const span of spans) {
    const length = spanLength(span);
    if (length < 1) continue;

    // Everything crossing this span, as fractions along it, plus its own ends.
    const cuts = new Set([0, 1]);
    for (const other of spans) {
      if (other === span) continue;
      const at = crossing(span, other);
      if (!at) continue;
      const t = Math.hypot(at.x - span.from.x, at.z - span.from.z) / length;
      if (t > 0 && t < 1) cuts.add(t);
    }

    const along = [...cuts].sort((p, q) => p - q);
    const lanes = LANES_FOR[span.class] ?? DISTRICTS[span.district].lanes;
    const speed = SPEED_FOR[span.class] ?? DISTRICTS[span.district].speed;

    for (let i = 0; i < along.length - 1; i++) {
      const p1 = pointAt(span, along[i]);
      const p2 = pointAt(span, along[i + 1]);
      const piece = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      if (piece < 1) continue; // two crossings on top of each other

      const a = nodeAt(p1.x, p1.z);
      const b = nodeAt(p2.x, p2.z);
      if (a.id === b.id) continue;

      const k = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (seen.has(k)) continue;
      seen.add(k);

      const road: CityRoad = {
        id: roads.length,
        a: a.id,
        b: b.id,
        class: span.class,
        district: span.district,
        lanes,
        width: roadWidth(lanes),
        speed,
        length: piece,
        bridge: span.bridge ?? false,
        embankment: span.embankment,
      };
      roads.push(road);
      a.roads.push(road.id);
      b.roads.push(road.id);
    }
  }

  return { nodes, roads, at };
}

/** Which connected piece each node belongs to, and how many pieces there are. */
function components(graph: Graph): { of: number[]; count: number } {
  const of = new Array<number>(graph.nodes.length).fill(-1);
  let count = 0;
  for (const start of graph.nodes) {
    if (of[start.id] !== -1) continue;
    const queue = [start.id];
    of[start.id] = count;
    while (queue.length > 0) {
      const node = graph.nodes[queue.pop() as number];
      for (const id of node.roads) {
        const road = graph.roads[id];
        const next = road.a === node.id ? road.b : road.a;
        if (of[next] === -1) {
          of[next] = count;
          queue.push(next);
        }
      }
    }
    count++;
  }
  return { of, count };
}

/**
 * Build the graph, and keep bridging until you can drive across the whole city
 * (ADR-0005 rule 3).
 *
 * Cutting a network against water can sever a district, and which seed does
 * that is not worth trying to predict. So the invariant is enforced rather than
 * assumed: while the city is in pieces, span the shortest water gap that joins
 * two of them. Anything still unreachable at the end - a stub of street left on
 * a headland - is deleted, because a piece of road nobody can drive to is not
 * content.
 */
function connect(
  dry: Span[],
  gaps: Gap[],
  initial: number[],
  water: Water,
  terrain: Terrain,
): { nodes: CityNode[]; roads: CityRoad[] } {
  const chosen = new Set(initial);
  const rebuild = () => buildGraph([...dry, ...[...chosen].map((i) => bridgeSpan(gaps[i]))], terrain);
  let graph = rebuild();

  for (let attempt = 0; attempt < gaps.length; attempt++) {
    const parts = components(graph);
    if (parts.count === 1) return graph;

    let best = -1;
    for (let i = 0; i < gaps.length; i++) {
      if (chosen.has(i)) continue;
      const gap = gaps[i];
      const p1 = pointAt(gap.span, gap.from);
      const p2 = pointAt(gap.span, gap.to);
      const a = graph.at.get(key(p1.x, p1.z));
      const b = graph.at.get(key(p2.x, p2.z));
      if (!a || !b || parts.of[a.id] === parts.of[b.id]) continue;
      if (best === -1 || gap.length < gaps[best].length) best = i;
    }
    if (best === -1) break;

    chosen.add(best);
    graph = rebuild();
  }

  return prune(trimWaterStubs(graph, water));
}

/**
 * Drop the scraps of street left between the embankment and the water (#241).
 *
 * Streets are cut against the water and the embankment crosses them, so the
 * graph comes out with a junction on the embankment and then a short spur
 * running on to the bank and stopping. That spur is the thing a playtest saw:
 * a road going nowhere, at the water, a hundred and six times over.
 *
 * Trimmed here rather than prevented in `clip`, and the difference matters.
 * Clipping streets short of the embankment was the first attempt: they then
 * stopped *near* it without touching it, so no junction formed and the stub was
 * still there, only now disconnected as well. A street has to cross the
 * embankment to end onto it. What is left over is scrap, and scrap is what this
 * removes.
 *
 * Repeated, because trimming a spur can leave the piece behind it a spur in
 * turn. Never touches a bridge or the embankment itself: one is how you cross
 * the water and the other is supposed to be beside it.
 */
function trimWaterStubs(graph: Graph, water: Water): Graph {
  let roads = graph.roads;
  for (let pass = 0; pass < 4; pass++) {
    const degree = new Map<number, number>();
    for (const road of roads) {
      degree.set(road.a, (degree.get(road.a) ?? 0) + 1);
      degree.set(road.b, (degree.get(road.b) ?? 0) + 1);
    }
    const kept = roads.filter((road) => {
      if (road.bridge || road.embankment) return true;
      const ends = [road.a, road.b].filter((id) => (degree.get(id) ?? 0) === 1);
      if (ends.length === 0) return true;
      // A dead end within reach of the water is the water's doing.
      return !ends.some((id) => {
        const at = graph.nodes[id].pos;
        return nearWater(water, at.x, at.z, EMBANKMENT_SETBACK * 1.6);
      });
    });
    if (kept.length === roads.length) break;
    roads = kept;
  }
  if (roads.length === graph.roads.length) return graph;

  // Renumbered, and the nodes' road lists rebuilt with them. `node.roads` holds
  // *ids*, and `components` looks those up by index - so filtering the array
  // without renumbering leaves every node pointing at the wrong road, or at
  // nothing. That is a crash rather than a subtle bug, which is the one mercy.
  const renumbered = roads.map((road, id) => ({ ...road, id }));
  const nodes = graph.nodes.map((node) => ({ ...node, roads: [] as number[] }));
  for (const road of renumbered) {
    nodes[road.a].roads.push(road.id);
    nodes[road.b].roads.push(road.id);
  }
  return { ...graph, nodes, roads: renumbered };
}

/** Keep the largest connected piece and renumber it, dropping the orphans. */
function prune(graph: Graph): { nodes: CityNode[]; roads: CityRoad[] } {
  const parts = components(graph);
  const size = new Array<number>(parts.count).fill(0);
  for (const part of parts.of) size[part]++;
  const keep = size.indexOf(Math.max(...size));

  const nodes: CityNode[] = [];
  const remap = new Map<number, number>();
  for (const node of graph.nodes) {
    if (parts.of[node.id] !== keep) continue;
    remap.set(node.id, nodes.length);
    nodes.push({ id: nodes.length, pos: node.pos, y: node.y, level: node.level, roads: [] });
  }

  const roads: CityRoad[] = [];
  for (const road of graph.roads) {
    const a = remap.get(road.a);
    const b = remap.get(road.b);
    if (a === undefined || b === undefined) continue;
    const kept: CityRoad = { ...road, id: roads.length, a, b };
    roads.push(kept);
    nodes[a].roads.push(kept.id);
    nodes[b].roads.push(kept.id);
  }

  return { nodes, roads };
}
