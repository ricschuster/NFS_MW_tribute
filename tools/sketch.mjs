// A sketch of what Kestrel Bay could be, shaped after the *structure* of the
// reference city rather than after what we have today.
//
// What that structure is, from what is written about it: a downtown in the
// south on the waterfront; two further districts across water, each reached by
// a landmark bridge, one of them industrial with a power plant and a quarry full
// of tunnels; a large park; an interstate circling the whole city with an
// abandoned airfield out on its northern arc; hills behind.
//
// So the land is not one blob. It is several lobes that nearly touch, with
// water between them and bridges over it - which is what makes a crossing a
// decision, and what our generator has never produced because it starts from a
// rectangle and cuts a river through it.
//
// Self-contained on purpose: touches nothing in src/, so it is a drawing to
// argue with rather than a change to review.
//
// Kept because it is where ADR-0008's two rules were found - the landmass has
// to be lobes rather than a coastline, and roads have to be routed rather than
// laid - and because the next question about the shape of the map is cheaper to
// answer here than in the generator.
//
//   npm run sketch                     # -> screenshots/sketch.png
//   npm run sketch -- 12 out.png       # another seed, another file
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SEED = Number(process.argv[2] ?? 3);
const OUT = process.argv[3] ?? 'screenshots/sketch.png';

let s = SEED >>> 0;
const rnd = () => {
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 4294967296;
};
const range = (a, b) => a + rnd() * (b - a);

const KM = 1000;
const W = 10 * KM;
const H = 8 * KM;
const bounds = { minX: -W / 2, maxX: W / 2, minZ: -H / 2, maxZ: H / 2 };

// --------------------------------------------------------------- the landmass
// Lobes of land, summed as a field and cut at a threshold. Blobs rather than a
// radius per angle, because a radial coast cannot have two districts facing
// each other across a channel - and that channel is the whole point.
const LOBES = [
  { name: 'downtown', x: -900, z: -1500, r: 2500, w: 1.0 },
  { name: 'ripley', x: 2600, z: -300, r: 2050, w: 0.92 },
  { name: 'mcclane', x: -3000, z: 700, r: 1950, w: 0.88 },
  { name: 'heights', x: 400, z: 2000, r: 2500, w: 0.95 },
  { name: 'east hills', x: 3400, z: 2200, r: 1700, w: 0.8 },
];

const wob = [];
for (let i = 0; i < 5; i++) wob.push({ f: range(1.5, 4.5), g: range(1.5, 4.5), p: range(0, 7), a: 1 / (i + 2) });
const ripple = (x, z) =>
  wob.reduce((sum, o) => sum + o.a * Math.sin((x / 2600) * o.f + (z / 2600) * o.g + o.p), 0) / 1.6;

const field = (x, z) => {
  let v = 0;
  for (const l of LOBES) {
    const d = Math.hypot(x - l.x, z - l.z) / l.r;
    v += l.w * Math.exp(-d * d * 1.35);
  }
  // A wobble on the *field* rather than on a radius, so the coast is irregular
  // everywhere including in the necks between lobes.
  return v * (1 + 0.17 * ripple(x, z));
};

// The channels. Each one separates a district from downtown and gets a bridge.
const channel = (x, z, from, to, halfWidth) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / len2));
  const px = from.x + dx * t;
  const pz = from.z + dz * t;
  // Bowed, so a strait is not a canal.
  const bow = Math.sin(t * Math.PI) * 420;
  const d = Math.hypot(x - (px - (dz / Math.sqrt(len2)) * bow), z - (pz + (dx / Math.sqrt(len2)) * bow));
  return Math.exp(-((d / halfWidth) ** 2) * 1.6);
};

// Laid across the necks between lobes rather than along them, and cut hard
// enough to actually sever: a channel that only dents the coast is an inlet,
// and an inlet does not need a bridge.
const CHANNELS = [
  { from: { x: 1100, z: -3400 }, to: { x: 1900, z: 2600 }, half: 430 },
  { from: { x: -3300, z: -2200 }, to: { x: -1500, z: 3200 }, half: 380 },
];

