import * as THREE from 'three';
import { LAMP_HEIGHT, LAMP_SPACING, UNITS_PER_METRE } from '../constants';
import type { StreetProp } from '../city/types';

/**
 * Overhead wires between street lamps (#582, `?look=clutter`).
 *
 * A street with nothing crossing the sky above it looks like a diagram. The
 * wires are drawn, not placed: every lamp is joined to the next lamp along the
 * same side of the same road, which the lamp data already says (same facing
 * within a few degrees, same side of the carriageway, a span apart), so nothing in `city/`
 * changes and a wire cannot exist where a lamp does not.
 *
 * Each span is two conductors sagging as a catenary-ish parabola, in one
 * `LineSegments` for the whole city.
 */
const M = UNITS_PER_METRE;
const SAG = 0.9 * M;
const STEPS = 6;
/** Lamps along the long roads stand 60-70 m apart in the generated city, not `LAMP_SPACING`. */
const MAX_SPAN = 90 * M;

/** Pairs of lamp indices that a wire joins, each pair once. */
export function wirePairs(props: readonly StreetProp[]): [number, number][] {
  const lamps = props.filter((p) => p.kind === 'lamp');
  const cell = MAX_SPAN;
  const grid = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  lamps.forEach((l, i) => {
    const k = key(l.at.x, l.at.z);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  });

  const pairs: [number, number][] = [];
  const taken = new Set<string>();
  lamps.forEach((a, i) => {
    let best = -1;
    let bestD = Infinity;
    const cx = Math.floor(a.at.x / cell);
    const cz = Math.floor(a.at.z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (j <= i) continue;
          const b = lamps[j];
          if (b.reach !== a.reach || Math.abs(b.y - a.y) > 2 * M) continue;
          // Same road: facing within a hair (either way round).
          const turn = Math.abs(Math.sin(a.angle - b.angle));
          if (turn > 0.35) continue;
          const d = Math.hypot(b.at.x - a.at.x, b.at.z - a.at.z);
          if (d < LAMP_SPACING * 0.4 || d > MAX_SPAN) continue;
          // And along the road, not across it: the span runs the way they face.
          const along = Math.abs((b.at.x - a.at.x) * Math.sin(a.angle) + (b.at.z - a.at.z) * Math.cos(a.angle));
          if (along < d * 0.9) continue;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
    }
    if (best >= 0 && !taken.has(`${i}:${best}`)) {
      taken.add(`${i}:${best}`);
      pairs.push([i, best]);
    }
  });
  return pairs;
}

export class LampWires {
  readonly lines: THREE.LineSegments;

  constructor(props: readonly StreetProp[]) {
    const lamps = props.filter((p) => p.kind === 'lamp');
    const pairs = wirePairs(props);
    const out: number[] = [];
    const top = LAMP_HEIGHT - 0.15 * M;
    for (const [i, j] of pairs) {
      const a = lamps[i];
      const b = lamps[j];
      // Two conductors, a hand's width apart.
      for (const drop of [0, 0.35 * M]) {
        let px = a.at.x;
        let py = a.y + top - drop;
        let pz = a.at.z;
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS;
          const x = a.at.x + (b.at.x - a.at.x) * t;
          const z = a.at.z + (b.at.z - a.at.z) * t;
          const y = a.y + top - drop + (b.y - a.y) * t - SAG * 4 * t * (1 - t);
          out.push(px, py, pz, x, y, z);
          px = x;
          py = y;
          pz = z;
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    this.lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#1c1f22', fog: true }));
    this.lines.name = 'lamp-wires';
    this.lines.frustumCulled = false;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
