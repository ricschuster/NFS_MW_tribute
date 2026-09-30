// The enclosures of Kestrel Head's castle, read off its walls (#454).
//
// The cobbles and the raised ground both need to know what is inside the
// castle, and the owner moves the walls in the prop editor. So the areas are
// not drawn: they are found. Every wall, tower, bastion, keep and gate is
// stamped onto a 2 m grid as stone, each enclosure is flooded from a point
// inside it, and the edge of the flood is its outline.
//
// A gap left open on purpose - where the gravel track leaves, where the jump
// flies into the south ward - would let a flood out onto the hillside. So any
// two loose wall ends that face each other across open ground are joined for
// the flood, and only for the flood: nothing is added to the castle.
//
// A flood that still gets out is refused rather than written. An outline of
// the whole hill is worse than none.

const CELL = 2;
/** How much the stone is grown for the flood, in metres. */
const GROW = 2.6;
/** How far two loose wall ends can be apart and still be one gap. */
const GAP = 45;
/** Largest area an enclosure is allowed to come out as, in m²: past this, it leaked. */
const MOST = 90000;

const SIZES = {
  rampart: { w: 3, l: 20 },
  'fort-gate': { w: 31, l: 8 },
  'wall-tower': { r: 5 },
  bastion: { r: 10 },
  keep: { r: 7.4 },
};

/**
 * `seams` are lines the flood may not cross, in world metres: where an
 * enclosure is open on purpose onto somewhere that is not part of it - the
 * junction by the back gate, where the road turns into the gravel track and
 * the jump flies into the south ward, is open to the inner courtyard and to
 * the ward, and belongs to neither.
 */
export function castleAreas(props, seeds, seams = []) {
  const stone = props.filter((p) => SIZES[p.kind]);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of stone) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  minX -= 40; maxX += 40; minZ -= 40; maxZ += 40;
  const cols = Math.ceil((maxX - minX) / CELL) + 1;
  const rows = Math.ceil((maxZ - minZ) / CELL) + 1;
  const wall = new Uint8Array(cols * rows);
  const at = (c, r) => ({ x: minX + c * CELL, z: minZ + r * CELL });
  const cellOf = (x, z) => [Math.round((x - minX) / CELL), Math.round((z - minZ) / CELL)];

  const stampRect = (p, w, l, grow) => {
    const s = Math.sin(p.angle), c = Math.cos(p.angle);
    const reach = Math.hypot(w, l) / 2 + grow + CELL;
    const [c0, r0] = cellOf(p.x - reach, p.z - reach);
    const [c1, r1] = cellOf(p.x + reach, p.z + reach);
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
      for (let q = Math.max(0, c0); q <= Math.min(cols - 1, c1); q++) {
        const { x, z } = at(q, r);
        const v = (x - p.x) * s + (z - p.z) * c;
        const u = (x - p.x) * c - (z - p.z) * s;
        if (Math.abs(u) <= w / 2 + grow && Math.abs(v) <= l / 2 + grow) wall[r * cols + q] = 1;
      }
    }
  };
  const stampDisc = (x0, z0, radius) => {
    const [c0, r0] = cellOf(x0 - radius - CELL, z0 - radius - CELL);
    const [c1, r1] = cellOf(x0 + radius + CELL, z0 + radius + CELL);
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
      for (let q = Math.max(0, c0); q <= Math.min(cols - 1, c1); q++) {
        const { x, z } = at(q, r);
        if (Math.hypot(x - x0, z - z0) <= radius) wall[r * cols + q] = 1;
      }
    }
  };
  // Stone is grown by a little over half a car's width, so any gap a car could
  // not get through is closed for the flood as well: a 4 m gap between a wall
  // and a tower is part of the wall, not a way out.
  for (const p of stone) {
    const size = SIZES[p.kind];
    if (size.r) stampDisc(p.x, p.z, size.r + GROW);
    else stampRect(p, size.w, size.l, GROW);
  }

  // Join loose ends across the gaps, for the flood.
  const ends = [];
  stone.forEach((p, i) => {
    if (p.kind !== 'rampart') return;
    const f = { x: Math.sin(p.angle), z: Math.cos(p.angle) };
    ends.push({ i, x: p.x + f.x * 10, z: p.z + f.z * 10 }, { i, x: p.x - f.x * 10, z: p.z - f.z * 10 });
  });
  const covered = (e) => {
    const [q, r] = cellOf(e.x + 0, e.z + 0);
    let n = 0;
    for (let dr = -3; dr <= 3; dr++) for (let dq = -3; dq <= 3; dq++) {
      const k = (r + dr) * cols + (q + dq);
      if (wall[k]) n++;
    }
    return n;
  };
  const loose = ends.filter((e) => ends.every((o) => o === e || o.i === e.i || Math.hypot(o.x - e.x, o.z - e.z) > 4) && covered(e) < 40);
  const used = new Set();
  const pairs = [];
  for (const a of loose) for (const b of loose) if (a !== b && a.i !== b.i) pairs.push([Math.hypot(a.x - b.x, a.z - b.z), a, b]);
  pairs.sort((p, q) => p[0] - q[0]);
  for (const [d, a, b] of pairs) {
    if (d > GAP || used.has(a) || used.has(b)) continue;
    used.add(a); used.add(b);
    const steps = Math.ceil(d / 1);
    for (let k = 0; k <= steps; k++) stampDisc(a.x + ((b.x - a.x) * k) / steps, a.z + ((b.z - a.z) * k) / steps, 2);
  }

  for (const [a, b] of seams) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.ceil(d);
    for (let k = 0; k <= steps; k++) stampDisc(a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps, 2);
  }

  const areas = {};
  for (const [name, seed] of Object.entries(seeds)) {
    const [sq, sr] = cellOf(seed[0], seed[1]);
    if (wall[sr * cols + sq]) throw new Error(`castle area ${name}: its seed (${seed}) is inside a wall`);
    const inside = new Uint8Array(cols * rows);
    const stack = [sr * cols + sq];
    let count = 0;
    while (stack.length) {
      const k = stack.pop();
      if (inside[k] || wall[k]) continue;
      const q = k % cols, r = (k - q) / cols;
      if (q === 0 || r === 0 || q === cols - 1 || r === rows - 1) {
        const err = new Error(`castle area ${name}: the flood got out of the castle`);
        err.debug = { wall, inside, cols, rows, minX, minZ, cell: CELL };
        throw err;
      }
      inside[k] = 1;
      count++;
      stack.push(k + 1, k - 1, k + cols, k - cols);
    }
    if (count * CELL * CELL > MOST) throw new Error(`castle area ${name}: ${count * CELL * CELL} m² is more than a castle`);
    areas[name] = simplify(outline(inside, cols, rows).map(([q, r]) => [minX + q * CELL, minZ + r * CELL]), 1.5);
  }
  return areas;
}

