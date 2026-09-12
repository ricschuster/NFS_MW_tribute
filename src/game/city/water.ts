import {
  CITY_CHANNELS,
  CITY_CHANNEL_BOW,
  CITY_CHANNEL_CUT,
  CITY_CHANNEL_WIDTH,
  CITY_COAST_RIPPLE,
  CITY_COAST_SCALE,
  CITY_LAND_LEVEL,
  CITY_LOBE_SPREAD,
  CITY_LOBES,
  CITY_MIN_BODY,
  CITY_RIVER_WIDTH,
  CITY_RIVER_WANDER,
  CITY_RIVER_MOUTH,
  CITY_SEA_EDGE,
  CITY_SEA_MARGIN,
  CITY_TOWN_INLAND,
  CITY_TOWN_SPREAD,
  CITY_WATER_STEP,
} from '../constants';
import type { Rng } from './rng';
import type { Rect, Vec2, WaterBody } from './types';

const TAU = Math.PI * 2;

/** 0 below 0, 1 above 1, eased in between. */
const smoothstep = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/**
 * Water comes before land (ADR-0005 rule 1), and the land is not a rectangle
 * with water taken out of it (ADR-0008 rule 1).
 *
 * It used to be a bay along the north edge and a river inland from it, cut out
 * of a rectangle. That gives a slab with a wavy top and three straight sides,
 * and no amount of wobbling the coastline fixes it, because the thing worth
 * having is not an irregular edge. It is **bodies of land facing each other
 * across water**. A headland is not a district, and a bridge to one is a
 * widening in the road - where a bridge across a channel is somewhere a pursuit
 * gets decided.
 *
 * So the land is a field: a handful of overlapping **lobes**, summed, cut at a
 * threshold, with **channels** subtracted across the necks between them.
 *
 * The river stays, because a river is a different thing from a channel. It runs
 * inland and it has banks rather than a shore, which is why `isChannel` is
 * asked separately: the terrain ramps gently from the sea over hundreds of
 * metres and steeply from a bank over tens.
 */
export interface Water {
  /** Water of any kind: nothing is built or driven here. */
  isWater(x: number, z: number): boolean;
  /** The open sea, beyond the land. The far side of it is the horizon. */
  isSea(x: number, z: number): boolean;
  /** Inland water: the river and the channels. The far side is somewhere you can see. */
  isChannel(x: number, z: number): boolean;
  /** The coastline, as closed loops with land inside them. */
  coast: Vec2[][];
  /** The bodies of land, so a district can be put on one rather than on a grid cell. */
  lobes: Lobe[];
  /**
   * Where the terrain's basin is centred: a point on the main body of land, out
   * towards its seaward side rather than in the middle of it.
   *
   * **It is not where the city is** (ADR-0009 rule 4). It had four jobs - the
   * basin, bounding the street grid, naming the home body of land, and starting
   * the roads that reach the other shores - and the plan does the last three
   * better. The name is what let it drift: measured, it sits 2566 m from the
   * middle of the plan's downtown, inside the *industrial* area, and nothing
   * noticed until `npm run plan` asked.
   *
   * Downtown belongs on the waterfront - it is where every city of this shape
   * put its downtown, and it is what the reference city does. It also frees the
   * interior: with the town in the middle of the island, the flat part of the
   * map sat exactly on the only ground far enough from the sea for the shore
   * ramp to let it rise, and the hills came out at two thirds of their budget.
   */
  town: Vec2;
  /** The outlines, for the renderer and the map tool. */
  bodies: WaterBody[];
}

/** One body of land. The city is built on the first, which is the biggest. */
export interface Lobe {
  at: Vec2;
  radius: number;
  /** How much land it contributes, before the channels are cut. */
  weight: number;
}

/**
 * Is this point in the water, or close enough to it to be on the bank (#241)?
 *
 * Sampled around the point rather than measured, because the water is a field
 * and the distance to it has no closed form. Eight directions is enough at this
 * scale - the coast wanders over hundreds of metres and the margins asked about
 * here are tens.
 */
export function nearWater(water: Water, x: number, z: number, margin: number): boolean {
  if (water.isWater(x, z)) return true;
  if (margin <= 0) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    if (water.isWater(x + Math.cos(a) * margin, z + Math.sin(a) * margin)) return true;
  }
  return false;
}

/**
 * Two sines at unrelated frequencies, in [-1, 1]. Enough wander that a river
 * does not read as drawn with a ruler, still smooth enough that a road meets it
 * at a sane angle.
 */
function wobble(rng: Rng): (t: number) => number {
  const f1 = rng.range(1.1, 2.3);
  const p1 = rng.range(0, TAU);
  const f2 = rng.range(2.7, 4.6);
  const p2 = rng.range(0, TAU);
  return (t) => 0.62 * Math.sin(f1 * t * TAU + p1) + 0.38 * Math.sin(f2 * t * TAU + p2);
}

