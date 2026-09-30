import { CITY_WOODS_STREAM, POND_LIFT, UNITS_PER_METRE } from '../constants';
import { distanceToSegment } from './grid';
import { cellRandom, valueNoise } from './highmoor';
import { lumpyLoop } from './places';
import { PLAN_DISTRICTS, inArea } from './plan';
import { hitsSetPiece } from './setpieces';
import { groundAt, type Terrain } from './terrain';
import type { AuthoredProp, CityNode, CityRoad, SetPiece, Vec2, WaterBody } from './types';

const M = UNITS_PER_METRE;

/**
 * Tidewater Park's ponds (#461): the owner's landscaped city park has ponds
 * and lawns. One in the west lawns between the top drive and the one down to
 * the shore, one inside the east loop. Both are kept 75 m or more off the
 * freeway's tunnel line and 100 m off every drive, so nothing was routed round
 * them and nothing needs to be. `x`, `z` and `r` are metres from the map's
 * origin.
 */
export const TIDEWATER_PONDS = [
  { x: 390, z: -2630, r: 55 },
  { x: 810, z: -2760, r: 45 },
].map((p) => ({ at: { x: p.x * M, z: p.z * M }, radius: p.r * M }));

/** How far below its surface a pond's bed lies. */
const POND_DEPTH = 1.5 * M;
/** How far out from the water its bank grades back up to the lawn. */
const POND_BANK = 14 * M;

function pondOutline(i: number): Vec2[] {
  const pond = TIDEWATER_PONDS[i];
  return lumpyLoop(pond.at, pond.radius, 20, 0.9 + i * 2.3, 0.16);
}

function distanceToOutline(outline: Vec2[], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    d = Math.min(d, distanceToSegment(x, z, outline[j].x, outline[j].z, outline[i].x, outline[i].z));
  }
  return d;
}

/**
 * Dig the ponds into the park and hand back the water in them.
 *
 * The park is not flat - it rises a couple of metres across a pond's width -
 * so a pond's surface laid at the ground under its middle, as the quarry's
 * are on the pit floor, would be buried along its uphill side. Instead the
 * surface is set at the lowest ground round its edge, the bed is dug
 * `POND_DEPTH` under that, and the ground for `POND_BANK` outside grades back
 * up to the lawn it was: a pond sits in a hollow, and the water is level.
 *
 * Runs with the places, before any road is laid, so the router and the sim
 * see the hollow rather than the lawn it was cut from. Lowered only, never
 * raised.
 */
export function digTidewaterPonds(terrain: Terrain): WaterBody[] {
  if (!PLAN_DISTRICTS.some((a) => a.name === 'Tidewater Park')) return [];
  return TIDEWATER_PONDS.map((pond, i) => {
    const outline = pondOutline(i);
    let rim = Infinity;
    for (const p of outline) rim = Math.min(rim, groundAt(terrain, p.x, p.z));
    const level = rim - POND_LIFT * 2;
    const bed = level - POND_DEPTH;
    const { cells, cols, rows, cell, bounds } = terrain;
    const reach = pond.radius * 1.3 + POND_BANK;
    const minCol = Math.max(0, Math.floor((pond.at.x - reach - bounds.minX) / cell));
    const maxCol = Math.min(cols - 1, Math.ceil((pond.at.x + reach - bounds.minX) / cell));
    const minRow = Math.max(0, Math.floor((pond.at.z - reach - bounds.minZ) / cell));
    const maxRow = Math.min(rows - 1, Math.ceil((pond.at.z + reach - bounds.minZ) / cell));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = bounds.minX + col * cell;
        const z = bounds.minZ + row * cell;
        const k = row * cols + col;
        const edge = distanceToOutline(outline, x, z);
        // Inside, the bed deepens away from the edge over one cell, so the
        // water's edge is the shore rather than a step.
        const want = inArea(outline, { x, z })
          ? level - Math.min(1, edge / cell) * POND_DEPTH
          : edge < POND_BANK
            ? level + (cells[k] - level) * (edge / POND_BANK)
            : cells[k];
        if (want < cells[k]) cells[k] = Math.max(bed, want);
      }
    }
    return { kind: 'pond' as const, outline, level };
  });
}

