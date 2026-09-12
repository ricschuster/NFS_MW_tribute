import {
  TERRAIN_CELL,
  TERRAIN_CORE_FLAT,
  TERRAIN_CORE_RADIUS,
  TERRAIN_FEATURE,
  TERRAIN_LATTICE,
  TERRAIN_OCTAVES,
  TERRAIN_BANK,
  TERRAIN_RELIEF,
  TERRAIN_RIM_LIFT,
  TERRAIN_SEABED,
  TERRAIN_SHORE,
  TERRAIN_SOFTEN,
  TERRAIN_STREAM,
} from '../constants';
import { Rng } from './rng';
import type { Water } from './water';
import type { Rect } from './types';
import { planCentre } from './plan';

/**
 * The ground has height (ADR-0007).
 *
 * Everything in Kestrel Bay stood on a plane at zero until now: the only height
 * in the world was the interstate deck at 12 m and its tunnel at -9, and those
 * are properties of a *road*, not of the land. This is the land.
 *
 * **Baked, not a formula.** `water.ts` is a pair of sines and answering "is this
 * water" costs two of them; it would have been natural to do the same here. It
 * is the wrong shape, because the next thing that happens to this data is that
 * roads are cut and filled into it - the terrain is *displaced* to meet a road
 * whose grade a car can climb - and a formula cannot be displaced without
 * becoming a formula plus a lookup of every road near the point, in a function
 * the sim calls every step for every car. A grid of floats is displaced by
 * writing to it. 500 x 400 of them is under a megabyte and O(1) to read.
 *
 * It is still a pure function of the seed, so it is city *data* in exactly the
 * sense building footprints are, and the sim and the renderer read the same
 * array.
 */
export interface Terrain {
  /** The heights, row-major. Sea level is 0. */
  cells: Float32Array;
  cols: number;
  rows: number;
  /** Spacing between samples, in world units. */
  cell: number;
  bounds: Rect;
}

/**
 * Water comes first and the land is shaped to agree with it (ADR-0007 rule 1).
 *
 * The alternative - carve the land and let water pool in the low places - is
 * the one that sounds right and it would invalidate ADR-0005 rules 1 to 3, the
 * connectivity repair, the bridge selection and the embankment, every one of
 * which is built and tested against water that exists before the streets do.
 * So the height field is told where the water is and gets out of its way: below
 * sea level inside it, and rising from the shore rather than starting at 60 m
 * at the water's edge.
 *
 * The seed is its own stream rather than a share of the city's. Drawing from
 * the city's `Rng` here would shift every number after it and reshuffle streets
 * that have nothing to do with the landscape, which would make "change the
 * hills" and "change the city" the same act. They should not be.
 */
