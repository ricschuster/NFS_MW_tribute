// Turn the edited network into the generator's input.
//
// This is the step that closes the loop. Until now the roads went one way -
// generated, exported, edited, checked - and the edits lived in a document the
// generator had never heard of, which meant the next regeneration would throw
// them away. After this, `city/roads.ts` is what the city is laid from, and the
// generator's own road-making is the thing that has been retired.
//
// The districts went the same way at ADR-0009 and for the same reason: a road
// somebody drew is a judgement, and there are seventy-four of them, which is few
// enough to keep and too many to redo.
//
// Usage:
//   npm run roadsync                       # docs/roads-edited.json -> src/game/city/roads.ts
import { readFileSync, writeFileSync } from 'node:fs';

const source = process.argv[2] ?? 'docs/roads-edited.json';
const out = 'src/game/city/roads.ts';
const raw = JSON.parse(readFileSync(source, 'utf8'));
const roads = (raw.roads ?? raw.data?.roads ?? []).filter((r) => r.points.length >= 2);

const length = (points) => {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return d;
};

// Stitch the network before writing it.
//
// The generator makes a junction where two spans **meet** - they cross, or they
// share a point exactly. It does not make one where they merely come close, and
// nothing in the editor was making them meet: a road dragged by its handle stops
// sharing its old endpoint, and a road drawn towards another one stops a few
// metres short of it. Everything still *looked* connected.
//
// Measured, that left the city in six pieces - 3331 nodes, 640, 45, 23, 23, 4 -
// and `prune` kept the largest and deleted 22 km of drawn road, including every
// road on the quarry's body. Not one crossing was missing and every body of land
// was reachable; the roads simply did not touch.
//
// So each loose end is pulled onto the road it was reaching for, and **the same
// point is inserted into that road**, so the two share a vertex exactly rather
// than nearly. Done here rather than in the generator because it is a property
// of the drawing: a network whose roads do not meet is wrong in the editor too,
// and this way the file says where every junction is.
const STITCH = 70; // metres: how far a loose end will reach for a road

function stitch(roads) {
  let made = 0;
  const project = (at, road) => {
    let best = null;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const span = dx * dx + dz * dz;
      const t = span < 1e-9 ? 0 : Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - az) * dz) / span));
      const p = [Math.round(ax + dx * t), Math.round(az + dz * t)];
      const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
      if (!best || d < best.d) best = { d, p, index: i, t };
    }
    return best;
  };

  for (const road of roads) {
    for (const end of [0, road.points.length - 1]) {
      const at = road.points[end === 0 ? 0 : road.points.length - 1];
      let best = null;
      for (const other of roads) {
        if (other === road) continue;
        const hit = project(at, other);
        if (hit && hit.d <= STITCH && (!best || hit.d < best.d)) best = { ...hit, other };
      }
      // Not `best.d === 0`. A road whose end lies exactly *on* another road is
      // the case that needs this most and the one the first version skipped:
      // `buildGraph` makes a junction where two spans cross or share a vertex,
      // and an endpoint sitting on a segment's interior does neither. Measured,
      // n103's start was 0 m from r89 and 5.3 km of drawn road was pruned for it.
      // The only thing worth skipping is a vertex the other road already has.
      if (!best) continue;
      // Never insert a point on top of one that is already there. The
      // projection lands on an existing vertex often - that is what a road
      // meeting another road at its corner looks like - and splicing a duplicate
      // in makes a zero-length segment, which the clip drops and which can sever
      // the road it was meant to join. Measured: doing it without this guard took
      // the city from 61.0 km to 49.8.
      const before = best.other.points[best.index - 1];
      const after = best.other.points[best.index];
      const apart = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (apart(best.p, before) < 2 || apart(best.p, after) < 2) {
        // Close enough to an existing vertex to *be* it: move the end onto that
        // vertex exactly instead, which is the junction we wanted anyway.
        const vertex = apart(best.p, before) < apart(best.p, after) ? before : after;
        if (end === 0) road.points[0] = [...vertex];
        else road.points[road.points.length - 1] = [...vertex];
        made++;
        continue;
      }
      // The end moves onto the road...
      if (end === 0) road.points[0] = best.p;
      else road.points[road.points.length - 1] = best.p;
      // ...and the road gains that point, so the two share a vertex and
      // `buildGraph` makes a junction out of it.
      best.other.points.splice(best.index, 0, best.p);
      made++;
    }
  }
  return made;
}