/**
 * A ripple over the whole map, in [-1, 1]. Applied to the land *field* rather
 * than to a radius, so the coast is irregular everywhere - including in the
 * necks between lobes, which is where it matters most.
 */
function ripple(rng: Rng, scale: number): (x: number, z: number) => number {
  const terms: { fx: number; fz: number; p: number; a: number }[] = [];
  for (let i = 0; i < 5; i++) {
    terms.push({
      fx: rng.range(1.5, 4.5),
      fz: rng.range(1.5, 4.5),
      p: rng.range(0, TAU),
      a: 1 / (i + 2),
    });
  }
  const total = terms.reduce((s, t) => s + t.a, 0);
  return (x, z) =>
    terms.reduce((s, t) => s + t.a * Math.sin((x / scale) * t.fx + (z / scale) * t.fz + t.p), 0) / total;
}

export function makeWater(rng: Rng, bounds: Rect): Water {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  // The lobes. The first is the biggest and near the middle, and it is where the
  // city goes: `lobes[0]` is a promise the rest of the generator relies on to
  // know where downtown is, rather than picking a point in a rectangle and
  // hoping it is on land.
  const lobes: Lobe[] = [];
  const first = rng.range(0, TAU);
  for (let i = 0; i < CITY_LOBES; i++) {
    const t = first + (i / CITY_LOBES) * TAU + rng.range(-0.25, 0.25);
    const out = i === 0 ? rng.range(0.02, 0.07) : rng.range(0.27, 0.38);
    lobes.push({
      at: {
        x: cx + Math.cos(t) * width * out,
        z: cz + Math.sin(t) * depth * out * CITY_LOBE_SPREAD,
      },
      radius: (i === 0 ? rng.range(0.2, 0.24) : rng.range(0.16, 0.2)) * width,
      weight: i === 0 ? 1 : rng.range(0.8, 0.96),
    });
  }

  const rough = ripple(rng, width * CITY_COAST_SCALE);

  // Sea all the way round, always. Land that reaches the map's edge has a
  // boundary that never closes, and an unclosed loop drawn as a filled path is
  // a chord straight across the island - which is what the first render of this
  // was, a set of triangular bites out of the coast. It is also just true: an
  // island has water on every side, and the alternative is a cliff at the
  // border again.
  const margin = width * CITY_SEA_EDGE;
  const inside = (x: number, z: number) =>
    smoothstep(
      Math.min(
        Math.min(x - bounds.minX, bounds.maxX - x),
        Math.min(z - bounds.minZ, bounds.maxZ - z),
      ) / margin,
    );

  const land = (x: number, z: number) => {
    let v = 0;
    for (const lobe of lobes) {
      const d = Math.hypot(x - lobe.at.x, z - lobe.at.z) / lobe.radius;
      v += lobe.weight * Math.exp(-d * d * 1.35);
    }
    return v * (1 + CITY_COAST_RIPPLE * rough(x, z)) * inside(x, z);
  };

  // The channels, laid across the necks between the first lobe and the others.
  // Cut hard enough to sever: a channel that only dents the coast is an inlet,
  // and an inlet does not need a bridge.
  const channels: { from: Vec2; to: Vec2; bow: number }[] = [];
  for (let i = 1; i <= Math.min(CITY_CHANNELS, lobes.length - 1); i++) {
    const a = lobes[0].at;
    const b = lobes[i].at;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.max(1, Math.hypot(dx, dz));
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    // Across the line between the two, running well past both ends so the cut
    // reaches open water rather than stopping inland and leaving an isthmus.
    channels.push({
      from: { x: mid.x - (dz / len) * width, z: mid.z + (dx / len) * width },
      to: { x: mid.x + (dz / len) * width, z: mid.z - (dx / len) * width },
      bow: rng.range(-1, 1) * width * CITY_CHANNEL_BOW,
    });
  }

  const cut = (x: number, z: number) => {
    let most = 0;
    for (const c of channels) {
      const dx = c.to.x - c.from.x;
      const dz = c.to.z - c.from.z;
      const len2 = Math.max(1, dx * dx + dz * dz);
      const len = Math.sqrt(len2);
      const t = Math.max(0, Math.min(1, ((x - c.from.x) * dx + (z - c.from.z) * dz) / len2));
      // Bowed, so a strait is not a canal.
      const bow = Math.sin(t * Math.PI) * c.bow;
      const px = c.from.x + dx * t - (dz / len) * bow;
      const pz = c.from.z + dz * t + (dx / len) * bow;
      const d = Math.hypot(x - px, z - pz) / (width * CITY_CHANNEL_WIDTH);
      most = Math.max(most, Math.exp(-d * d * 1.6));
    }
    return most;
  };

  const solid = (x: number, z: number) => land(x, z) - CITY_CHANNEL_CUT * cut(x, z);

  // The river: still ADR-0005 rule 1's river, running inland and severing the
  // city, where a channel is what makes a neighbouring district an island.
  const meander = wobble(rng);
  const mouth = rng.range(-0.3, 0.3) * width;
  const riverX = (z: number) => mouth + CITY_RIVER_WANDER * meander((z - bounds.minZ) / depth);
  const riverHalfWidth = (z: number) =>
    (CITY_RIVER_WIDTH * (1 + CITY_RIVER_MOUTH * ((z - bounds.minZ) / depth))) / 2;
  const inRiver = (x: number, z: number) => Math.abs(x - riverX(z)) < riverHalfWidth(z);

  const isWater = (x: number, z: number) => solid(x, z) < CITY_LAND_LEVEL || inRiver(x, z);
  // The sea is where there is no land at all; a channel is land the cut removed,
  // and the river. The difference is what the terrain reads to decide whether a
  // waterside is a beach or a bank.
  const isSea = (x: number, z: number) => land(x, z) < CITY_LAND_LEVEL;
  const isChannel = (x: number, z: number) => isWater(x, z) && !isSea(x, z);

  // Specks are not land. A body too small to carry a road reads as a rock with
  // grass on it, and the map had two of them sitting in the channel doing
  // nothing. Found by flood fill over the trace grid and turned back into sea,
  // before the coastline is traced - so nothing downstream ever hears about
  // them.
  const dropped = specks(bounds, isWater);
  const isLand = (x: number, z: number) => !isWater(x, z) && !dropped(x, z);
  const wetOrSpeck = (x: number, z: number) => !isLand(x, z);
  const coast = trace(bounds, isLand);

  // Out from the main lobe's middle towards the water, and stopped before it
  // gets there: far enough that the city has a shore, near enough that it has a
  // hinterland behind it.
  // Southward, towards the water. Downtown belongs on the coast, and putting it
  // on the *south* coast puts the land behind it - so the ground rises away
  // from the city instead of the city sitting in the middle of the rise. It is
  // what the sketch did and what the reference city does.
  const facing = -Math.PI / 2 + rng.range(-CITY_TOWN_SPREAD, CITY_TOWN_SPREAD);
  const step = lobes[0].radius / 60;
  // Walk **until the water**, then come back off the beach by
  // `CITY_TOWN_INLAND`. The cap used to be the point of this loop rather than a
  // guard on it - it stopped after 0.55 of the lobe's radius whether or not it
  // had got anywhere, and the lobe is bigger than that, so the town sat 1.65 km
  // inland while every comment here claimed it was on the coast.
  let reached = 0;
  for (let d = 0; d <= lobes[0].radius * 2; d += step) {
    const at = {
      x: lobes[0].at.x + Math.cos(facing) * d,
      z: lobes[0].at.z + Math.sin(facing) * d,
    };
    if (isWater(at.x, at.z)) break;
    reached = d;
  }
  const back = Math.max(0, reached - CITY_TOWN_INLAND);
  const town = {
    x: lobes[0].at.x + Math.cos(facing) * back,
    z: lobes[0].at.z + Math.sin(facing) * back,
  };

  return {
    isWater: wetOrSpeck,
    isSea,
    isChannel,
    coast,
    lobes,
    town,
    bodies: outlines(bounds, coast),
  };
}

