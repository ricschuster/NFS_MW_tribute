import * as THREE from 'three';
import { TERRAIN_RENDER_STEP, UNITS_PER_METRE } from '../constants';
import type { City, CityRoad, LevelCrossing } from '../city/types';
import { gravelTexture } from './surfaces';
import { worldUvs } from './worlduv';

/**
 * The railway (#489): a raised ballast bed and two lines of sleepers and
 * rails, down a road whose surface is `rail`.
 *
 * Double track, because a main line is, and a railway is given the width
 * for it (`RAIL_LANES`); anything drawn narrower gets one track down its
 * middle rather than a second track off the edge of its ballast. The rails are drawn,
 * not solid: the sim drives the road under them like gravel, and a rail a
 * car could catch on would turn an escape route into a trap.
 *
 * **Where the line crosses a street it gives way to it** (#514). The street's
 * tarmac runs on over the line, the ballast stops at the street's kerbs - cut
 * along them, so a crossing at an angle ends at an angle - and the rails carry
 * on through the road set into it, between concrete crossing panels. Either
 * side of the street the bed eases down to road level over `RAMP` rather
 * than ending in a 12 cm step. All of that is position, not topology: a
 * point is in a crossing if it is within the street's half width of the
 * street's line, so a short stretch of line between a crossing and a bend
 * is cut the same as the stretch that owns the crossing's node. Nothing here
 * touches the sim, which drives the crossing as the street (`surfaceAt`).
 *
 * The ballast is one merged mesh of explicit quads, so its cut ends can be any
 * shape; it is still textured in world units by `worldUvs`, through a single
 * instance with an identity matrix. The sleepers are a merged mesh too, with
 * their uv measured *along* the line, because sleepers run square to the
 * track whichever way it goes. The rails are instanced boxes.
 */

const M = UNITS_PER_METRE;
/**
 * How far a railway's ballast stands proud of the ground (#489). The ground
 * mesh is drawn at `TERRAIN_RENDER_STEP` and wanders a few centimetres off the
 * graded height across a line, which a road's 2 cm hides and a railway did
 * not: one track sat on grass. A ballast bed is raised anyway.
 */
export const RAIL_BED = 0.12 * M;
/** Centre of each track from the middle of the line, in metres, on a line wide enough for two. */
const TRACKS = [-2.25, 2.25];
/** Narrower than this and a line is one track down its middle. */
const DOUBLE_WIDTH = 7.5;
/** Half the gauge: standard gauge is 1.435 m between the rails. */
const RAIL_HALF = 0.72;
const SLEEPER_LENGTH = 2.6;
/** Sleeper spacing along the track. */
const SLEEPER_PITCH = 0.66;
/** A rail's section, in metres. */
const RAIL_WIDTH = 0.08;
const RAIL_HEIGHT = 0.16;
/** How far a rail's head stands above the tarmac where it runs through a street. */
const RAIL_PROUD = 0.03;
/** Half the width of a crossing panel, either side of a track's centre. */
const PANEL_HALF = 1.05;
/**
 * How far either side of a street the bed takes to come down to road level,
 * measured square to the street. A crossing's road is level with the rail
 * heads; the bed is not, and something has to give that is not the road.
 */
const RAMP = 4 * M;
/** Station spacing near a crossing, so the ramp and the cut follow the street closely. */
const FINE = 0.5 * M;
/** How far past a crossing's band a line is still drawn finely. */
const NEAR = 2 * RAMP;
/** Pad on each end of a stretch of track, so two stretches at a bend meet without a gap. */
const PAD = 0.4;

export interface RailOptions {
  /** World units of aggregate per texture tile: the carriageways' own. */
  tile: number;
  /** How far the tarmac sits above the ground, which is where a crossing's level is. */
  roadLift: number;
}

type Owned = THREE.BufferGeometry | THREE.Material | THREE.Texture;

