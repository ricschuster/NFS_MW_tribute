import { UNITS_PER_METRE } from '../constants';
import { distanceToRoad } from './grid';
import type { City, LevelCrossing, Vec2 } from './types';

const M = UNITS_PER_METRE;
/** How far off the kerb a warning post stands. */
const POST_KERB = 1.2 * M;
/** How far clear of the ballast's edge, along the street, a post stands. */
const POST_CLEAR = 1.5 * M;
/**
 * Below this the street and the line are too near parallel for a crossing to
 * have a shape: the band the street cuts through the ballast runs away along
 * the line. None of Kestrel Bay's comes close; this keeps a future one from
 * cutting a railway in half.
 */
const MIN_SINE = 0.25;
/** However the post search goes, it stops here. */
const MAX_ALONG = 30 * M;

/**
 * Where a railway crosses a street on the level (#514).
 *
 * `buildGraph` already splits both roads at the point they cross, so a level
 * crossing is a node with a `rail` road and an ordinary one meeting at it.
 * Nothing about driving changes here: the crossing is the street's, and
 * `surfaceAt` says so. What this adds is the description the renderer needs to
 * draw it as one - which way the street runs through it and how wide it is,
 * so the ballast can stop at its kerbs and the rails can run on through the
 * tarmac, and where the warning posts go.
 *
 * Derived from the finished graph and drawing nothing from any `Rng`, so
 * adding it moves nothing else the generator places.
 */
export function levelCrossingsFor(city: City): LevelCrossing[] {
  const crossings: LevelCrossing[] = [];
  for (const node of city.nodes) {
    const roads = node.roads.map((id) => city.roads[id]);
    const rails = roads.filter((road) => road.surface === 'rail' && !road.bridge);
    const streets = roads.filter((road) => road.surface !== 'rail' && !road.bridge);
    if (rails.length === 0 || streets.length === 0) continue;

    // Which way the street goes through: from one arm to the other, so a
    // street that bends at the line is read as the line between its arms
    // rather than as either one of them.
    const out = streets.map((road) => away(city, road.a === node.id ? road.b : road.a, node.pos));
    const through =
      out.length >= 2 ? unit({ x: out[0].x - out[1].x, z: out[0].z - out[1].z }) : out[0];
    const rail = away(city, rails[0].a === node.id ? rails[0].b : rails[0].a, node.pos);
    const sine = Math.abs(through.x * rail.z - through.z * rail.x);
    if (sine < MIN_SINE) continue;

    const width = Math.max(...streets.map((road) => road.width));
    const railWidth = Math.max(...rails.map((road) => road.width));

    // A post on each corner, one pair per side of the line: off the kerb, and
    // far enough back along the street to stand clear of the ballast however
    // the street meets it.
    const across = { x: -through.z, z: through.x };
    const posts: LevelCrossing['posts'] = [];
    for (const side of [-1, 1]) {
      for (const kerb of [-1, 1]) {
        const lateral = kerb * (width / 2 + POST_KERB);
        // Stepped out rather than solved for: the line can bend at the node,
        // and what matters is the distance to the ballast actually there.
        const need = railWidth / 2 + POST_CLEAR;
        const at = (along: number): Vec2 => ({
          x: node.pos.x + through.x * along * side + across.x * lateral,
          z: node.pos.z + through.z * along * side + across.z * lateral,
        });
        const clear = (p: Vec2) =>
          rails.every((road) => distanceToRoad(city, road, p.x, p.z) >= need);
        let along = 0;
        while (!clear(at(along)) && along < MAX_ALONG) along += 0.25 * M;
        posts.push({
          at: at(along),
          // Facing the traffic coming towards the line on this side.
          angle: Math.atan2(through.x * side, through.z * side),
        });
      }
    }

    crossings.push({
      node: node.id,
      at: node.pos,
      y: node.y,
      rails: rails.map((road) => road.id),
      streets: streets.map((road) => road.id),
      through,
      width,
      posts,
    });
  }
  return crossings;
}

function away(city: City, to: number, from: Vec2): Vec2 {
  const p = city.nodes[to].pos;
  return unit({ x: p.x - from.x, z: p.z - from.z });
}

function unit(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / length, z: v.z / length };
}
