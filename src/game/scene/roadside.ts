import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';
import { inWater } from '../city/grid';
import type { City, CityRoad } from '../city/types';

/**
 * Roadside clutter derived from the roads (#582, `?look=clutter`).
 *
 * Three things the reference frames have and the city lacked, none of which is
 * placed in `city/`: each is a pure function of the road network, so the
 * generator, the sim and the lap baselines are untouched, and nothing here can
 * exist where a road does not.
 *
 * - **Deck rails.** The interstate (10 km of it 12 m up) and its ramps were a
 *   bare slab; a bridge carries a parapet and the viaduct did not. A concrete
 *   wall with a coping, down both edges, not drawn where the road is in a tunnel.
 * - **Waterside guardrail.** Along the roads that follow the water
 *   (`embankment`), on whichever edge has water within `WATER_LOOK` of it.
 * - **Red-and-white kerbs.** On the outside of a sharp bend: a node with two
 *   roads meeting at 25 degrees or more off straight, striped a metre at a time.
 */
const M = UNITS_PER_METRE;
const RAIL_HEIGHT = 1.3 * M;
const RAIL_WIDTH = 0.45 * M;
const COPING_HEIGHT = 0.18 * M;
const GUARD_STEP = 6 * M;
const GUARD_HEIGHT = 0.75 * M;
const WATER_LOOK = 6 * M;
const BEND_MIN = (25 * Math.PI) / 180;
const KERB_RUN = 10 * M;
const KERB_BLOCK = 1 * M;
const KERB_WIDTH = 0.45 * M;
const KERB_HEIGHT = 0.14 * M;

interface Piece {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Across, up, along. */
  sx: number;
  sy: number;
  sz: number;
  /** Kerb blocks only: 0 red, 1 white. */
  colour?: number;
}

/** Local x runs across the road, z along it: the same frame the deck is composed in. */
function roadFrame(road: CityRoad, city: City) {
  const a = city.nodes[road.a];
  const b = city.nodes[road.b];
  const dx = (b.pos.x - a.pos.x) / road.length;
  const dz = (b.pos.z - a.pos.z) / road.length;
  return { a, b, dx, dz, across: { x: dz, z: -dx }, yaw: Math.atan2(dx, dz), pitch: Math.atan2(b.y - a.y, road.length) };
}

/** Both edges of every deck that is not wholly underground. */
export function deckRails(city: City): Piece[] {
  const out: Piece[] = [];
  for (const road of city.roads) {
    if (road.class !== 'interstate' && road.class !== 'ramp') continue;
    const { a, b, across, yaw, pitch } = roadFrame(road, city);
    if (a.level === 'tunnel' && b.level === 'tunnel') continue;
    const length = Math.hypot(road.length, b.y - a.y);
    for (const side of [1, -1]) {
      const off = (road.width / 2 - RAIL_WIDTH / 2) * side;
      out.push({
        x: (a.pos.x + b.pos.x) / 2 + across.x * off,
        y: (a.y + b.y) / 2 + RAIL_HEIGHT / 2,
        z: (a.pos.z + b.pos.z) / 2 + across.z * off,
        yaw,
        pitch,
        sx: RAIL_WIDTH,
        sy: RAIL_HEIGHT,
        sz: length,
      });
    }
  }
  return out;
}

/** Guardrail panels along the water side of the roads that follow the shore. */
export function guardrails(city: City): Piece[] {
  const out: Piece[] = [];
  for (const road of city.roads) {
    if (!road.embankment || road.bridge || road.class === 'ramp' || road.class === 'interstate') continue;
    const { a, b, dx, dz, across, yaw, pitch } = roadFrame(road, city);
    if (a.level !== 'surface' || b.level !== 'surface') continue;
    for (let t = GUARD_STEP / 2; t < road.length; t += GUARD_STEP) {
      const cx = a.pos.x + dx * t;
      const cz = a.pos.z + dz * t;
      const cy = a.y + ((b.y - a.y) * t) / road.length;
      for (const side of [1, -1]) {
        const reach = road.width / 2 + WATER_LOOK;
        if (!inWater(city, cx + across.x * reach * side, cz + across.z * reach * side)) continue;
        const off = (road.width / 2 + 0.5 * M) * side;
        out.push({
          x: cx + across.x * off,
          y: cy + GUARD_HEIGHT / 2,
          z: cz + across.z * off,
          yaw,
          pitch,
          sx: 0.14 * M,
          sy: GUARD_HEIGHT,
          sz: GUARD_STEP * 0.96,
        });
      }
    }
  }
  return out;
}