/** The outer edge of a flooded region, walked round cell corners (a square tracing). */
function outline(inside, cols, rows) {
  const on = (q, r) => q >= 0 && r >= 0 && q < cols && r < rows && inside[r * cols + q] === 1;
  // Start at the region's first cell from the top-left; walk its boundary keeping the region on the right.
  let start = -1;
  for (let k = 0; k < inside.length; k++) if (inside[k]) { start = k; break; }
  const sq = start % cols, sr = (start - sq) / cols;
  // Corner-walking (Moore boundary on the dual grid): positions are corners, direction 0..3 = +x, +z, -x, -z.
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let x = sq, z = sr, d = 0;
  const path = [];
  const cellAt = (cx, cz, dir) => {
    // the cell to the right and left of an edge leaving corner (cx, cz) in direction dir
    const right = [[cx, cz], [cx - 1, cz], [cx - 1, cz - 1], [cx, cz - 1]][dir];
    const left = [[cx, cz - 1], [cx, cz], [cx - 1, cz], [cx - 1, cz - 1]][dir];
    return { right: on(right[0], right[1]), left: on(left[0], left[1]) };
  };
  for (let guard = 0; guard < 4 * inside.length; guard++) {
    path.push([x, z]);
    // Prefer turning left, then straight, then right, keeping region on the right and outside on the left.
    for (const turn of [3, 0, 1, 2]) {
      const nd = (d + turn) % 4;
      const e = cellAt(x, z, nd);
      if (e.right && !e.left) { d = nd; break; }
    }
    x += dirs[d][0];
    z += dirs[d][1];
    if (x === sq && z === sr && path.length > 2) break;
  }
  return path;
}

/** Ramer-Douglas-Peucker, closed. */
function simplify(points, tolerance) {
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    const [ax, az] = pts[0];
    const [bx, bz] = pts[pts.length - 1];
    let worst = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, pz] = pts[i];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const d = Math.abs((px - ax) * dz - (pz - az) * dx) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst <= tolerance) return [pts[0], pts[pts.length - 1]];
    return [...rdp(pts.slice(0, at + 1)).slice(0, -1), ...rdp(pts.slice(at))];
  };
  const half = Math.floor(points.length / 2);
  const out = [...rdp(points.slice(0, half + 1)).slice(0, -1), ...rdp([...points.slice(half), points[0]]).slice(0, -1)];
  return out.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
}