/**
 * Which land is too small to keep.
 *
 * Flood-filled over the same grid the coastline is traced on, so a body either
 * survives whole or is sea. Anything under `CITY_MIN_BODY` goes: it is a rock,
 * the generator will not put a road on it, and a piece of land with no road on
 * it is a place the player can look at and never reach.
 */
function specks(bounds: Rect, isWater: (x: number, z: number) => boolean): (x: number, z: number) => boolean {
  const step = CITY_WATER_STEP;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / step) + 1;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;
  const dry = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dry[r * cols + c] = isWater(bounds.minX + c * step, bounds.minZ + r * step) ? 0 : 1;
    }
  }

  const drop = new Uint8Array(cols * rows);
  const seen = new Uint8Array(cols * rows);
  for (let start = 0; start < dry.length; start++) {
    if (!dry[start] || seen[start]) continue;
    const body: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      body.push(i);
      const c = i % cols;
      const r = Math.floor(i / cols);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (dry[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (body.length * step * step < CITY_MIN_BODY) for (const i of body) drop[i] = 1;
  }

  return (x, z) => {
    const c = Math.min(cols - 1, Math.max(0, Math.round((x - bounds.minX) / step)));
    const r = Math.min(rows - 1, Math.max(0, Math.round((z - bounds.minZ) / step)));
    return drop[r * cols + c] === 1;
  };
}

/**
 * The coastline, by marching squares over the land.
 *
 * A field has no outline until somebody walks it. `shoreAt(x)` used to be the
 * outline *and* a function of one variable at the same time, which is precisely
 * why the coast could only run along one edge. This gives the loops - one per
 * body of land - and they are what the renderer draws the sea around, what the
 * map tool draws, and what #241's quay is offset inward from.
 */
function trace(bounds: Rect, inside: (x: number, z: number) => boolean): Vec2[][] {
  const step = CITY_WATER_STEP;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / step) + 1;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;
  const at = (c: number, r: number): Vec2 => ({
    x: bounds.minX + c * step,
    z: bounds.minZ + r * step,
  });

  const solid = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = at(c, r);
      solid[r * cols + c] = inside(p.x, p.z) ? 1 : 0;
    }
  }

  const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  const segments: [Vec2, Vec2][] = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const s = (dc: number, dr: number) => solid[(r + dr) * cols + (c + dc)];
      const code = s(0, 0) | (s(1, 0) << 1) | (s(1, 1) << 2) | (s(0, 1) << 3);
      if (code === 0 || code === 15) continue;
      const p00 = at(c, r);
      const p10 = at(c + 1, r);
      const p11 = at(c + 1, r + 1);
      const p01 = at(c, r + 1);
      const bottom = mid(p00, p10);
      const right = mid(p10, p11);
      const top = mid(p01, p11);
      const left = mid(p00, p01);
      // Which edges of this cell the boundary crosses. **Unordered**: the pairs
      // say what is joined to what and nothing about which way round, because
      // the chaining below does not need to know and getting a winding table
      // right by reasoning is how the first version came out as a fan of
      // triangles across the map.
      const cases: Record<number, [Vec2, Vec2][]> = {
        1: [[left, bottom]],
        2: [[bottom, right]],
        3: [[left, right]],
        4: [[right, top]],
        5: [[left, top], [bottom, right]],
        6: [[bottom, top]],
        7: [[left, top]],
        8: [[left, top]],
        9: [[bottom, top]],
        10: [[left, bottom], [right, top]],
        11: [[right, top]],
        12: [[left, right]],
        13: [[bottom, right]],
        14: [[left, bottom]],
      };
      for (const seg of cases[code] ?? []) segments.push(seg);
    }
  }

  // Chain the segments into loops. Positions are midpoints of grid edges, so
  // they meet exactly and can be matched on a key; the walk is undirected, so
  // a loop comes out whole whichever way each segment happened to be written.
  const key = (p: Vec2) => `${Math.round(p.x)}|${Math.round(p.z)}`;
  const joins = new Map<string, Vec2[]>();
  const edgeKey = (a: Vec2, b: Vec2) => (key(a) < key(b) ? `${key(a)}~${key(b)}` : `${key(b)}~${key(a)}`);
  for (const [a, b] of segments) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as [Vec2, Vec2][]) {
      const k = key(from);
      const list = joins.get(k);
      if (list) list.push(to);
      else joins.set(k, [to]);
    }
  }

  const walked = new Set<string>();
  const loops: Vec2[][] = [];
  for (const [a, b] of segments) {
    if (walked.has(edgeKey(a, b))) continue;
    const loop: Vec2[] = [a];
    let previous = a;
    let current = b;
    walked.add(edgeKey(a, b));
    for (let guard = 0; guard <= segments.length; guard++) {
      loop.push(current);
      const next = (joins.get(key(current)) ?? []).find(
        (p) => key(p) !== key(previous) && !walked.has(edgeKey(current, p)),
      );
      if (!next) break;
      walked.add(edgeKey(current, next));
      previous = current;
      current = next;
    }
    // Shorter than this is a rock, not a coastline.
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

/**
 * The water, as polygons for the renderer.
 *
 * One body: the sea, a rectangle reaching past the map so it meets the horizon,
 * with each body of land as a hole in it. That inversion is what the lobed
 * landmass forces - there is no longer "a bay" to draw, there is everywhere the
 * land is not.
 */
function outlines(bounds: Rect, coast: Vec2[][]): WaterBody[] {
  const sea: Vec2[] = [
    { x: bounds.minX - CITY_SEA_MARGIN, z: bounds.minZ - CITY_SEA_MARGIN },
    { x: bounds.maxX + CITY_SEA_MARGIN, z: bounds.minZ - CITY_SEA_MARGIN },
    { x: bounds.maxX + CITY_SEA_MARGIN, z: bounds.maxZ + CITY_SEA_MARGIN },
    { x: bounds.minX - CITY_SEA_MARGIN, z: bounds.maxZ + CITY_SEA_MARGIN },
  ];
  return [{ kind: 'bay', outline: sea, holes: coast }];
}
