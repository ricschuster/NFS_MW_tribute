import {
  AMBUSH_COUNT,
  AMBUSH_SPACING,
  AMBUSH_FIRST_LEVEL,
  HEAT_LEVEL_COUNT,
} from '../constants';
import type { AmbushSpot, City } from './types';

/**
 * Where the police will jump you (#92).
 *
 * Five spots at rising heat, spread as far apart as the map allows. The spread
 * is doing two jobs: an ambush is a place you go to on purpose, so they have
 * to be findable in different quarters, and the heat rises with the distance
 * from the middle so the hardest one is also the furthest from anywhere.
 *
 * They go on junctions off the arterials rather than on them: springing a trap
 * on a four-lane road with two clear exits is not a trap, and springing one in
 * a dead end is not an event either.
 */
export function ambushesFor(city: City): AmbushSpot[] {
  const spots: AmbushSpot[] = [];

  // Junctions with three or four roads: somewhere with a way out, but not a
  // motorway. Sorted by how far out they are, so the far ones are the hot ones.
  const middle = {
    x: (city.bounds.minX + city.bounds.maxX) / 2,
    z: (city.bounds.minZ + city.bounds.maxZ) / 2,
  };
  const junctions = city.nodes
    .filter((node) => node.level === 'surface' && node.roads.length >= 3)
    .filter((node) =>
      node.roads.every((id) => {
        const road = city.roads[id];
        return road.class !== 'interstate' && road.class !== 'ramp' && !road.bridge;
      }),
    )
    // Three of those roads have to go somewhere. A junction where cul-de-sacs
    // leave a boulevard (#487) counts three roads and has two ways out, and
    // the cars sprung there have nowhere to come from but the one road in.
    .filter((node) => node.roads.filter((id) => !leadsNowhere(city, node.id, id)).length >= 3)
    .sort(
      (a, b) =>
        Math.hypot(a.pos.x - middle.x, a.pos.z - middle.z) -
        Math.hypot(b.pos.x - middle.x, b.pos.z - middle.z),
    );

  for (const node of junctions) {
    if (spots.length >= AMBUSH_COUNT) break;
    if (spots.some((s) => Math.hypot(s.at.x - node.pos.x, s.at.z - node.pos.z) < AMBUSH_SPACING)) {
      continue;
    }
    spots.push({
      at: node.pos,
      level: Math.min(HEAT_LEVEL_COUNT, AMBUSH_FIRST_LEVEL + spots.length),
    });
  }
  return spots;
}

/**
 * Whether a road off a junction only ends: followed through its plain
 * through-points, it stops at a node nothing else meets.
 */
function leadsNowhere(city: City, from: number, roadId: number): boolean {
  let node = from;
  let id = roadId;
  for (let steps = 0; steps < 200; steps++) {
    const road = city.roads[id];
    node = road.a === node ? road.b : road.a;
    const next = city.nodes[node].roads;
    if (next.length === 1) return true;
    if (next.length !== 2) return false;
    id = next[0] === id ? next[1] : next[0];
  }
  return false;
}