export function makeTerrain(seed: number, bounds: Rect, water: Water): Terrain {
  const rng = new Rng(seed ^ TERRAIN_STREAM);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cols = Math.ceil(width / TERRAIN_CELL) + 1;
  const rows = Math.ceil(depth / TERRAIN_CELL) + 1;

  const shape = fractal(rng);
  const wet = new Uint8Array(cols * rows);
  // Inland water kept separately, because a bank is not a beach: the land
  // climbs out of the sea over hundreds of metres and out of a channel over
  // tens. Telling them apart is what `isChannel` is for.
  const inland = new Uint8Array(cols * rows);
  const cells = new Float32Array(cols * rows);

  const at = (col: number, row: number) => ({
    x: bounds.minX + col * TERRAIN_CELL,
    z: bounds.minZ + row * TERRAIN_CELL,
  });

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const p = at(col, row);
      if (!water.isWater(p.x, p.z)) continue;
      wet[row * cols + col] = 1;
      if (water.isChannel(p.x, p.z)) inland[row * cols + col] = 1;
    }
  }

  // Blurred, and this is the important one. A chamfer transform has a ridge
  // down the middle of every strip of land, where the fields from two stretches
  // of coast meet, and the shore ramp turns that ridge into a straight crease
  // hundreds of metres long. Smoothing the *height* afterwards barely touches
  // it - the crease is bigger than any blur worth doing to a landscape.
  // Smoothing the distance before it becomes height removes it at the source.
  const toWater = blur(distanceToWet(wet, cols, rows), cols, rows, TERRAIN_SOFTEN);
  const toBank = blur(distanceToWet(inland, cols, rows), cols, rows, TERRAIN_SOFTEN);

  // The bowl is the *city's*, not the rectangle's. Centred on the map it landed
  // exactly on the island's interior - the only ground far enough from the sea
  // for the shore ramp to have let it rise - so the flattening and the ramp
  // between them held the hills to 75 m of a 120 m budget. Centred on the body
  // of land the city is built on, the flat part is the part that is built on.
  //
  // The plan's downtown, not `water.town` (#249): the latter is the water
  // model's own seeded guess at where the city is, and `npm run plan` found it
  // 2566 m from the middle of the plan's authored downtown and sitting inside
  // the industrial area instead - the same drift `generate.ts` already routes
  // around when it picks which body of land downtown is on. Left uncorrected
  // here, the flat core was centred on industrial rather than downtown.
  const town = { at: planCentre('downtown'), radius: water.lobes[0].radius };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const p = at(col, row);

      if (wet[i]) {
        // A bed under the water rather than a hole in the land, so the surface
        // at zero has something beneath it and a river is a channel rather than
        // a gap in the mesh.
        cells[i] = -TERRAIN_SEABED;
        continue;
      }

      // The land rises from the water. Gently from the sea, over
      // `TERRAIN_SHORE`, or the coast is a cliff wherever the noise happens to
      // be high and #241's quay is a shelf a hundred metres above the water it
      // is beside. **Steeply from a bank**, over `TERRAIN_BANK`, because a
      // channel cut through a landmass has sides and not beaches - and because
      // a river that ramps as gently as the sea flattens the whole interior of
      // an island, which is what held the hills to 75 m.
      //
      // The lower of the two wins: near the sea the sea decides, near a bank
      // the bank does, and inland neither restrains anything.
      const shore = Math.min(
        smooth(Math.min(1, (toWater[i] * TERRAIN_CELL) / TERRAIN_SHORE)),
        smooth(Math.min(1, (toBank[i] * TERRAIN_CELL) / TERRAIN_BANK)),
      );

      // Flat in the middle, hills at the rim. The dense grid is in the middle
      // and every metre of relief under it is cut and fill somebody has to pay
      // for; the reference map this is shaped after does the same thing, with
      // its city in a bowl and its mountains round the edge.
      // Measured against the town's own size, so the basin is the city's
      // whatever the map is doing around it.
      const fromTown = Math.hypot(p.x - town.at.x, p.z - town.at.z) / town.radius;
      const core = 1 - smooth(Math.min(1, fromTown / TERRAIN_CORE_RADIUS));
      // Flat in the middle *and* lifted at the rim: without the second half the
      // city sits in a dish with nothing around it, which is a basin and not a
      // skyline. Together they are what makes a hill somewhere you drive up to.
      const flattened = (1 - TERRAIN_CORE_FLAT * core) * (1 + TERRAIN_RIM_LIFT * (1 - core));

      // Squared rather than clamped at zero. Clamping gives dead-flat plains
      // with hills standing on them and a visible crease where the two meet;
      // squaring a value already in [0, 1] keeps low ground gently uneven and
      // still makes height rare, which is what a landscape looks like.
      const h = (shape(p.x, p.z) + 1) / 2;
      cells[i] = h * h * TERRAIN_RELIEF * shore * flattened;
    }
  }

  soften(cells, wet, cols, rows);

  return { cells, cols, rows, cell: TERRAIN_CELL, bounds };
}

/**
 * Take the creases out.
 *
 * The shore ramp is a function of the distance to the water, and that distance
 * comes from a two-pass chamfer transform - which has a **medial axis**: a
 * ridge running down the middle of every strip of land, where the fields from
 * two stretches of coast meet. The ramp turns that ridge into a visible crease,
 * and on a small body of land it is the dominant feature: straight-edged facets
 * meeting at a sharp line, which is what "some topography seems quite abrupt"
 * was looking at.
 *
 * A few passes of a box blur is the cheap fix and the right one. It is only the
 * artefact that is sharp; the hills underneath are smooth already, and blurring
 * a height field by tens of metres at a ten-metre grid moves nothing that
 * matters. Water is held at its own depth so the coastline does not soften with
 * it - a blurred shoreline is a beach the collision does not agree with.
 */
function blur(field: Float32Array, cols: number, rows: number, passes: number): Float32Array {
  let from: Float32Array = field;
  let to: Float32Array = new Float32Array(field.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
            sum += from[r * cols + c];
            n++;
          }
        }
        to[row * cols + col] = sum / n;
      }
    }
    const swap: Float32Array = from;
    from = to;
    to = swap;
  }
  return from;
}

function soften(cells: Float32Array, wet: Uint8Array, cols: number, rows: number): void {
  const scratch = new Float32Array(cells.length);
  for (let pass = 0; pass < TERRAIN_SOFTEN; pass++) {
    scratch.set(cells);
    for (let row = 1; row < rows - 1; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const i = row * cols + col;
        if (wet[i]) continue;
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const j = i + dr * cols + dc;
            if (wet[j]) continue;
            sum += scratch[j];
            n++;
          }
        }
        if (n > 0) cells[i] = sum / n;
      }
    }
  }
}

