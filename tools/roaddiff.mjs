// What changed in the road editor?
//
// The editor saves the whole network rather than a patch, because a patch is a
// thing that can be applied to the wrong version. This is the other half: read
// the saved network back, put it beside the one the generator made, and say
// what somebody actually did.
//
// Usage:
//   npm run roaddiff <saved.json> [generated.json]
//     saved      the document read out of the artifact's store
//     generated  what it was edited from, default screenshots/roads.json
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const savedPath = args[0];
const basePath = args[1] ?? 'screenshots/roads.json';
if (!savedPath) {
  console.error('usage: npm run roaddiff <saved.json> [generated.json]');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(savedPath, 'utf8'));
// The store hands back the document; the editor's payload may sit under a
// wrapper depending on how it was read, so accept either shape.
const saved = raw.roads ? raw : raw.data ?? raw;
const base = JSON.parse(readFileSync(basePath, 'utf8'));

const length = (points) => {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return d;
};
const km = (m) => `${(m / 1000).toFixed(2)} km`;
const middle = (points) => {
  // The point halfway *along* it, not the mean of its vertices: a road with its
  // points bunched at one end has a mean that is nowhere near its middle.
  const half = length(points) / 2;
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const step = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (run + step >= half) {
      const t = step < 1e-9 ? 0 : (half - run) / step;
      return [
        Math.round(points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t),
        Math.round(points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t),
      ];
    }
    run += step;
  }
  return points[points.length - 1];
};

/** How far the two lines wander from each other, sampled along the shorter. */
function apart(a, b) {
  const toSegment = (p, q, at) => {
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const span = dx * dx + dz * dz;
    const t = span < 1e-9 ? 0 : Math.max(0, Math.min(1, ((at[0] - p[0]) * dx + (at[1] - p[1]) * dz) / span));
    return Math.hypot(p[0] + dx * t - at[0], p[1] + dz * t - at[1]);
  };
  let worst = 0;
  for (const at of a) {
    let best = Infinity;
    for (let i = 1; i < b.length; i++) best = Math.min(best, toSegment(b[i - 1], b[i], at));
    worst = Math.max(worst, best);
  }
  return worst;
}

const was = new Map(base.roads.map((r) => [r.id, r]));
const now = new Map(saved.roads.map((r) => [r.id, r]));

const deleted = [...was.values()].filter((r) => !now.has(r.id));
const added = [...now.values()].filter((r) => !was.has(r.id));
const moved = [];
for (const r of now.values()) {
  const before = was.get(r.id);
  if (!before) continue;
  if (JSON.stringify(before.points) === JSON.stringify(r.points)) continue;
  moved.push({ before, after: r });
}

console.log(`saved ${saved.savedAt ?? 'at an unknown time'}  ·  seed ${saved.seed ?? '?'}`);
console.log(`${base.roads.length} roads generated  ->  ${saved.roads.length} saved\n`);

if (deleted.length) {
  console.log(`DELETED  ${deleted.length}`);
  for (const r of deleted) {
    const [x, z] = middle(r.points);
    console.log(`  ${r.id.padEnd(5)} ${km(length(r.points)).padStart(8)}  at (${x}, ${z})${r.bridge ? '  · was a bridge' : ''}`);
  }
  console.log();
}

if (added.length) {
  console.log(`DRAWN  ${added.length}`);
  for (const r of added) {
    const [x, z] = middle(r.points);
    console.log(
      `  ${r.id.padEnd(5)} ${km(length(r.points)).padStart(8)}  ${String(r.points.length).padStart(3)} points  ` +
        `from (${r.points[0][0]}, ${r.points[0][1]}) to (${r.points[r.points.length - 1][0]}, ${r.points[r.points.length - 1][1]})  via (${x}, ${z})`,
    );
  }
  console.log();
}

if (moved.length) {
  console.log(`MOVED  ${moved.length}`);
  for (const m of moved) {
    const shift = Math.max(apart(m.after.points, m.before.points), apart(m.before.points, m.after.points));
    const dPoints = m.after.points.length - m.before.points.length;
    const dLength = length(m.after.points) - length(m.before.points);
    console.log(
      `  ${m.after.id.padEnd(5)} up to ${Math.round(shift).toString().padStart(4)} m off its old line  ` +
        `${dPoints >= 0 ? '+' : ''}${dPoints} points  ${dLength >= 0 ? '+' : ''}${Math.round(dLength)} m`,
    );
  }
  console.log();
}

if (!deleted.length && !added.length && !moved.length) console.log('nothing changed');

const totalWas = base.roads.reduce((s, r) => s + length(r.points), 0);
const totalNow = saved.roads.reduce((s, r) => s + length(r.points), 0);
console.log(`network ${km(totalWas)}  ->  ${km(totalNow)}  (${totalNow >= totalWas ? '+' : ''}${km(totalNow - totalWas)})`);
