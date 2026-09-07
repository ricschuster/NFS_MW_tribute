import {
  LAMP_SPACING,
  LAMP_KERB_GAP,
  SIGN_KERB_GAP,
  BARRIER_SPACING,
  UNITS_PER_METRE,
  WATER_END_REACH,
} from '../constants';
import { inWater } from './grid';
import type { Rng } from './rng';
import type { City, CityRoad, StreetProp } from './types';

/**
 * Street furniture: lamps down the roads, signs at the junctions, barriers
 * along the bridge parapets (#84).
 *
 * Like buildings, furniture is a *description* and not geometry, for the same
 * two reasons: the art can be upgraded by swapping a provider, and the sim can
 * collide with a lamp post without a renderer in the room.
 *
 * Placement is derived from the road graph rather than scattered, so furniture
 * lands where furniture goes - on the kerb, facing the road - instead of in the
 * middle of a carriageway.
 */
export function furnitureFor(rng: Rng, city: City): StreetProp[] {
  const props: StreetProp[] = [];

  for (const road of city.roads) {
    // A ramp is short, sloped and joins two levels; lighting it properly means
    // interpolating height along it, which is not worth it for a 200 m slip road.
    if (road.class === 'ramp') continue;
    if (road.bridge) barriers(city, road, props);
    else lamps(rng, city, road, props);
  }

  signs(rng, city, props);
  waterEnds(city, props);

  // Furniture on the perimeter road is offset outwards onto ground that does
  // not exist, so it would stand in the sea. Drop it rather than clamp it: a
  // lamp shuffled back onto the kerb is a lamp in the road.
  const { bounds } = city;
  const inside = props.filter(
    (prop) =>
      prop.at.x >= bounds.minX &&
      prop.at.x <= bounds.maxX &&
      prop.at.z >= bounds.minZ &&
      prop.at.z <= bounds.maxZ,
  );

  return inside.filter((prop) => prop.kind === 'barrier' || !inSomeRoad(city, prop));
}

/**
 * Is this prop standing in a live lane of *any* road?
 *
 * Placing furniture relative to its own road is not enough once roads bend. A
 * boulevard crosses a street at whatever angle it likes, so a lamp set neatly
 * on one road's kerb can be in the middle of another one. Junction ends are
 * excluded, where a kerb is legitimately inside the carriageway it corners on.
 */
function inSomeRoad(city: City, prop: StreetProp): boolean {
  const cell = ROAD_LOOKUP_CELL;
  const index = roadIndex(city);
  const key = `${Math.floor(prop.at.x / cell)}|${Math.floor(prop.at.z / cell)}`;

  for (const id of index.get(key) ?? []) {
    const road = city.roads[id];
    const a = city.nodes[road.a];
    const b = city.nodes[road.b];
    if (a.y !== prop.y || b.y !== prop.y) continue;

    const distance = pointToSegment(prop.at.x, prop.at.z, a.pos.x, a.pos.z, b.pos.x, b.pos.z);
    if (distance >= road.width / 2) continue;

    const clear = Math.min(road.width, road.length / 3);
    const fromA = Math.hypot(prop.at.x - a.pos.x, prop.at.z - a.pos.z);
    const fromB = Math.hypot(prop.at.x - b.pos.x, prop.at.z - b.pos.z);
    if (fromA > clear && fromB > clear) return true;
  }
  return false;
}

const ROAD_LOOKUP_CELL = 400 * 135;
let cachedIndex: { city: City; cells: Map<string, number[]> } | null = null;