/**
 * The height of the ground at a point.
 *
 * A free function over the data rather than a method on it, because the city is
 * data before it is anything else and a closure hung on the data model is not.
 * The test that found this is the one asserting the generator is a pure function
 * of its seed: two runs produced two closures, and two closures are never equal
 * however identical the city around them.
 *
 * Bilinear, because the thing reading it most often is the car, sixty times a
 * second, and a terrain sampled with steps in it is a terrain the suspension can
 * feel. Outside the grid it clamps rather than falling to zero: the map edge is
 * a coast, and a coast that drops to sea level one cell early is a cliff nobody
 * asked for.
 */
export function groundAt(terrain: Terrain, x: number, z: number): number {
  const { cells, cols, rows, cell, bounds } = terrain;
  const fx = Math.min(cols - 1, Math.max(0, (x - bounds.minX) / cell));
  const fz = Math.min(rows - 1, Math.max(0, (z - bounds.minZ) / cell));
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(cols - 1, x0 + 1);
  const z1 = Math.min(rows - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const a = cells[z0 * cols + x0];
  const b = cells[z0 * cols + x1];
  const c = cells[z1 * cols + x0];
  const d = cells[z1 * cols + x1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/**
 * Value noise in a few octaves, in [-1, 1].
 *
 * A lattice of random heights, smoothly interpolated, summed at halving
 * amplitude and doubling frequency. Not Perlin and not simplex: those are
 * better noise and this is a landscape seen from a car at 200 km/h, where what
 * matters is that a hill is a hill and the next one is somewhere else.
 *
 * The caller squares it into [0, 1] rather than using it signed: below sea
 * level is the water field's business, and land that dipped under it would be a
 * lake nothing else in the generator has heard of.
 */
function fractal(rng: Rng): (x: number, z: number) => number {
  const octaves: { grid: Float32Array; scale: number; amplitude: number }[] = [];
  for (let i = 0; i < TERRAIN_OCTAVES; i++) {
    // Halving wavelength and halving amplitude: the first octave is the shape
    // of the land, the last is the texture on it. The lattice stays the same
    // size and the *scale* changes, which is the part that makes an octave an
    // octave - a smaller lattice at the same scale is the same hills repeated,
    // not smaller hills.
    octaves.push({
      grid: lattice(rng, TERRAIN_LATTICE),
      scale: TERRAIN_FEATURE / 2 ** i,
      amplitude: 1 / 2 ** i,
    });
  }
  const total = octaves.reduce((s, o) => s + o.amplitude, 0);

  return (x, z) =>
    octaves.reduce((sum, o) => sum + o.amplitude * valueAt(o.grid, o.scale, x, z), 0) / total;
}

/** One octave's lattice: `size` x `size` values in [-1, 1], wrapped. */
function lattice(rng: Rng, size: number): Float32Array {
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.range(-1, 1);
  return grid;
}

/**
 * One octave sampled at a world position. The lattice wraps, so the world
 * coordinate is scaled into lattice space and taken modulo its size - which
 * means the noise tiles over a distance far larger than the map and nobody ever
 * sees the seam.
 */
function valueAt(grid: Float32Array, scale: number, x: number, z: number): number {
  const size = TERRAIN_LATTICE;
  const fx = x / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = smooth(fx - x0);
  const tz = smooth(fz - z0);
  const wrap = (v: number) => ((v % size) + size) % size;
  const a = grid[wrap(z0) * size + wrap(x0)];
  const b = grid[wrap(z0) * size + wrap(x0 + 1)];
  const c = grid[wrap(z0 + 1) * size + wrap(x0)];
  const d = grid[wrap(z0 + 1) * size + wrap(x0 + 1)];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Smoothstep. Interpolating a lattice linearly leaves creases along it. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * How many cells each dry cell is from the nearest wet one.
 *
 * A chamfer transform: one pass down and right, one back up and left, taking
 * the best of each neighbour plus the step to it. Two passes is exact enough
 * for a shore ramp measured in hundreds of metres, and it is O(cells) where
 * asking "how far is the water" per cell by search is not.
 */
function distanceToWet(wet: Uint8Array, cols: number, rows: number): Float32Array {
  const far = cols + rows;
  const d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = wet[i] ? 0 : far;

  const diagonal = Math.SQRT2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (row > 0) d[i] = Math.min(d[i], d[i - cols] + 1);
      if (col > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (row > 0 && col > 0) d[i] = Math.min(d[i], d[i - cols - 1] + diagonal);
      if (row > 0 && col < cols - 1) d[i] = Math.min(d[i], d[i - cols + 1] + diagonal);
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      const i = row * cols + col;
      if (row < rows - 1) d[i] = Math.min(d[i], d[i + cols] + 1);
      if (col < cols - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (row < rows - 1 && col < cols - 1) d[i] = Math.min(d[i], d[i + cols + 1] + diagonal);
      if (row < rows - 1 && col > 0) d[i] = Math.min(d[i], d[i + cols - 1] + diagonal);
    }
  }
  return d;
}
