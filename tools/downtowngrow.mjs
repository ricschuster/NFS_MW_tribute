// Grow downtown's streets (#268): an old core by the water, towers inland.
//
// The owner's ask was a downtown that "grew naturally and not one that was
// designed and planned", and the answers on #268 put the two halves of it in
// place: an old core of short crooked streets by the water, and towers along
// the boulevards and the freeway. A suburb's drafter lays streets off a
// boulevard at a spacing; this grows them instead, the way a town fills in -
// streets push out from the roads already there, turn a little as they go,
// branch, and stop where they run into something.
//
// How:
//   - Seeds along every boulevard through the area, both sides, at the grain
//     of where they stand, leaving at a slant rather than square.
//   - A street advances a step at a time, turning by a little noise, and near
//     the water it is pulled to run along the shore or straight at it -
//     ADR-0008 rule 2: a street bends because the shoreline bends, not
//     because a random number told it to. The ground here is flat (0.6 m on
//     average, #268's audit), so the shore is the only thing to bend to.
//   - Every block length or so it may put out a branch off either side, at an
//     angle that is near square in the towers and anything from 60 to 120
//     degrees in the core.
//   - It stops when it reaches another road. Usually that is a T; sometimes
//     it carries on across and makes a crossroads; and a street arriving
//     close to a junction that is already there is moved onto it, which is
//     where junctions with five arms come from.
//   - It stops short, as a dead end, when it would come too near a road it is
//     not meeting, the water, or the edge of the area, and a stub shorter than
//     a block is dropped. Once everything has grown, a dead end with a road
//     just ahead of it runs on to meet it.
//
// The grain is a blend between the two halves by distance from the water: the
// core within `CORE` metres of it, the towers past `TOWERS`. What it draws is
// a draft for the road editor, never a generator the game runs (ADR-0009).

const CORE = 220; // metres from the water: all old town inside this
const TOWERS = 480; // and all towers past this

// The two grains. `block` is the distance between branches along a street
// and between seeds along a boulevard; `gap` is how near another road a
// street may run without meeting it; `wander` is how far it turns per step
// (radians); `skew` is how far off square a branch may leave.
const GRAIN = {
  core: { step: 18, block: 62, gap: 30, wander: 0.2, skew: 0.5, branch: 0.75, cross: 0.25, max: 420 },
  towers: { step: 25, block: 115, gap: 55, wander: 0.04, skew: 0.08, branch: 0.6, cross: 0.6, max: 1100 },
};
const SNAP = 26; // a street ending this near a junction already there meets it
const SHORE_CLEAR = 22;
const MIN_STREET = 45; // a stub shorter than this is not a street
const JUNCTION_CLEAR = 24; // a seed this near a junction is not made
const SHORE_PULL = 0.35; // how hard the shore turns a street near the water
const REACH = 75; // a dead end with a road this near ahead runs on to it