/**
 * The park's trees (#461): a landscaped park is lawns with trees on them, not
 * a wood - specimen trees standing on their own and in loose clumps, with
 * open grass between. Generated for the reason Highmoor's woods are, and on
 * the same lattice and numbers (`cellRandom`), with a wider cell and a slow
 * noise that gathers them into clumps rather than thinning a wood into glades.
 *
 * Kept off a road a race runs on by the same cleared verge the Climb needed
 * (`RACED_CLEAR`), because a driver who runs a corner wide goes further than a
 * verge; off every other road by a pavement's width and a little. Kept off the
 * ponds' edges, so the water is seen across open grass, and off the shore,
 * where the lawn meets the sea.
 */
const PARK_CELL = 20;
const ROAD_CLEAR = 8;
const RACED_CLEAR = 5 + 18;
const POND_CLEAR = 10;
const PROP_CLEAR = 14;

export function parkTreesFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  pieces: readonly SetPiece[],
  clear: readonly AuthoredProp[],
  raced: readonly Vec2[][] = [],
): AuthoredProp[] {
  const park = PLAN_DISTRICTS.find((a) => a.name === 'Tidewater Park');
  if (!park) return [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of park.poly) {
    minX = Math.min(minX, p.x / M); maxX = Math.max(maxX, p.x / M);
    minZ = Math.min(minZ, p.z / M); maxZ = Math.max(maxZ, p.z / M);
  }
  const near = roads
    .map((r) => ({ a: nodes[r.a].pos, b: nodes[r.b].pos, level: nodes[r.a].level, half: r.width / 2 / M + ROAD_CLEAR }))
    .filter(({ a, b, level }) => level !== 'tunnel' && Math.max(a.x, b.x) / M > minX - 50 && Math.min(a.x, b.x) / M < maxX + 50 && Math.max(a.z, b.z) / M > minZ - 50 && Math.min(a.z, b.z) / M < maxZ + 50);
  const racing = raced.flatMap((line) => line.slice(1).map((b, k) => ({ a: line[k], b })))
    .filter(({ a, b }) => Math.max(a.x, b.x) / M > minX && Math.min(a.x, b.x) / M < maxX && Math.max(a.z, b.z) / M > minZ && Math.min(a.z, b.z) / M < maxZ);
  const ponds = TIDEWATER_PONDS.map((_, i) => pondOutline(i));
  const clumps = valueNoise(CITY_WOODS_STREAM ^ 0x54696465, 70);

  const trees: AuthoredProp[] = [];
  for (let i = Math.floor(minX / PARK_CELL); i * PARK_CELL < maxX; i++) {
    for (let j = Math.floor(minZ / PARK_CELL); j * PARK_CELL < maxZ; j++) {
      const x = (i + 0.1 + 0.8 * cellRandom(i, j, 5)) * PARK_CELL;
      const z = (j + 0.1 + 0.8 * cellRandom(i, j, 6)) * PARK_CELL;
      const at = { x: x * M, z: z * M };
      if (!inArea(park.poly, at)) continue;
      // Specimen trees everywhere, thin; clumps where the noise gathers them.
      const c = clumps(x, z);
      const keep = 0.14 + 0.8 * Math.max(0, (c - 0.5) / 0.5);
      if (cellRandom(i, j, 7) >= keep) continue;
      // Not on the shore: the west lawns are barely a metre above the sea, so
      // the line is drawn just above the water rather than at a round height.
      if (groundAt(terrain, at.x, at.z) / M < 0.6) continue;
      if (near.some(({ a, b, half }) => distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < half)) continue;
      if (racing.some(({ a, b }) => distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M < RACED_CLEAR)) continue;
      if (ponds.some((outline) => inArea(outline, at) || distanceToOutline(outline, at.x, at.z) / M < POND_CLEAR)) continue;
      if (clear.some((p) => Math.hypot(p.x - x, p.z - z) < PROP_CLEAR)) continue;
      if (hitsSetPiece(pieces, at.x, at.z, -Infinity, 3 * M, Infinity)) continue;
      const angle = Math.round(cellRandom(i, j, 8) * Math.PI * 2 * 1000) / 1000;
      trees.push({ kind: 'tree', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, angle });
    }
  }
  return trees;
}