/** A coarse road index, kept beside the city it was built for. */
function roadIndex(city: City): Map<string, number[]> {
  if (cachedIndex?.city === city) return cachedIndex.cells;

  const cells = new Map<string, number[]>();
  city.roads.forEach((road, id) => {
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const half = road.width / 2;
    const minX = Math.min(a.x, b.x) - half;
    const maxX = Math.max(a.x, b.x) + half;
    const minZ = Math.min(a.z, b.z) - half;
    const maxZ = Math.max(a.z, b.z) + half;
    for (let gx = Math.floor(minX / ROAD_LOOKUP_CELL); gx <= Math.floor(maxX / ROAD_LOOKUP_CELL); gx++) {
      for (let gz = Math.floor(minZ / ROAD_LOOKUP_CELL); gz <= Math.floor(maxZ / ROAD_LOOKUP_CELL); gz++) {
        const key = `${gx}|${gz}`;
        const list = cells.get(key);
        if (list) list.push(id);
        else cells.set(key, [id]);
      }
    }
  });

  cachedIndex = { city, cells };
  return cells;
}

/** Shortest distance from a point to a segment. */
function pointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Where a road points, the unit vector across it, and the height it sits at. */
function frame(city: City, road: CityRoad) {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const length = Math.max(1, road.length);
  const along = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  const y = (city.nodes[road.a].y + city.nodes[road.b].y) / 2;
  return { a, along, across: { x: -along.z, z: along.x }, y };
}

/**
 * Lamps down each kerb, alternating sides. Alternating rather than paired is
 * both how most streets are actually lit and half as many instances.
 */
function lamps(rng: Rng, city: City, road: CityRoad, props: StreetProp[]): void {
  // Splitting roads at every crossing leaves stubs a few metres long between
  // close junctions. They are not streets to light, and lighting them puts a
  // lamp in the middle of the junction: on a stub shorter than the spacing the
  // first lamp lands at its midpoint, which on a wide arterial is far enough
  // sideways to stand in the crossing road.
  if (road.length < LAMP_SPACING * 1.5) return;

  const { a, along, across, y } = frame(city, road);
  const offset = road.width / 2 + LAMP_KERB_GAP;
  const angle = Math.atan2(along.x, along.z);

  // Leave the junction ends clear, where the kerb is a corner rather than a run.
  const first = Math.min(LAMP_SPACING, road.length / 2);
  let side = rng.chance(0.5) ? 1 : -1;

  for (let at = first; at < road.length - first * 0.5; at += LAMP_SPACING) {
    props.push({
      at: { x: a.x + along.x * at + across.x * offset * side, z: a.z + along.z * at + across.z * offset * side },
      y,
      angle,
      // The arm reaches back over the road the lamp was offset from.
      reach: -side as -1 | 1,
      kind: 'lamp',
      variant: rng.float(),
    });
    side = -side;
  }
}

/** A parapet down both sides of every bridge deck, because the drop is real. */
function barriers(city: City, road: CityRoad, props: StreetProp[]): void {
  const { a, along, across, y } = frame(city, road);
  const offset = road.width / 2;
  const angle = Math.atan2(along.x, along.z);

  for (let at = 0; at < road.length; at += BARRIER_SPACING) {
    for (const side of [1, -1]) {
      props.push({
        at: {
          x: a.x + along.x * at + across.x * offset * side,
          z: a.z + along.z * at + across.z * offset * side,
        },
        y,
        angle,
        reach: 0,
        kind: 'barrier',
        variant: 0,
      });
    }
  }
}

/**
 * A parapet across a road that the water cut off (#241).
 *
 * Water is generated first and the streets are clipped against it (ADR-0005),
 * so a street that crossed the river ends wherever the bank is. Measured, that
 * is **106 of the 109 dead ends in the whole network**, a median of 4 m from
 * the water, and every one of them was a carriageway that simply stopped.
 *
 * Not a gameplay hole - `CityWorld.dunk` handles driving in, so the river is
 * not a level boundary and does not want to be one. It is a *finish* problem:
 * a road that stops dead reads as the map having run out rather than as the
 * city meeting the water, and it was the most repeated unfinished edge in
 * Kestrel Bay.
 *
 * The same parapet the bridges carry, laid *across* the end rather than along
 * the sides, which is what the two arguments to `frame` already give: `across`
 * is the direction over the carriageway.
 */