const LAND = 0.46;
const solid = (x, z) => {
  let v = field(x, z);
  for (const c of CHANNELS) v -= 1.25 * channel(x, z, c.from, c.to, c.half);
  return v;
};
const isWater = (x, z) => solid(x, z) < LAND;

// ----------------------------------------------------------------- the terrain
const CELL = 25;
const cols = Math.ceil(W / CELL) + 1;
const rows = Math.ceil(H / CELL) + 1;
const RELIEF = 150; // metres at the highest, which is the question this asks

const lat = [];
for (let o = 0; o < 4; o++) {
  const g = new Float32Array(64 * 64);
  for (let i = 0; i < g.length; i++) g[i] = range(-1, 1);
  lat.push({ g, scale: 2400 / 2 ** o, amp: 1 / 2 ** o });
}
const smooth = (t) => t * t * (3 - 2 * t);
const octave = ({ g, scale }, x, z) => {
  const fx = x / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = smooth(fx - x0);
  const tz = smooth(fz - z0);
  const w = (v) => ((v % 64) + 64) % 64;
  const a = g[w(z0) * 64 + w(x0)];
  const b = g[w(z0) * 64 + w(x0 + 1)];
  const c = g[w(z0 + 1) * 64 + w(x0)];
  const d = g[w(z0 + 1) * 64 + w(x0 + 1)];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
};
const totalAmp = lat.reduce((t, o) => t + o.amp, 0);
const noise = (x, z) => lat.reduce((sum, o) => sum + o.amp * octave(o, x, z), 0) / totalAmp;

const wet = new Uint8Array(cols * rows);
const inland = new Uint8Array(cols * rows); // the channels only, for steep banks
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x = bounds.minX + c * CELL;
    const z = bounds.minZ + r * CELL;
    if (isWater(x, z)) {
      wet[r * cols + c] = 1;
      // A channel is water that would have been land without it: that is what
      // makes it a cut bank rather than a beach.
      if (field(x, z) >= LAND) inland[r * cols + c] = 1;
    }
  }
}

const distTo = (mask) => {
  const far = cols + rows;
  const d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : far;
  const q = Math.SQRT2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (r > 0) d[i] = Math.min(d[i], d[i - cols] + 1);
      if (c > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (r > 0 && c > 0) d[i] = Math.min(d[i], d[i - cols - 1] + q);
      if (r > 0 && c < cols - 1) d[i] = Math.min(d[i], d[i - cols + 1] + q);
    }
  for (let r = rows - 1; r >= 0; r--)
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (r < rows - 1) d[i] = Math.min(d[i], d[i + cols] + 1);
      if (c < cols - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (r < rows - 1 && c < cols - 1) d[i] = Math.min(d[i], d[i + cols + 1] + q);
      if (r < rows - 1 && c > 0) d[i] = Math.min(d[i], d[i + cols - 1] + q);
    }
  return d;
};
const toSea = distTo(wet);
const toBank = distTo(inland);

// Downtown sits in a bowl on the coast; the land climbs away from it to the
// north. Gentle at the sea, steep at the channels - which is the ask.
const DOWNTOWN = LOBES[0];
const height = new Float32Array(cols * rows);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (wet[i]) {
      height[i] = -8;
      continue;
    }
    const x = bounds.minX + c * CELL;
    const z = bounds.minZ + r * CELL;

    const seaRamp = smooth(Math.min(1, (toSea[i] * CELL) / 750));
    const bankRamp = smooth(Math.min(1, (toBank[i] * CELL) / 130));
    // The gentler of the two wins where both apply, except that a channel bank
    // is allowed to be steep: take the sea ramp, then let the bank override it
    // close in.
    const shore = Math.max(seaRamp, Math.min(1, bankRamp));

    const inTown = Math.hypot(x - DOWNTOWN.x, z - DOWNTOWN.z) / (DOWNTOWN.r * 1.15);
    const bowl = 0.12 + 0.88 * smooth(Math.min(1, inTown));
    // Northwards is up: the hills are behind the city, the way they are behind
    // most cities that have any.
    const northward = 0.45 + 0.85 * smooth(Math.min(1, (z - bounds.minZ) / H));

    const h = (noise(x, z) + 1) / 2;
    height[i] = h * h * RELIEF * shore * bowl * northward;
  }
}