/** A crossing as the line sees it: the street's line, its half width, and how its tarmac is pitched. */
interface Band {
  crossing: LevelCrossing;
  /** Unit normal to the street's line, in the ground plane. */
  nx: number;
  nz: number;
  half: number;
  streets: CityRoad[];
}

export function railTrack(
  city: City,
  roads: readonly CityRoad[],
  groundUnder: (x: number, z: number) => number,
  options: RailOptions,
): { meshes: THREE.Object3D[]; owned: Owned[] } {
  if (roads.length === 0) return { meshes: [], owned: [] };
  const { roadLift } = options;

  const bands: Band[] = city.crossings.map((crossing) => ({
    crossing,
    nx: -crossing.through.z,
    nz: crossing.through.x,
    half: crossing.width / 2,
    streets: crossing.streets.map((id) => city.roads[id]),
  }));

  /** Signed distance from a street's centre line. */
  const across = (band: Band, x: number, z: number) =>
    (x - band.crossing.at.x) * band.nx + (z - band.crossing.at.z) * band.nz;

  /** The height a road's tarmac is drawn at here, the way `carriagewaysFor` pitches it. */
  const tarmac = (road: CityRoad, x: number, z: number) => {
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const steps = Math.max(1, Math.ceil(road.length / TERRAIN_RENDER_STEP));
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = ((x - a.x) * dx + (z - a.z) * dz) / Math.max(1, dx * dx + dz * dz);
    const s = Math.max(0, Math.min(steps - 1, Math.floor(t * steps)));
    const y0 = groundUnder(a.x + (dx * s) / steps, a.z + (dz * s) / steps);
    const y1 = groundUnder(a.x + (dx * (s + 1)) / steps, a.z + (dz * (s + 1)) / steps);
    return y0 + (y1 - y0) * (t * steps - s);
  };

  /** How far into the bed a point is: 0 on a street, 1 clear of every crossing's ramp. */
  const bedding = (x: number, z: number): { k: number; band: Band | null } => {
    let k = 1;
    let near: Band | null = null;
    for (const band of bands) {
      const dx = x - band.crossing.at.x;
      const dz = z - band.crossing.at.z;
      if (dx * dx + dz * dz > (band.half + 3 * RAMP + 30 * M) ** 2) continue;
      const out = Math.max(0, Math.min(1, (Math.abs(across(band, x, z)) - band.half) / RAMP));
      if (out < k) {
        k = out;
        near = band;
      }
    }
    return { k: k * k * (3 - 2 * k), band: near };
  };

  /** A line's own pitched height at a point, blended to the street's tarmac where it crosses one. */
  const heightAt = (bedHeight: number, x: number, z: number, lift: { flush: number; bed: number }) => {
    const { k, band } = bedding(x, z);
    if (!band || k >= 1) return bedHeight + lift.bed;
    const street = band.streets.reduce((best, road) =>
      distanceToLine(city, road, x, z) < distanceToLine(city, best, x, z) ? road : best,
    );
    const flat = tarmac(street, x, z) + roadLift;
    return flat + lift.flush + (bedHeight + lift.bed - flat - lift.flush) * k;
  };

  const ballast = new Quads();
  const sleepers = new Quads();
  const panels = new Quads();
  const rails: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];

  for (const road of roads) {
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const length = road.length;
    const fx = (b.x - a.x) / length;
    const fz = (b.z - a.z) / length;
    // Right of the direction of travel, in the ground plane.
    const rx = fz;
    const rz = -fx;
    const half = road.width / 2;
    // In world units from here on, like everything else along the line.
    const tracks = (road.width / M >= DOUBLE_WIDTH ? TRACKS : [0]).map((t) => t * M);

    // The line's own height, pitched piece by piece between ground samples the
    // way the carriageways are, and carried on past each end for the padding.
    const steps = Math.max(1, Math.ceil(length / TERRAIN_RENDER_STEP));
    const piece = length / steps;
    const ground: number[] = [];
    for (let s = 0; s <= steps; s++) ground.push(groundUnder(a.x + fx * piece * s, a.z + fz * piece * s));
    const bedAt = (d: number) => {
      const s = Math.max(0, Math.min(steps - 1, Math.floor(d / piece)));
      return ground[s] + ((ground[s + 1] - ground[s]) * (d - s * piece)) / piece;
    };
    const point = (d: number, u: number) => ({ x: a.x + fx * d + rx * u, z: a.z + fz * d + rz * u });

    // Every crossing whose band reaches this stretch of line, as an interval
    // along it on each line the drawing cares about (the bed's edges, each
    // rail, each sleeper's ends and each panel's edges).
    const from = -half;
    const to = length + half;
    const lines = [-half, half];
    for (const track of tracks) {
      lines.push(track - RAIL_HALF * M, track + RAIL_HALF * M);
      lines.push(track - (SLEEPER_LENGTH / 2) * M, track + (SLEEPER_LENGTH / 2) * M);
      lines.push(track - PANEL_HALF * M, track + PANEL_HALF * M);
    }
    const cuts: { band: Band; mid: number; sine: number; along: Map<number, [number, number]> }[] = [];
    for (const band of bands) {
      // Distance across the street is linear along the line: c0 + c1 * d.
      const c1 = fx * band.nx + fz * band.nz;
      if (Math.abs(c1) < 1e-6) continue;
      const along = new Map<number, [number, number]>();
      let mid = 0;
      let reaches = false;
      for (const u of [0, ...lines]) {
        const p = point(0, u);
        const c0 = across(band, p.x, p.z);
        const lo = (-band.half - c0) / c1;
        const hi = (band.half - c0) / c1;
        const span: [number, number] = lo < hi ? [lo, hi] : [hi, lo];
        along.set(u, span);
        if (u === 0) mid = (span[0] + span[1]) / 2;
        if (span[1] > from - NEAR && span[0] < to + NEAR) reaches = true;
      }
      // Only the crossing this line actually passes through, not one on a
      // street that happens to line up with it a kilometre away.
      const dm = Math.hypot(point(mid, 0).x - band.crossing.at.x, point(mid, 0).z - band.crossing.at.z);
      if (reaches && dm < band.half + 2 * M) cuts.push({ band, mid, sine: Math.abs(c1), along });
    }

    // Stations along the line: the pieces, finely near a crossing, and exactly
    // on every line's cut so each edge lands on the street's kerb.
    const stations = new Set<number>([from, to, -PAD * M, length + PAD * M]);
    for (let s = 1; s < steps; s++) stations.add(s * piece);
    for (const cut of cuts) {
      for (const [lo, hi] of cut.along.values()) {
        for (const d of [lo, hi]) if (d > from && d < to) stations.add(d);
      }
      const [lo, hi] = cut.along.get(0)!;
      // The ramp is measured square to the street, so along the line it is longer.
      const reach = RAMP / cut.sine + NEAR;
      for (let d = lo - reach; d <= hi + reach; d += FINE) if (d > from && d < to) stations.add(d);
    }
    const list = [...stations].sort((p, q) => p - q);
    // The track is padded only enough to close a bend; the bed pads by half its
    // width, as the carriageways do, to fill the joins.
    const trackStations = list.filter((d) => d >= -PAD * M - 1e-6 && d <= length + PAD * M + 1e-6);

    // Which side of each crossing a station is on, so nothing is drawn across one.
    const side = (d: number) => cuts.map((cut) => (d < cut.mid ? 0 : 1)).join('');
    /** Pull a station on line `u` out of any crossing it falls in, to that crossing's kerb on its side. */
    const outside = (d: number, u: number): number | null => {
      let out = d;
      for (const cut of cuts) {
        const [lo, hi] = cut.along.get(u)!;
        if (out > lo && out < hi) out = d < cut.mid ? lo : hi;
      }
      return out < from || out > to ? null : out;
    };
    const inside = (d: number, u: number) => cuts.some((cut) => {
      const [lo, hi] = cut.along.get(u)!;
      return d >= lo - 1e-3 && d <= hi + 1e-3;
    });

    const vertex = (d: number, u: number, lift: { flush: number; bed: number }) => {
      const p = point(d, u);
      return new THREE.Vector3(p.x, heightAt(bedAt(d), p.x, p.z, lift), p.z);
    };

    // The bed: a strip between its two edges, each edge pulled back to the kerb.
    const bed = { flush: 0, bed: RAIL_BED };
    for (let i = 0; i + 1 < list.length; i++) {
      if (side(list[i]) !== side(list[i + 1])) continue;
      const l0 = outside(list[i], -half);
      const r0 = outside(list[i], half);
      const l1 = outside(list[i + 1], -half);
      const r1 = outside(list[i + 1], half);
      if (l0 === null || r0 === null || l1 === null || r1 === null) continue;
      if (l0 === l1 && r0 === r1) continue;
      ballast.quad(vertex(l0, -half, bed), vertex(r0, half, bed), vertex(r1, half, bed), vertex(l1, -half, bed));
    }

    for (const centre of tracks) {
      // Sleepers: only where the whole sleeper is clear of the street.
      const sleeper = { flush: 0.01 * M, bed: RAIL_BED + 0.04 * M };
      const left = centre - (SLEEPER_LENGTH / 2) * M;
      const right = centre + (SLEEPER_LENGTH / 2) * M;
      for (let i = 0; i + 1 < trackStations.length; i++) {
        const d0 = trackStations[i];
        const d1 = trackStations[i + 1];
        if (side(d0) !== side(d1)) continue;
        if ([d0, d1].some((d) => inside(d, left) || inside(d, right))) continue;
        sleepers.quad(
          vertex(d0, left, sleeper),
          vertex(d0, right, sleeper),
          vertex(d1, right, sleeper),
          vertex(d1, left, sleeper),
          [
            [0, d0 / M / SLEEPER_PITCH],
            [1, d0 / M / SLEEPER_PITCH],
            [1, d1 / M / SLEEPER_PITCH],
            [0, d1 / M / SLEEPER_PITCH],
          ],
        );
      }

      // Rails: unbroken, through the street and all. The height does the work:
      // on the bed they ride it, in a street their heads are just proud of the tarmac.
      const rail = {
        flush: RAIL_PROUD * M - (RAIL_HEIGHT / 2) * M,
        bed: RAIL_BED + 0.16 * M,
      };
      for (const offset of [-RAIL_HALF * M, RAIL_HALF * M]) {
        const u = centre + offset;
        for (let i = 0; i + 1 < trackStations.length; i++) {
          rails.push({ a: vertex(trackStations[i], u, rail), b: vertex(trackStations[i + 1], u, rail) });
        }
      }

      // Crossing panels: the tarmac between and beside the rails is a slab of
      // concrete, the one thing that says "level crossing" from a distance.
      const panel = { flush: 0.008 * M, bed: 0.008 * M };
      for (const cut of cuts) {
        const [ll, lh] = cut.along.get(centre - PANEL_HALF * M)!;
        const [rl, rh] = cut.along.get(centre + PANEL_HALF * M)!;
        const clamp = (d: number) => Math.max(from, Math.min(to, d));
        if (clamp(lh) <= clamp(ll) && clamp(rh) <= clamp(rl)) continue;
        panels.quad(
          vertex(clamp(ll), centre - PANEL_HALF * M, panel),
          vertex(clamp(rl), centre + PANEL_HALF * M, panel),
          vertex(clamp(rh), centre + PANEL_HALF * M, panel),
          vertex(clamp(lh), centre - PANEL_HALF * M, panel),
        );
      }
    }
  }

  const owned: Owned[] = [];
  const meshes: THREE.Object3D[] = [];

  // The bed, textured in world units like every other road surface: gravel,
  // darker for the oil and the years (#489).
  const ballastGeometry = ballast.geometry();
  const ballastMaterial = new THREE.MeshLambertMaterial({ color: '#6f685f', map: gravelTexture(1, 1) });
  worldUvs(ballastMaterial, { faces: 'top', tile: { u: options.tile, v: options.tile }, key: 'rail' });
  const bedMesh = new THREE.InstancedMesh(ballastGeometry, ballastMaterial, 1);
  bedMesh.setMatrixAt(0, new THREE.Matrix4());
  bedMesh.name = 'carriageways-rail';
  bedMesh.receiveShadow = true;
  meshes.push(bedMesh);
  owned.push(ballastGeometry, ballastMaterial);

  const sleeperGeometry = sleepers.geometry();
  const sleeperTexture = new THREE.CanvasTexture(sleeperTile());
  sleeperTexture.wrapS = THREE.ClampToEdgeWrapping;
  sleeperTexture.wrapT = THREE.RepeatWrapping;
  sleeperTexture.anisotropy = 8;
  sleeperTexture.colorSpace = THREE.SRGBColorSpace;
  const sleeperMaterial = new THREE.MeshLambertMaterial({
    map: sleeperTexture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const sleeperMesh = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
  sleeperMesh.name = 'rail-sleepers';
  sleeperMesh.receiveShadow = true;
  meshes.push(sleeperMesh);
  owned.push(sleeperGeometry, sleeperMaterial, sleeperTexture);

  if (panels.count > 0) {
    const panelGeometry = panels.geometry();
    // Sits a few millimetres over the tarmac, so it needs a depth offset too.
    const panelMaterial = new THREE.MeshLambertMaterial({
      color: '#8a8780',
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
    panelMesh.name = 'rail-crossing-panels';
    panelMesh.receiveShadow = true;
    meshes.push(panelMesh);
    owned.push(panelGeometry, panelMaterial);
  }

  // Rails: a unit box per rail per stretch, scaled and pitched between its ends.
  const railGeometry = new THREE.BoxGeometry(1, 1, 1);
  const railMaterial = new THREE.MeshLambertMaterial({ color: '#8f9498' });
  const railMesh = new THREE.InstancedMesh(railGeometry, railMaterial, Math.max(1, rails.length));
  railMesh.name = 'rail-rails';
  railMesh.castShadow = true;
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  rails.forEach(({ a, b }, i) => {
    const forward = new THREE.Vector3().subVectors(b, a);
    // A little long, so two stretches meeting at a bend meet without a gap.
    const length = forward.length() + 0.1 * M;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const normal = new THREE.Vector3().crossVectors(forward, right).normalize();
    matrix.makeBasis(
      right.multiplyScalar(RAIL_WIDTH * M),
      normal.multiplyScalar(RAIL_HEIGHT * M),
      forward.multiplyScalar(length),
    );
    matrix.setPosition(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
    railMesh.setMatrixAt(i, matrix);
  });
  railMesh.count = rails.length;
  railMesh.instanceMatrix.needsUpdate = true;
  meshes.push(railMesh);
  owned.push(railGeometry, railMaterial);

  const furniture = crossingPosts(city, groundUnder);
  meshes.push(...furniture.meshes);
  owned.push(...furniture.owned);

  return { meshes, owned };
}

/** How far a point is from a road's centre line, carried on past its ends. */
function distanceToLine(city: City, road: CityRoad, x: number, z: number): number {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const along = ((x - a.x) * dx + (z - a.z) * dz) / length;
  const off = Math.abs(((x - a.x) * dz - (z - a.z) * dx) / length);
  // Past an end, distance to that end: the nearer arm of a bent street wins.
  if (along < 0) return Math.hypot(x - a.x, z - a.z);
  if (along > length) return Math.hypot(x - b.x, z - b.z);
  return off;
}

/** Flat quads, gathered into one geometry. Corners anticlockwise seen from above. */
class Quads {
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];
  count = 0;

  quad(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    uv: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ): void {
    const base = this.positions.length / 3;
    [p0, p1, p2, p3].forEach((p, i) => {
      this.positions.push(p.x, p.y, p.z);
      this.uvs.push(uv[i][0], uv[i][1]);
    });
    // Whichever way round the corners came, face the triangles up.
    const e1 = new THREE.Vector3().subVectors(p1, p0);
    const e2 = new THREE.Vector3().subVectors(p2, p0);
    const upward = new THREE.Vector3().crossVectors(e1, e2).y >= 0;
    if (upward) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    this.count++;
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

/**
 * The warning posts at a level crossing (#514): a post, a crossbuck and a
 * pair of red lamps, on each corner, facing the traffic coming at the line.
 * Drawn only - furniture is not solid anywhere in the city, and a post a car
 * could stop dead on at the edge of a street would be the one in the city.
 */
function crossingPosts(
  city: City,
  groundUnder: (x: number, z: number) => number,
): { meshes: THREE.Object3D[]; owned: Owned[] } {
  const posts = city.crossings.flatMap((crossing) => crossing.posts);
  if (posts.length === 0) return { meshes: [], owned: [] };

  const box = new THREE.BoxGeometry(1, 1, 1);
  const white = new THREE.MeshLambertMaterial({ color: '#e8e6df' });
  const dark = new THREE.MeshLambertMaterial({ color: '#25272a' });
  const red = new THREE.MeshBasicMaterial({ color: '#d8372b' });

  const parts: { name: string; material: THREE.Material; pieces: { at: THREE.Vector3; size: THREE.Vector3; roll: number }[] }[] = [
    // The post.
    { name: 'crossing-posts', material: white, pieces: [{ at: new THREE.Vector3(0, 1.6, 0), size: new THREE.Vector3(0.14, 3.2, 0.14), roll: 0 }] },
    // The crossbuck, a white X at the top.
    {
      name: 'crossing-crossbucks',
      material: white,
      pieces: [-1, 1].map((s) => ({ at: new THREE.Vector3(0, 2.85, 0.1), size: new THREE.Vector3(1.3, 0.22, 0.04), roll: (s * Math.PI) / 4 })),
    },
    // The lamp housing across the post, below the crossbuck.
    { name: 'crossing-housings', material: dark, pieces: [{ at: new THREE.Vector3(0, 2.15, 0.1), size: new THREE.Vector3(0.95, 0.3, 0.16), roll: 0 }] },
    // Its two lamps.
    {
      name: 'crossing-lamps',
      material: red,
      pieces: [-1, 1].map((s) => ({ at: new THREE.Vector3(s * 0.32, 2.15, 0.19), size: new THREE.Vector3(0.2, 0.2, 0.03), roll: 0 })),
    },
  ];

  const meshes: THREE.Object3D[] = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const facing = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(box, part.material, posts.length * part.pieces.length);
    mesh.name = part.name;
    mesh.castShadow = true;
    let i = 0;
    for (const post of posts) {
      const ground = groundUnder(post.at.x, post.at.z);
      facing.setFromAxisAngle(yAxis, post.angle);
      for (const piece of part.pieces) {
        rotation.setFromAxisAngle(zAxis, piece.roll).premultiply(facing);
        const at = piece.at.clone().multiplyScalar(M).applyQuaternion(facing);
        matrix.compose(
          new THREE.Vector3(post.at.x + at.x, ground + at.y, post.at.z + at.z),
          rotation,
          piece.size.clone().multiplyScalar(M),
        );
        mesh.setMatrixAt(i++, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }
  return { meshes, owned: [box, white, dark, red] };
}

/** One sleeper across the tile, the rest of it see-through to the ballast. */
function sleeperTile(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = '#4a3f35';
  ctx.fillRect(0, 8, 32, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 18, 32, 2);
  return canvas;
}