function waterEnds(city: City, props: StreetProp[]): void {
  for (const node of city.nodes) {
    // A dead end is a node with one road on it, at street level.
    if (node.y !== 0 || node.roads.length !== 1) continue;
    const road = city.roads[node.roads[0]];
    if (road.bridge || road.class === 'ramp' || road.class === 'interstate') continue;

    // Only the ones the water made. A cul-de-sac that ends in dry land is a
    // street that stops, which is a normal thing for a street to do.
    const other = city.nodes[road.a === node.id ? road.b : road.a].pos;
    const dx = node.pos.x - other.x;
    const dz = node.pos.z - other.z;
    const run = Math.max(1, Math.hypot(dx, dz));
    let wet = false;
    for (let d = 0; d <= WATER_END_REACH && !wet; d += UNITS_PER_METRE * 4) {
      wet = inWater(city, node.pos.x + (dx / run) * d, node.pos.z + (dz / run) * d);
    }
    if (!wet) continue;

    // Across the mouth, a little short of the end so the rail sits on tarmac
    // rather than over the edge of it.
    const angle = Math.atan2(dz, dx);
    const backX = node.pos.x - (dx / run) * (UNITS_PER_METRE * 2);
    const backZ = node.pos.z - (dz / run) * (UNITS_PER_METRE * 2);
    const half = road.width / 2;
    for (let at = -half; at <= half; at += BARRIER_SPACING) {
      props.push({
        at: { x: backX + (-dz / run) * at, z: backZ + (dx / run) * at },
        y: 0,
        angle,
        reach: 0,
        kind: 'barrier',
        variant: 0,
      });
    }
  }
}

/**
 * A sign on one corner of each proper junction. Only where three or more roads
 * meet: the places a graph node exists purely because a road was cut in two are
 * not junctions, and putting a signpost at each of them would line the streets
 * with them.
 */
function signs(rng: Rng, city: City, props: StreetProp[]): void {
  for (const node of city.nodes) {
    // Street signs belong on streets. The interstate has no junctions to name,
    // and a signpost on a viaduct deck is a signpost hanging in the air.
    if (node.y !== 0) continue;

    // Only the roads at street level count, in both senses: a ramp arriving
    // here does not make a crossroads out of a bend, and measuring against one
    // would measure against a road that climbs away out of the junction.
    const streets = node.roads
      .map((id) => city.roads[id])
      .filter((r) => r.class === 'street' || r.class === 'arterial');
    if (streets.length < 3) continue;

    // Measure from the longest of them, not whichever happened to be added
    // first. The step back has to stay on the road it is stepping along; taken
    // along an 11 m fragment of arterial it sails past the junction at the far
    // end and lands in the street crossing *that* one.
    const road = streets.reduce((best, r) => (r.length > best.length ? r : best));
    const { along, across } = frame(city, road);

    // A corner, not a side. Offsetting only across this road lands the sign on
    // the centreline of the road crossing it, which is the middle of the
    // junction. Stepping sideways clears this road and stepping along it clears
    // the crossing one, and doing both puts the sign on the kerb corner.
    const widest = Math.max(...streets.map((r) => r.width));
    const sideways = road.width / 2 + SIGN_KERB_GAP;
    const backwards = widest / 2 + SIGN_KERB_GAP;
    // Nowhere safe to stand: a junction of nothing but stubs goes unsigned.
    if (road.length < backwards * 2) continue;

    // Step *into* the road, not off the end of it. `along` runs from the road's
    // a end to its b end, so at a junction that is the b end, stepping forwards
    // walks past the junction and out the other side - which is how a signpost
    // ends up standing in the crossing street rather than on the corner.
    const inward = node.id === road.a ? 1 : -1;
    const side = rng.chance(0.5) ? 1 : -1;

    props.push({
      at: {
        x: node.pos.x + across.x * sideways * side + along.x * backwards * inward,
        z: node.pos.z + across.z * sideways * side + along.z * backwards * inward,
      },
      y: 0,
      angle: Math.atan2(along.x, along.z),
      reach: 0,
      kind: 'sign',
      variant: rng.float(),
    });
  }
}
