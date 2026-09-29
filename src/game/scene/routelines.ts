import * as THREE from 'three';
import { GUIDE_HALF, GUIDE_WIDTH, UNITS_PER_METRE } from '../constants';
import { groundAt } from '../city/terrain';
import { surfaceAt } from '../city/grid';
import { guidePath } from '../guide';
import type { CityWorld } from '../cityworld';

/** How far above the surface the lines sit: clear of the tarmac, which is itself 2 cm up. */
const LIFT = 0.12 * UNITS_PER_METRE;

/**
 * The route ahead, drawn on the road (#443).
 *
 * Two glowing cyan lines a lane apart, the way the reference game marks a race
 * route on the tarmac. The points come from `guidePath`, so the lines and the
 * minimap are the same route; this only drapes them. Each point is lifted
 * onto the road under it at the height the last one was at, so on a bridge
 * deck they stay on the deck rather than dropping to the river.
 *
 * Unlit, and faded to nothing at the far end by vertex alpha, so the lines run
 * out rather than stopping. Blended normally rather than additively: added to
 * a sunlit gravel road, cyan barely showed. One mesh, rebuilt each frame: a
 * few hundred vertices.
 */
export class RouteLines {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();

  constructor() {
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  update(world: CityWorld): void {
    const points = guidePath(world);
    if (points.length < 2) {
      this.mesh.visible = false;
      return;
    }
    const positions: number[] = [];
    const colours: number[] = [];
    const indices: number[] = [];
    const cyan = new THREE.Color('#3fd8ff');
    let y = world.y;
    // On a street, the ground the tarmac is draped over, which is what is
    // drawn; the network's own height runs straight between junctions and dips
    // under a bulge in the road. On a deck or in a tunnel, the deck.
    const heights = points.map((p) => {
      const under = surfaceAt(world.city, world.grid, p.x, p.z, y);
      const level = under.road ? world.city.nodes[under.road.a].level : 'surface';
      y = level === 'surface' ? groundAt(world.city.terrain, p.x, p.z) : under.y;
      return y + LIFT;
    });
    for (const side of [-1, 1]) {
      for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(points.length - 1, i + 1)];
        const len = Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
        // Across the way ahead: the pair either side of the line, each a strip.
        const nx = -(b.z - a.z) / len;
        const nz = (b.x - a.x) / len;
        const centre = GUIDE_HALF * side;
        const base = positions.length / 3;
        for (const edge of [-GUIDE_WIDTH / 2, GUIDE_WIDTH / 2]) {
          positions.push(points[i].x + nx * (centre + edge), heights[i], points[i].z + nz * (centre + edge));
        }
        // Brightest just ahead of the car, gone by the far end.
        const u = i / (points.length - 1);
        const fade = Math.min(1, u * 8) * (1 - u) ** 1.5;
        for (let k = 0; k < 2; k++) colours.push(cyan.r, cyan.g, cyan.b, 0.9 * fade);
        if (i > 0) indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
      }
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4));
    this.geometry.setIndex(indices);
    this.geometry.computeBoundingSphere();
    this.mesh.visible = true;
  }
}
