import type { Apron, City, Vec2 } from './types';

/**
 * Is this point on paved ground that is not a road (#410)?
 *
 * Open ground holds a car to a quarter of its top speed, which is right for a
 * park and wrong for a container yard: the wharf is concrete from the quay to
 * the water, and concrete is as good a surface as a road. An apron is an
 * outline and a margin (`City.aprons`), the same data the ground is painted
 * from (`scene/wharfground.ts`), so what looks paved drives paved. The margin
 * is taken a little short of where the paint fades out, so the edge where the
 * concrete gives way to grass is not faster than it looks.
 */
const EDGE = 0.85;

const boxes = new WeakMap<Vec2[], { minX: number; minZ: number; maxX: number; maxZ: number }>();

export function onApron(city: City, x: number, z: number): boolean {
  // A lawn left in downtown's paving is grass whatever it lies on.
  for (const apron of city.aprons) if (apron.look === 'grass' && within(apron, x, z)) return false;

  // The drives and downtown's pavements are paved ground too (#293, #268),
  // drawn as a mesh rather than in the ground's shader; what looks paved
  // drives paved, whichever of the two draws it.
  for (const list of [city.aprons, city.drives, city.pavements]) for (const apron of list) {
    if (apron.look !== 'grass' && within(apron, x, z)) return true;
  }
  return false;
}

/** Is the point on this apron, out to the part of its margin that still looks paved? */
function within(apron: Apron, x: number, z: number): boolean {
  let box = boxes.get(apron.outline);
  if (!box) {
    box = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
    for (const p of apron.outline) {
      box.minX = Math.min(box.minX, p.x);
      box.minZ = Math.min(box.minZ, p.z);
      box.maxX = Math.max(box.maxX, p.x);
      box.maxZ = Math.max(box.maxZ, p.z);
    }
    boxes.set(apron.outline, box);
  }
  const reach = apron.margin * EDGE;
  if (x < box.minX - reach || x > box.maxX + reach || z < box.minZ - reach || z > box.maxZ + reach) return false;
  return insideOrNear(apron.outline, x, z, reach);
}

export function insideOrNear(outline: Vec2[], x: number, z: number, reach: number): boolean {
  let inside = false;
  let near = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j];
    const b = outline[i];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const span = dx * dx + dz * dz;
    const t = span < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / span));
    near = Math.min(near, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return inside || near <= reach;
}