/** Alternate red and white blocks on the outside of every sharp two-road bend. */
export function bendKerbs(city: City): Piece[] {
  const out: Piece[] = [];
  for (const node of city.nodes) {
    if (node.level !== 'surface' || node.roads.length !== 2) continue;
    const roads = node.roads.map((i) => city.roads[i]);
    if (roads.some((r) => r.surface !== 'asphalt' || r.bridge || r.class === 'ramp' || r.class === 'interstate')) continue;
    const dirs = roads.map((r) => {
      const far = city.nodes[r.a === node.id ? r.b : r.a];
      const len = r.length;
      return { x: (far.pos.x - node.pos.x) / len, z: (far.pos.z - node.pos.z) / len, far };
    });
    // Off-straight: 0 when the two roads run on through, pi when they fold back.
    const between = Math.acos(Math.max(-1, Math.min(1, dirs[0].x * dirs[1].x + dirs[0].z * dirs[1].z)));
    if (Math.PI - between < BEND_MIN) continue;
    roads.forEach((road, k) => {
      const d = dirs[k];
      const other = dirs[1 - k];
      const perp = { x: d.z, z: -d.x };
      // The inside of the bend is the side the other road leaves towards.
      const inner = Math.sign(perp.x * other.x + perp.z * other.z) || 1;
      const run = Math.min(KERB_RUN, road.length * 0.45);
      const yaw = Math.atan2(d.x, d.z);
      const off = -inner * (road.width / 2 - KERB_WIDTH / 2);
      for (let s = 0, i = 0; s + KERB_BLOCK <= run + 1e-6; s += KERB_BLOCK, i++) {
        const t = s + KERB_BLOCK / 2;
        out.push({
          x: node.pos.x + d.x * t + perp.x * off,
          y: node.y + ((d.far.y - node.y) * t) / road.length + KERB_HEIGHT / 2,
          z: node.pos.z + d.z * t + perp.z * off,
          yaw,
          pitch: 0,
          sx: KERB_WIDTH,
          sy: KERB_HEIGHT,
          sz: KERB_BLOCK,
          colour: i % 2,
        });
      }
    });
  }
  return out;
}

export class Roadside {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(city: City) {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    this.owned.push(unit);

    const rails = deckRails(city);
    this.add('deck-rails', unit, rails, '#9a9ea3');
    // The coping is a wider, lighter cap on the same wall, as the bridge parapet's is.
    this.add(
      'deck-rail-coping',
      unit,
      rails.map((p) => ({ ...p, y: p.y + p.sy / 2 + COPING_HEIGHT / 2 - 0.02 * M, sx: p.sx * 1.35, sy: COPING_HEIGHT })),
      '#c3c7cc',
    );
    this.add('guardrails', unit, guardrails(city), '#b9c0c6');
    this.add('bend-kerbs', unit, bendKerbs(city), '#ffffff', true);
  }

  private add(name: string, geometry: THREE.BufferGeometry, pieces: Piece[], colour: string, striped = false): void {
    if (pieces.length === 0) return;
    const material = new THREE.MeshLambertMaterial({ color: striped ? '#ffffff' : colour });
    this.owned.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, pieces.length);
    mesh.name = name;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pitch = new THREE.Quaternion();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const red = new THREE.Color('#c23a32');
    const white = new THREE.Color('#e8e8e4');
    pieces.forEach((p, i) => {
      euler.set(0, p.yaw, 0, 'YXZ');
      quaternion.setFromEuler(euler);
      quaternion.multiply(pitch.setFromAxisAngle(xAxis, -p.pitch));
      matrix.compose(new THREE.Vector3(p.x, p.y, p.z), quaternion, new THREE.Vector3(p.sx, p.sy, p.sz));
      mesh.setMatrixAt(i, matrix);
      if (striped) mesh.setColorAt(i, p.colour ? white : red);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.meshes.push(mesh);
  }

  dispose(): void {
    for (const resource of this.owned) resource.dispose();
  }
}