export function growDowntown({ poly, inside, wet, roads, freeway, rand }) {
  // Distance to the water, on a 10 m grid over the area, for the grain and
  // for which way the shore runs.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const C = 10, pad = 300;
  const gx0 = minX - pad, gz0 = minZ - pad;
  const W = Math.ceil((maxX - minX + 2 * pad) / C), H = Math.ceil((maxZ - minZ + 2 * pad) / C);
  const dist = new Float32Array(W * H).fill(Infinity);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (wet({ x: gx0 + i * C, z: gz0 + j * C })) dist[j * W + i] = 0;
  // A two-pass chamfer is close enough to Euclidean for a grain.
  const D1 = C, D2 = C * Math.SQRT2;
  for (let pass = 0; pass < 2; pass++) {
    const fwd = pass === 0;
    for (let jj = 0; jj < H; jj++) for (let ii = 0; ii < W; ii++) {
      const j = fwd ? jj : H - 1 - jj, i = fwd ? ii : W - 1 - ii, s = fwd ? -1 : 1;
      let d = dist[j * W + i];
      const look = (a, b, w) => { if (a >= 0 && b >= 0 && a < W && b < H) d = Math.min(d, dist[b * W + a] + w); };
      look(i + s, j, D1); look(i, j + s, D1); look(i + s, j + s, D2); look(i - s, j + s, D2);
      dist[j * W + i] = d;
    }
  }
  const shoreDist = (p) => {
    const i = Math.round((p.x - gx0) / C), j = Math.round((p.z - gz0) / C);
    if (i < 0 || j < 0 || i >= W || j >= H) return TOWERS;
    return Math.min(dist[j * W + i], 2000);
  };
  // Which way is away from the water: the gradient of the distance.
  const awayFromShore = (p) => {
    const dx = shoreDist({ x: p.x + C, z: p.z }) - shoreDist({ x: p.x - C, z: p.z });
    const dz = shoreDist({ x: p.x, z: p.z + C }) - shoreDist({ x: p.x, z: p.z - C });
    const l = Math.hypot(dx, dz);
    return l < 1e-6 ? null : { x: dx / l, z: dz / l };
  };
  // 0 in the old core, 1 among the towers.
  const towerness = (p) => Math.max(0, Math.min(1, (shoreDist(p) - CORE) / (TOWERS - CORE)));
  const grain = (p) => {
    const t = towerness(p);
    const out = {};
    for (const k of Object.keys(GRAIN.core)) out[k] = GRAIN.core[k] + (GRAIN.towers[k] - GRAIN.core[k]) * t;
    return out;
  };

  // Everything a street can meet or must keep clear of, as segments. Each
  // carries the id of the line it belongs to, so a street can ignore the road
  // it is leaving.
  const segs = [];
  const addLine = (id, pts, kind) => { for (let i = 1; i < pts.length; i++) segs.push({ id, kind, a: pts[i - 1], b: pts[i] }); };
  for (const r of roads) addLine(r.id, r.points, r.kind);
  // The freeway is over the streets on its deck and can be passed under, but
  // its ramps come down to the street and are kept clear of like a building.
  for (const r of freeway) addLine(r.id, r.points, 'ramp');
  const junctions = []; // points where lines meet, for snapping and clearance
  for (const r of roads) junctions.push(r.points[0], r.points[r.points.length - 1]);

  const nearJunction = (p, r) => junctions.find((j) => Math.hypot(j.x - p.x, j.z - p.z) < r) ?? null;
  const dry = (p) => {
    if (!inside(p) || wet(p)) return false;
    for (const [dx, dz] of [[SHORE_CLEAR, 0], [-SHORE_CLEAR, 0], [0, SHORE_CLEAR], [0, -SHORE_CLEAR]]) if (wet({ x: p.x + dx, z: p.z + dz })) return false;
    return true;
  };
  // Is `q` clear of every line by `gap`, but the one being left?
  const clearOf = (q, from, gap) => segs.every((s) => s.id === from || segDist(q, s.a, s.b) >= gap);
  // The nearest line straight ahead of `p` within `reach`, in a fan either
  // side of `dir`, ignoring `own` and the ramps.
  const ahead = (p, dir, reach, own) => {
    let best = null;
    for (let turn = -0.6; turn <= 0.61; turn += 0.15) {
      const ray = rot(dir, turn);
      const far = { x: p.x + ray.x * reach, z: p.z + ray.z * reach };
      for (const s of segs) {
        if (s.id === own || s.kind === 'ramp') continue;
        const c = cross(p, far, s.a, s.b);
        if (c && c.t > 0.01 && (!best || c.t * reach < best.d)) best = { d: c.t * reach, at: c.at, id: s.id };
      }
    }
    return best;
  };

  const streets = [];
  let nextId = 0;
  const heads = [];
  let k = 0; // a counter folded into the random numbers so no two draws repeat
  const R = (p) => rand(p.x, p.z, ++k);

  // Seeds along the boulevards.
  for (const r of roads) {
    if (r.kind !== 'boulevard') continue;
    const pts = r.points;
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
      let d = carry;
      while (d < len) {
        const p = { x: a.x + dir.x * d, z: a.z + dir.z * d };
        const g = grain(p);
        if (inside(p) && !nearJunction(p, JUNCTION_CLEAR * 2)) {
          for (const side of [1, -1]) {
            if (R(p) > 0.85) continue;
            const turn = (R(p) - 0.5) * 2 * g.skew;
            heads.push({ from: r.id, at: p, dir: rot({ x: -dir.z * side, z: dir.x * side }, turn) });
          }
        }
        d += g.block * (0.75 + R(p) * 0.5);
      }
      carry = d - len;
    }
  }

  // Grow, breadth first, so the streets nearest the boulevards claim the
  // ground before their own branches do - the order a town fills in.
  while (heads.length) {
    const h = heads.shift();
    if (!dry(h.at)) continue;
    const id = `g${nextId++}`;
    const line = [h.at];
    let dir = h.dir;
    let length = 0;
    let sinceBranch = 0;
    let meets = false;
    let bent = false;
    const g0 = grain(h.at);
    const pending = [];
    for (let guard = 0; guard < 200; guard++) {
      const here = line[line.length - 1];
      const g = grain(here);
      // Turn: a little noise, and near the water a pull towards running along
      // the shore or straight at it, whichever is nearer.
      dir = rot(dir, (R(here) - 0.5) * 2 * g.wander);
      const away = shoreDist(here) < CORE ? awayFromShore(here) : null;
      if (away) {
        const along = { x: -away.z, z: away.x };
        const best = [away, neg(away), along, neg(along)].reduce((m, o) => (dot(o, dir) > dot(m, dir) ? o : m));
        const pull = SHORE_PULL * (1 - shoreDist(here) / CORE);
        dir = norm({ x: dir.x + (best.x - dir.x) * pull, z: dir.z + (best.z - dir.z) * pull });
      }
      // Heading into the water inside a block: turn and run along the shore
      // instead, which is how a quay lane is made rather than a stub.
      if (!bent && length > g.gap * 0.8) {
        const probe = { x: here.x + dir.x * g.block * 0.9, z: here.z + dir.z * g.block * 0.9 };
        const toWater = awayFromShore(here);
        if (!dry(probe) && toWater && dot(dir, toWater) < -0.5) {
          const along = { x: -toWater.z, z: toWater.x };
          dir = dot(along, dir) >= 0 ? along : neg(along);
          // and the other way too, so a quay runs both ways from where it met it
          if (R(here) < 0.5) pending.push({ from: id, at: here, dir: neg(dir) });
          bent = true;
        }
      }
      const next = { x: here.x + dir.x * g.step, z: here.z + dir.z * g.step };
      // Reaching another line: the nearest crossing on this step.
      let hit = null;
      for (const s of segs) {
        if (s.id === id) continue;
        if (s.id === h.from && length < g.gap * 1.5) continue;
        const c = cross(here, next, s.a, s.b);
        if (c && (!hit || c.t < hit.t)) hit = { ...c, s };
      }
      if (hit) {
        if (hit.s.kind === 'ramp') break; // a ramp is a wall here
        // Onto a junction that is already there, if one is close.
        const j = nearJunction(hit.at, SNAP);
        const at = j ?? hit.at;
        line.push(at);
        length += Math.hypot(at.x - here.x, at.z - here.z);
        meets = true;
        // Sometimes on across, as a crossroads, if there is room beyond.
        const beyond = { x: at.x + dir.x * g.block * 0.6, z: at.z + dir.z * g.block * 0.6 };
        if (!j && length < g.max * 0.7 && R(at) < g.cross && dry(beyond) && clearOf(beyond, hit.s.id, g.gap)) {
          pending.push({ from: hit.s.id, at, dir });
        }
        break;
      }
      if (!dry(next)) break;
      // Too near a line it is not meeting: stop here, and the pass at the end
      // runs it on if that line is ahead of it.
      if (!clearOf(next, h.from, length > g.gap * 1.5 ? g.gap : g.gap * 0.6)) {
        // Close, and the line it is close to is just ahead: meet it.
        const near = length > g.gap ? ahead(here, dir, g.gap * 1.8, id) : null;
        if (near && near.id !== h.from) {
          const at = nearJunction(near.at, SNAP) ?? near.at;
          line.push(at);
          length += Math.hypot(at.x - here.x, at.z - here.z);
          meets = true;
        }
        break;
      }
      line.push(next);
      length += g.step;
      sinceBranch += g.step;
      if (length > g.max * (0.7 + R(next) * 0.6)) break;
      // Branches.
      if (sinceBranch > g.block * (0.8 + R(next) * 0.4)) {
        sinceBranch = 0;
        for (const side of [1, -1]) {
          if (R(next) > g.branch) continue;
          const turn = (R(next) - 0.5) * 2 * g.skew;
          const bdir = rot({ x: -dir.z * side, z: dir.x * side }, turn);
          // Not a branch that would run into the edge of the area within a block.
          const probe = { x: next.x + bdir.x * g.block, z: next.z + bdir.z * g.block };
          if (!inside(probe)) continue;
          pending.push({ from: id, at: next, dir: bdir });
        }
      }
    }
    if (length < MIN_STREET) continue;
    if (!meets && length < g0.block * 0.9) continue;
    streets.push({ id, points: line, deadEnd: !meets });
    addLine(id, line, 'street');
    junctions.push(line[0], line[line.length - 1]);
    heads.push(...pending);
  }

  // A street that stopped short of a road just ahead of it runs on to meet it:
  // a street a stone's throw from a road and not joined to it reads as a
  // mistake, not as a close. Only where the way on is dry and crosses
  // nothing else on the way.
  for (const s of streets) {
    if (!s.deadEnd) continue;
    const end = s.points[s.points.length - 1];
    const prev = s.points[s.points.length - 2];
    const dir = norm({ x: end.x - prev.x, z: end.z - prev.z });
    const near = ahead(end, dir, REACH, s.id);
    if (!near) continue;
    const at = nearJunction(near.at, SNAP) ?? near.at;
    const mid = { x: (end.x + at.x) / 2, z: (end.z + at.z) / 2 };
    if (!inside(mid) || wet(mid)) continue;
    const blocked = segs.some((t) => t.id !== s.id && t.id !== near.id && cross(end, at, t.a, t.b));
    if (blocked) continue;
    s.points.push(at);
    s.deadEnd = false;
    addLine(s.id, [end, at], 'street');
  }
  return streets.map((s) => ({ points: simplify(s.points, 2.5), deadEnd: s.deadEnd }));
}

const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.z * Math.sin(a), z: v.x * Math.sin(a) + v.z * Math.cos(a) });
const neg = (v) => ({ x: -v.x, z: -v.z });
const dot = (a, b) => a.x * b.x + a.z * b.z;
const norm = (v) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
};
const cross = (p, q, a, b) => {
  const rx = q.x - p.x, rz = q.z - p.z, sx = b.x - a.x, sz = b.z - a.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - p.x) * sz - (a.z - p.z) * sx) / den;
  const u = ((a.x - p.x) * rz - (a.z - p.z) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, at: { x: p.x + rx * t, z: p.z + rz * t } };
};

// Douglas-Peucker: a street is kept as the few points that carry its shape.
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const d = Math.abs(dx * (a.z - p.z) - (a.x - p.x) * dz) / l;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}
