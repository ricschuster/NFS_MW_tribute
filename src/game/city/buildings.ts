import { BUILDINGS, BUILDING_LANDMARK_MULT, BUILDING_MIN_LOT } from '../constants';
import type { Rng } from './rng';
import type { Building, CityBlock, Rect } from './types';

/**
 * Put buildings on the blocks (#84).
 *
 * These are *descriptions* - a footprint, a height, a kind - and never meshes.
 * The generator does not import three.js and must not: that seam is what lets
 * boxes become modelled assets later by swapping the provider, and it is also
 * what lets `World` collide with the city in #86 without a renderer.
 *
 * A block is divided into lots, each lot gets a building stood back from its
 * edges, and heights are skewed low so the occasional landmark reads as tall
 * rather than every building competing.
 */
export function buildingsOn(rng: Rng, block: CityBlock): Building[] {
  const character = BUILDINGS[block.district];
  const out: Building[] = [];

  const xEdges = divideLots(rng, block.bounds.minX, block.bounds.maxX, character.lot);
  const zEdges = divideLots(rng, block.bounds.minZ, block.bounds.maxZ, character.lot);

  for (let i = 0; i < xEdges.length - 1; i++) {
    for (let j = 0; j < zEdges.length - 1; j++) {
      const lot: Rect = {
        minX: xEdges[i],
        maxX: xEdges[i + 1],
        minZ: zEdges[j],
        maxZ: zEdges[j + 1],
      };
      // Draw for every lot whether or not it is built on, so that adding a
      // building later does not shuffle every one after it.
      const skip = rng.chance(character.empty);
      const landmark = rng.chance(character.landmark);
      const roll = rng.float();
      const variant = rng.float();
      if (skip) continue;

      const footprint = inset(lot, character.setback);
      if (footprint === null) continue;

      // Skewed low: the square of a uniform draw puts most buildings near the
      // bottom of the range, which is what a real skyline looks like.
      const span = character.maxHeight - character.minHeight;
      const height = character.minHeight + roll * roll * span * (landmark ? BUILDING_LANDMARK_MULT : 1);

      out.push({ footprint, height, kind: character.kind, district: block.district, variant });
    }
  }

  return out;
}

/**
 * Split [min, max] into lots of about `target`. Unlike the street divider this
 * has to cover the whole span, so it picks a lot count and shares the span out
 * evenly rather than walking and leaving a remainder.
 */
function divideLots(rng: Rng, min: number, max: number, target: number): number[] {
  const span = max - min;
  const count = Math.max(1, Math.round(span / target));
  const edges = [min];
  // Uneven splits, so a block is not a row of identical plots.
  const weights = Array.from({ length: count }, () => 0.75 + rng.float() * 0.5);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let at = min;
  for (let i = 0; i < count - 1; i++) {
    at += (span * weights[i]) / total;
    edges.push(at);
  }
  edges.push(max);
  return edges;
}

/** Stand a building back from its lot edges, or `null` if nothing is left. */
function inset(lot: Rect, by: number): Rect | null {
  const width = lot.maxX - lot.minX;
  const depth = lot.maxZ - lot.minZ;
  if (width < BUILDING_MIN_LOT || depth < BUILDING_MIN_LOT) return null;
  // Never set back so far that the building vanishes on a narrow lot.
  const x = Math.min(by, width * 0.3);
  const z = Math.min(by, depth * 0.3);
  return { minX: lot.minX + x, maxX: lot.maxX - x, minZ: lot.minZ + z, maxZ: lot.maxZ - z };
}
