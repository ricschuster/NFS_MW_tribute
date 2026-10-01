import { UNITS_PER_METRE } from '../constants';
import type { Apron } from './types';

const M = UNITS_PER_METRE;

/**
 * Yards drawn in an area editor (#489), as paved ground: Industrial's open
 * yards, drivable like Sablet Wharf's and, like it, closed to traffic - a
 * place to lose a pursuit among the tanks and gantries, the owner's answer
 * on #489. Concrete, with the wharf's margin; `yard`, so a road with an end
 * inside one is private and traffic turns round where it starts.
 */
export function yardAprons(outlines: readonly (readonly [number, number])[][]): Apron[] {
  return outlines
    .filter((outline) => outline.length >= 3)
    .map((outline) => ({ outline: outline.map(([x, z]) => ({ x: x * M, z: z * M })), margin: 3 * M, look: 'concrete' as const, yard: true }));
}