// ------------------------------------------------------------------- the roads
//
// Routed, not drawn. Every road here is a least-cost path over the height
// field: cheap along a contour, expensive up a slope, expensive over water. A
// road that costs the square of its gradient will contour round a hill rather
// than climb it, switchback when it has no choice, and cross a channel at the
// narrowest place it can find - which is how a bridge gets chosen by the map
// rather than by a constant.
//
// This is the part worth taking into the generator. #260 needs roads through
// country that has a shape, and #252 needs roads whose grade a car can climb;
// both are this.

const RCELL = 50;
const rc = Math.ceil(W / RCELL) + 1;
const rr = Math.ceil(H / RCELL) + 1;
const rx = (c) => bounds.minX + c * RCELL;
const rz = (r) => bounds.minZ + r * RCELL;
const hAt = (c, r) => {
  const gc = Math.min(cols - 1, Math.max(0, Math.round((rx(c) - bounds.minX) / CELL)));
  const gr = Math.min(rows - 1, Math.max(0, Math.round((rz(r) - bounds.minZ) / CELL)));
  return height[gr * cols + gc];
};
const wetAt = (c, r) => {
  const gc = Math.min(cols - 1, Math.max(0, Math.round((rx(c) - bounds.minX) / CELL)));
  const gr = Math.min(rows - 1, Math.max(0, Math.round((rz(r) - bounds.minZ) / CELL)));
  return wet[gr * cols + gc] === 1;
};

