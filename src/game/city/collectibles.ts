import {
  BILLBOARD_COUNT,
  CAMERA_COUNT,
  BILLBOARD_SPACING,
  CAMERA_SPACING,
  BILLBOARD_KERB_GAP,
  BILLBOARD_WIDTH,
  CAMERA_KERB_GAP,
} from '../constants';
import type { Rng } from './rng';
import type { City, CityRoad, Collectible, CollectibleKind, Vec2 } from './types';

/**
 * Things to find in Kestrel Bay (#93).
 *
 * Billboards to smash and speed cameras to be clocked by, placed against the
 * generated street network the same way the street furniture is: on the kerb,
 * facing the road, derived from the graph rather than scattered. Like
 * everything else in `city/` this emits a *description* and never geometry -
 * the sim collides with a billboard without a renderer in the room, and the
 * playtests build a city headlessly.
 *
 * Spread is the whole design problem. Ninety billboards dropped at random land
 * in clumps, and a clump is one discovery rather than six: they are placed
 * with a minimum spacing instead, and a city that cannot fit the target count
 * gets fewer rather than a pile in the downtown.
 */
export function collectiblesFor(rng: Rng, city: City): Collectible[] {
  const found: Collectible[] = [];
  let id = 0;

  const blocked = buildingIndex(city);

  // Billboards go anywhere with a kerb worth standing on. Speed cameras go on
  // the fast roads only: a camera on a residential street is a camera nobody
  // is ever going past quickly enough for it to be worth anything.
  const anyRoad = city.roads.filter(
    (road) => road.class !== 'ramp' && road.length > BILLBOARD_WIDTH * 2 && !road.bridge,
  );
  const fastRoads = anyRoad.filter(
    (road) => road.class === 'arterial' || road.class === 'boulevard' || road.class === 'interstate',
  );

  place('billboard', shuffled(rng, anyRoad), BILLBOARD_COUNT, BILLBOARD_SPACING, BILLBOARD_KERB_GAP);
  place('camera', shuffled(rng, fastRoads), CAMERA_COUNT, CAMERA_SPACING, CAMERA_KERB_GAP);

  return found;

  function place(
    kind: CollectibleKind,
    roads: CityRoad[],
    want: number,
    spacing: number,
    gap: number,
  ): void {
    let placed = 0;
    for (const road of roads) {
      if (placed >= want) return;

      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.max(1, Math.hypot(dx, dz));
      const dir = { x: dx / length, z: dz / length };
      // Which side of the road, and how far along it. Both from the seeded
      // rng, so the same city always has the same billboards in it.
      const side = rng.chance(0.5) ? 1 : -1;
      const along = rng.range(0.3, 0.7);
      const offset = road.width / 2 + gap;

      const at: Vec2 = {
        x: a.x + dx * along - dir.z * offset * side,
        z: a.z + dz * along + dir.x * offset * side,
      };

      if (outsideMap(city, at)) continue;
      if (insideSomething(blocked, at)) continue;
      if (crowded(found, kind, at, spacing)) continue;

      found.push({
        id: id++,
        kind,
        at,
        y: city.nodes[road.a].y,
        // Turned to face across the road, so a board faces the traffic and a
        // camera looks at it rather than along the pavement.
        angle: Math.atan2(dir.z * side, -dir.x * side),
        road: road.id,
      });
      placed++;
    }
  }
}

/** A copy of `roads`, in a seeded random order. */
function shuffled<T>(rng: Rng, items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function outsideMap(city: City, at: Vec2): boolean {
  const b = city.bounds;
  return at.x < b.minX || at.x > b.maxX || at.z < b.minZ || at.z > b.maxZ;
}

/** Too close to another of the same kind to be a separate discovery. */
function crowded(found: Collectible[], kind: CollectibleKind, at: Vec2, spacing: number): boolean {
  for (const other of found) {
    if (other.kind !== kind) continue;
    if (Math.hypot(other.at.x - at.x, other.at.z - at.z) < spacing) return true;
  }
  return false;
}

/**
 * A coarse cell index of building footprints.
 *
 * The generator has no spatial index of its own - `CityGrid` is the sim's -
 * and a linear scan of four thousand buildings for every candidate is a
 * noticeable chunk of generation time. This is the same trick `furniture.ts`
 * uses for roads.
 */
const CELL = 4000;

function buildingIndex(city: City): Map<string, { minX: number; minZ: number; maxX: number; maxZ: number }[]> {
  const index = new Map<string, { minX: number; minZ: number; maxX: number; maxZ: number }[]>();
  for (const building of city.buildings) {
    const f = building.footprint;
    for (let x = Math.floor(f.minX / CELL); x <= Math.floor(f.maxX / CELL); x++) {
      for (let z = Math.floor(f.minZ / CELL); z <= Math.floor(f.maxZ / CELL); z++) {
        const key = `${x}|${z}`;
        const cell = index.get(key);
        if (cell) cell.push(f);
        else index.set(key, [f]);
      }
    }
  }
  return index;
}

function insideSomething(
  index: Map<string, { minX: number; minZ: number; maxX: number; maxZ: number }[]>,
  at: Vec2,
): boolean {
  const key = `${Math.floor(at.x / CELL)}|${Math.floor(at.z / CELL)}`;
  for (const f of index.get(key) ?? []) {
    if (at.x >= f.minX && at.x <= f.maxX && at.z >= f.minZ && at.z <= f.maxZ) return true;
  }
  return false;
}
