import { QUARRY_DIRT_REACH, TRUCK_HALF_LENGTH } from '../constants';
import { PLAN_PLACES } from './plan';
import type { City, CityRoad } from './types';

/**
 * The haul road, in order from the loading point up: the chain of gravel road
 * that starts at the quarry's one dead end and runs until it first meets a
 * junction. Found by the network's shape rather than by a radius, because the
 * rim loop and the spiral's outer turn are a hundred metres apart and a
 * distance that told them apart would be a number tuned to one map.
 */
export function haulRoad(city: City): CityRoad[] {
  const pit = PLAN_PLACES.find((p) => p.kind === 'quarry');
  if (!pit) return [];
  const reach = pit.radius * QUARRY_DIRT_REACH;
  const gravel = city.roads.filter((road) => {
    if (road.surface !== 'gravel' || road.bridge) return false;
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    return Math.hypot((a.x + b.x) / 2 - pit.at.x, (a.z + b.z) / 2 - pit.at.z) <= reach;
  });
  const at = new Map<number, CityRoad[]>();
  for (const road of city.roads) {
    for (const node of [road.a, road.b]) {
      const list = at.get(node);
      if (list) list.push(road);
      else at.set(node, [road]);
    }
  }
  // The loading point: the gravel dead end nearest the middle of the pit.
  let node = -1;
  let nearest = Infinity;
  for (const road of gravel) {
    for (const end of [road.a, road.b]) {
      if (at.get(end)!.length !== 1) continue;
      const pos = city.nodes[end].pos;
      const gap = Math.hypot(pos.x - pit.at.x, pos.z - pit.at.z);
      if (gap < nearest) {
        nearest = gap;
        node = end;
      }
    }
  }
  const chain: CityRoad[] = [];
  let road: CityRoad | undefined = node < 0 ? undefined : at.get(node)![0];
  while (road && gravel.includes(road) && !chain.includes(road)) {
    chain.push(road);
    node = road.a === node ? road.b : road.a;
    const next = at.get(node)!;
    if (next.length !== 2) break;
    road = next.find((r) => r !== road);
  }
  // Turn round short of the rim rather than in its junction, which the
  // Halloway Rim runs through: a truck swinging round there sat on the racing
  // line. Two truck lengths of the top of the haul road are left empty.
  let spare = TRUCK_HALF_LENGTH * 4;
  while (chain.length > 1 && spare > 0) spare -= chain.pop()!.length;
  return chain;
}