// A binary heap, because a linear scan over 32,000 nodes per pop is the
// difference between a second and a minute.
class Heap {
  constructor() {
    this.a = [];
  }
  push(cost, node) {
    const a = this.a;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// A road profile: how steep it will tolerate, and how much it hates water.
// A freeway wants 6% and will build a bridge; a mountain road accepts 12% and
// would rather go round.
const seaGap = (c, r) => {
  const gc = Math.min(cols - 1, Math.max(0, Math.round((rx(c) - bounds.minX) / CELL)));
  const gr = Math.min(rows - 1, Math.max(0, Math.round((rz(r) - bounds.minZ) / CELL)));
  return toSea[gr * cols + gc] * CELL;
};

const route = (from, to, { cap, bridge, climb, shore = 0, shore_k = 0 }) => {
  // Float64, deliberately. A Float32Array rounds the stored cost, so
  // `next < cost[j]` passes again on the next visit, the node is pushed again,
  // and Dijkstra relaxes for ever - four gigabytes of heap in about a minute.
  const cost = new Float64Array(rc * rr).fill(Infinity);
  const came = new Int32Array(rc * rr).fill(-1);
  const startI = from.r * rc + from.c;
  cost[startI] = 0;
  const heap = new Heap();
  heap.push(0, startI);
  const goal = to.r * rc + to.c;

  while (heap.size) {
    const [c0, i] = heap.pop();
    if (i === goal) break;
    if (c0 > cost[i]) continue;
    const c = i % rc;
    const r = (i / rc) | 0;
    for (const [dc, dr, step] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= rc || nr >= rr) continue;
      const j = nr * rc + nc;
      const run = step * RCELL;
      let add;
      if (wetAt(nc, nr)) {
        add = run * bridge;
      } else {
        const dh = Math.abs(hAt(nc, nr) - hAt(c, r));
        const grade = dh / run;
        // A freeway does not run along the beach. The shore is the flattest
        // ground on the map because the land ramps up from it, so a router that
        // only prices gradient will pin every road to the waterline - which is
        // what the last render did. `shy` prices being close to water, and it
        // is what pushes the loop inland into the hills where the corners are.
        const near = seaGap(nc, nr);
        var shy = shore > 0 && near < shore ? 1 + shore_k * (1 - near / shore) : 1;
        // Squared, so a road prefers two gentle kilometres to one steep one -
        // which is what puts a hairpin on a hillside instead of a ramp up it.
        if (grade > cap) add = run * (1 + climb * 40) * shy;
        else add = run * (1 + climb * (grade / cap) ** 2) * shy;
      }
      const next = c0 + add;
      if (next < cost[j]) {
        cost[j] = next;
        came[j] = i;
        heap.push(next, j);
      }
    }
  }

  const path = [];
  let at = goal;
  if (came[at] === -1 && at !== startI) return path;
  while (at !== -1) {
    path.push({ x: rx(at % rc), z: rz((at / rc) | 0) });
    if (at === startI) break;
    at = came[at];
  }
  return smoothPath(path.reverse());
};

/**
 * Chaikin, twice. An eight-connected grid can only turn in 45 degree steps, so
 * a routed road comes out as a staircase - which is an artefact of the search
 * and not a thing about the road. Cutting the corners twice turns it back into
 * a line a car could drive, without moving it anywhere it did not go.
 */
function smoothPath(pts) {
  let out = pts;
  for (let pass = 0; pass < 3 && out.length > 2; pass++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

const cell = (x, z) => {
  let c = Math.min(rc - 1, Math.max(0, Math.round((x - bounds.minX) / RCELL)));
  let r = Math.min(rr - 1, Math.max(0, Math.round((z - bounds.minZ) / RCELL)));
  if (!wetAt(c, r)) return { c, r };
  // Snapped to land. A waypoint left in the water makes the router bridge out
  // to sea to reach it, which is where this sketch's absurd crossings came
  // from: the road was not wrong, the destination was.
  for (let ring = 1; ring < 60; ring++) {
    for (let dc = -ring; dc <= ring; dc++) {
      for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= rc || nr >= rr) continue;
        if (!wetAt(nc, nr)) return { c: nc, r: nr };
      }
    }
  }
  return { c, r };
};

// `bridge` is the multiple of ordinary road a metre of water costs. High
// enough that going round is usually cheaper, low enough that a short crossing
// beats a long detour - which is what makes the router choose the narrows.
const FREEWAY = { cap: 0.06, bridge: 30, climb: 26, shore: 700, shore_k: 2.2 };
const ARTERIAL = { cap: 0.1, bridge: 55, climb: 16, shore: 250, shore_k: 0.8 };
const MOUNTAIN = { cap: 0.13, bridge: 120, climb: 9, shore: 900, shore_k: 3 };

// Places worth driving to. The freeway is then the circuit that strings the
// outer ones together, which is a road with a reason rather than an oval.
const PLACES = [
  { name: 'airfield', x: 500, z: 3050 },
  { name: 'quarry', x: -3200, z: 1600 },
  { name: 'park', x: -300, z: 500 },
  { name: 'docks', x: -1400, z: -2900 },
  { name: 'power station', x: -3400, z: -900 },
  { name: 'lookout', x: 1900, z: 2450 },
];
const DOWNTOWN_AT = { x: DOWNTOWN.x, z: DOWNTOWN.z - 400 };

// The freeway: a circuit round the outside, routed leg by leg.
const ringStops = [
  { x: -1500, z: -3000 },
  { x: -3900, z: -1400 },
  { x: -4100, z: 1500 },
  { x: -1400, z: 3100 },
  { x: 1500, z: 2900 },
  { x: 3900, z: 900 },
  { x: 3300, z: -1900 },
  { x: 600, z: -3200 },
];
const freeway = [];
for (let i = 0; i < ringStops.length; i++) {
  const leg = route(cell(ringStops[i].x, ringStops[i].z), cell(ringStops[(i + 1) % ringStops.length].x, ringStops[(i + 1) % ringStops.length].z), FREEWAY);
  freeway.push(leg);
}

// Arterials out of downtown to each place.
const arterials = PLACES.map((pl) => route(cell(DOWNTOWN_AT.x, DOWNTOWN_AT.z), cell(pl.x, pl.z), ARTERIAL));

// One road that exists to be driven rather than to get anywhere: over the high
// ground between two points on the ring, tolerating grade so it switchbacks.
const mountainRoad = route(cell(-1400, 3100), cell(1900, 2450), MOUNTAIN);

// The dense grid, and only over downtown, and only where the ground is flat
// enough to have laid one out. This is the change that matters most: today the
// grid covers all of the map uniformly and takes no notice of anything.
const groundAt = (x, z) => {
  const gc = Math.min(cols - 1, Math.max(0, Math.round((x - bounds.minX) / CELL)));
  const gr = Math.min(rows - 1, Math.max(0, Math.round((z - bounds.minZ) / CELL)));
  return height[gr * cols + gc];
};
const flatEnough = (x, z) => {
  const d = 60;
  const h = groundAt(x, z);
  return (
    Math.abs(groundAt(x + d, z) - h) / d < 0.11 && Math.abs(groundAt(x, z + d) - h) / d < 0.11
  );
};
const gridOver = (lobe, step, ex, ez) => {
  const out = [];
  const ok = (x, z) =>
    Math.hypot((x - lobe.x) / ex, (z - lobe.z) / ez) < 1 && !isWater(x, z) && flatEnough(x, z);
  for (let x = lobe.x - ex; x <= lobe.x + ex; x += step) {
    const seg = [];
    for (let z = lobe.z - ez; z <= lobe.z + ez; z += 50) seg.push(ok(x, z) ? { x, z } : null);
    out.push(seg);
  }
  for (let z = lobe.z - ez; z <= lobe.z + ez; z += step) {
    const seg = [];
    for (let x = lobe.x - ex; x <= lobe.x + ex; x += 50) seg.push(ok(x, z) ? { x, z } : null);
    out.push(seg);
  }
  return out;
};
const streets = gridOver(DOWNTOWN, 150, 2000, 1500);
const ripley = gridOver(LOBES[1], 230, 1500, 1300);
const mcclane = gridOver(LOBES[2], 250, 1350, 1400);

// The inner ring: a boulevard round downtown, routed like everything else so it
// bends round what is in the way instead of describing an ellipse.
const beltStops = [];
for (let i = 0; i < 7; i++) {
  const t = (i / 7) * Math.PI * 2;
  beltStops.push({ x: DOWNTOWN.x + Math.cos(t) * 2000, z: DOWNTOWN.z + Math.sin(t) * 1650 });
}
const beltway = [];
for (let i = 0; i < beltStops.length; i++) {
  beltway.push(route(cell(beltStops[i].x, beltStops[i].z), cell(beltStops[(i + 1) % beltStops.length].x, beltStops[(i + 1) % beltStops.length].z), ARTERIAL));
}

// ----------------------------------------------------------------- the drawing
const PX = 1500;
const scale = PX / W;
const PH = Math.round(H * scale);
const sx = (x) => ((bounds.maxX - x) * scale).toFixed(1);
const sy = (z) => ((bounds.maxZ - z) * scale).toFixed(1);

const parts = [`<rect width="${PX}" height="${PH}" fill="#123240"/>`];

const step = 2;
const cellPx = (CELL * scale * step * 1.35).toFixed(2);
const relief = [];
for (let r = 0; r + step < rows; r += step) {
  for (let c = 0; c + step < cols; c += step) {
    const i = r * cols + c;
    const h = height[i];
    if (wet[i]) continue;
    const dx = height[i + step] - h;
    const dz = height[(r + step) * cols + c] - h;
    const run = CELL * step;
    const lit = Math.max(0, Math.min(1, 0.5 + (dx / run) * 4 + (dz / run) * 4));
    const high = Math.min(1, h / RELIEF);
    const shade = 0.58 + 0.72 * lit;
    const cr = Math.round(Math.min(255, (60 + 132 * high) * shade));
    const cg = Math.round(Math.min(255, (96 + 62 * high) * shade));
    const cb = Math.round(Math.min(255, (58 + 54 * high) * shade));
    relief.push(
      `<rect x="${sx(bounds.minX + (c + step) * CELL)}" y="${sy(bounds.minZ + (r + step) * CELL)}" width="${cellPx}" height="${cellPx}" fill="rgb(${cr},${cg},${cb})"/>`,
    );
  }
}
parts.push(relief.join(''));

const path = (pts, stroke, width, opacity = 1) => {
  const runs = [];
  let run = [];
  for (const p of pts) {
    if (!p) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    run.push(p);
  }
  if (run.length > 1) runs.push(run);
  for (const r of runs) {
    parts.push(
      `<polyline points="${r.map((p) => `${sx(p.x)},${sy(p.z)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
};

for (const line of [...streets, ...ripley, ...mcclane]) path(line, '#96a0a8', 1.5);
for (const leg of beltway) path(leg, '#f0a55a', 4.4);
for (const leg of arterials) path(leg, '#e8d9a8', 3.4);
path(mountainRoad, '#c8b06a', 3.2);

// The loop, drawn in two colours: over land, and over water where it is a
// bridge. A crossing you can see is a crossing you can plan for.
for (const leg of freeway) {
  let run = [];
  let bridging = null;
  const flush = () => {
    if (run.length > 1) path(run, bridging ? '#ff8a4c' : '#d7e3ee', bridging ? 8 : 6.2);
    run = [];
  };
  for (const p of leg) {
    const b = isWater(p.x, p.z);
    if (bridging === null) bridging = b;
    if (b !== bridging) {
      run.push(p);
      flush();
      bridging = b;
    }
    run.push(p);
  }
  flush();
}

for (const place of PLACES) {
  parts.push(
    `<circle cx="${sx(place.x)}" cy="${sy(place.z)}" r="7" fill="#ffd479" fill-opacity="0.9"/>` +
      `<text x="${sx(place.x)}" y="${(Number(sy(place.z)) - 14).toFixed(1)}" fill="#ffe9b0" font-family="system-ui, sans-serif" font-size="15" text-anchor="middle">${place.name}</text>`,
  );
}

const label = (name, x, z) =>
  parts.push(
    `<text x="${sx(x)}" y="${sy(z)}" fill="#ffffff" fill-opacity="0.62" font-family="system-ui, sans-serif" font-size="21" text-anchor="middle">${name}</text>`,
  );
label('downtown', DOWNTOWN.x, DOWNTOWN.z);
label('industrial', LOBES[1].x, LOBES[1].z);
label('across the channel', LOBES[2].x, LOBES[2].z);
label('the heights', LOBES[3].x + 300, LOBES[3].z + 900);

const land = [];
for (let i = 0; i < height.length; i++) if (!wet[i]) land.push(height[i]);
land.sort((a, b) => a - b);
parts.push(
  `<text x="16" y="${PH - 18}" fill="#cfd8dc" font-family="ui-monospace, monospace" font-size="17">` +
    `sketch · ${W / KM} x ${H / KM} km · ${((land.length / height.length) * 100).toFixed(0)}% land · ` +
    `relief to ${land[land.length - 1].toFixed(0)} m · roads routed over the terrain, not drawn</text>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PH}" viewBox="0 0 ${PX} ${PH}">${parts.join('')}</svg>`;
writeFileSync('screenshots/sketch.svg', svg);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: PX, height: PH } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: OUT });
await browser.close();

console.log(`wrote ${OUT}`);
console.log(`  land ${((land.length / height.length) * 100).toFixed(0)}% of ${(W * H) / 1e6} km2`);
console.log(
  `  height median ${land[land.length >> 1].toFixed(0)} m, 90th ${land[Math.floor(land.length * 0.9)].toFixed(0)} m, max ${land[land.length - 1].toFixed(0)} m`,
);