const stitched = stitch(roads);

// Sorted by id so a re-sync produces a readable diff rather than a reshuffle.
const num = (id) => Number(id.replace(/\D+/g, ''));
roads.sort((a, b) => (a.id[0] === b.id[0] ? num(a.id) - num(b.id) : a.id[0] < b.id[0] ? -1 : 1));

const body = roads
  .map((r) => {
    const flags = [r.bridge ? 'bridge' : null, r.deadEnd ? 'deadEnd' : null].filter(Boolean);
    // One `x,z,` per point: this is a flat number array, so the pairs are a
    // convention for reading it and every number still needs its comma.
    const pairs = r.points.map(([x, z]) => `${x},${z},`);
    // Wrapped at a width that keeps a road's points readable as pairs.
    const wrapped = [];
    let line = '   ';
    for (const pair of pairs) {
      if (line.length + pair.length + 1 > 96) {
        wrapped.push(line);
        line = '   ';
      }
      line += ` ${pair}`;
    }
    wrapped.push(line);
    return (
      `  // ${r.id} · ${Math.round(length(r.points))} m` +
      (flags.length ? ` · ${flags.join(', ')}` : '') +
      `\n  road('${r.id}', '${r.kind}', '${r.district}', ${r.bridge ? 1 : 0}, ${r.deadEnd ? 1 : 0}, [\n` +
      wrapped.join('\n') +
      '\n  ]),'
    );
  })
  .join('\n');

const file = `/**
 * The roads of Kestrel Bay, drawn rather than generated.
 *
 * The districts were authored at ADR-0009 because a plan is a few dozen
 * judgements and hand-drawing is what judgement looks like. These are the same
 * argument one layer down, and they got here the same way: the generator made a
 * first draft, \`npm run roadexport\` put it in an editor, and it was corrected by
 * hand over the relief - roads deleted where they were fragments, drawn where
 * the map wanted one, and moved where they were in the wrong place.
 *
 * **Generated, then edited, is the point.** Seventy-four roads is too many to
 * draw from nothing and few enough to fix by eye, which is exactly the band
 * where a draft beats either extreme. Nothing here is a road a router would not
 * have produced; what a person did was decide which ones the city wanted.
 *
 * Points are **world metres**, laid out as x,z pairs, against the frozen
 * landmass (\`CITY_LAND_STREAM\`). A road pinned in metres over a coastline that
 * moved would mean nothing, which is the same reason the plan's polygons are.
 *
 * Do not edit this file by hand. It is written by \`npm run roadsync\` from
 * \`docs/roads-edited.json\`, which is what the road editor saves. Editing here
 * instead means the next sync silently reverts you.
 *
 * ${roads.length} roads · ${(roads.reduce((s, r) => s + length(r.points), 0) / 1000).toFixed(1)} km ·
 * ${roads.filter((r) => r.bridge).length} carrying a bridge
 */
import { UNITS_PER_METRE } from '../constants';
import type { DistrictKind, RoadClass, Vec2 } from './types';

export interface AuthoredRoad {
  id: string;
  kind: RoadClass;
  district: DistrictKind;
  /** Whether the generator had this crossing water when it was exported. */
  bridge: boolean;
  /** This road stops where it means to; nothing is missing at its end. */
  deadEnd: boolean;
  /** In world units, so this is ready to lay. */
  points: Vec2[];
}

const road = (
  id: string,
  kind: RoadClass,
  district: DistrictKind,
  bridge: 0 | 1,
  deadEnd: 0 | 1,
  points: number[],
): AuthoredRoad => {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i += 2) {
    out.push({ x: points[i] * UNITS_PER_METRE, z: points[i + 1] * UNITS_PER_METRE });
  }
  return { id, kind, district, bridge: bridge === 1, deadEnd: deadEnd === 1, points: out };
};

export const AUTHORED_ROADS: AuthoredRoad[] = [
${body}
];
`;

writeFileSync(out, file);
console.log(
  `stitched ${stitched} loose ends onto the roads they were reaching for\n` +
    `wrote ${out}  ·  ${roads.length} roads  ·  ` +
    `${(roads.reduce((s, r) => s + length(r.points), 0) / 1000).toFixed(1)} km  ·  ` +
    `${(file.length / 1024).toFixed(0)} KB`,
);
