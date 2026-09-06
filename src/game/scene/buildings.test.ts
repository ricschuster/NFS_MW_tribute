import { describe, it, expect } from 'vitest';
import { setbackOf } from './buildings';
import type { Building, BuildingKind } from '../city/types';

function building(over: Partial<Building> = {}): Building {
  return {
    footprint: { minX: 0, maxX: 3000, minZ: 0, maxZ: 5000 },
    height: 20000,
    kind: 'tower',
    district: 'downtown',
    variant: 0.5,
    ...over,
  };
}

const width = (b: Building) => b.footprint.maxX - b.footprint.minX;
const depth = (b: Building) => b.footprint.maxZ - b.footprint.minZ;
const stepOf = (b: Building) => setbackOf(b, width(b), depth(b));

/** Every setback over the whole range of variants, for one kind. */
function sweep(kind: BuildingKind, over: Partial<Building> = {}) {
  return Array.from({ length: 400 }, (_, i) => {
    const b = building({ kind, variant: i / 400, ...over });
    return { b, step: stepOf(b) };
  });
}

describe('where a tower steps back', () => {
  it('steps somewhere up the building, never at the ends', () => {
    for (const { b, step } of sweep('tower')) {
      if (!step) continue;
      // At zero the base vanishes and the whole tower is the narrow part; at
      // full height there is nothing above the step to see.
      expect(step.at).toBeGreaterThan(0);
      expect(step.at).toBeLessThan(b.height);
    }
  });

  it('leaves an upper section that is narrower but still there', () => {
    for (const { b, step } of sweep('tower')) {
      if (!step) continue;
      expect(step.inset).toBeGreaterThan(0);
      // Inset from both sides, so twice it has to fit inside the narrow axis
      // with room to spare - otherwise a long thin tower steps past its own
      // centreline and the upper section inverts.
      expect(step.inset * 2).toBeLessThan(Math.min(width(b), depth(b)));
    }
  });

  // A long thin tower is the case that breaks a setback measured off the
  // wrong axis: nine per cent of a fifty-metre frontage is more than half of
  // a five-metre one.
  it('measures the step off the narrow side of a thin tower', () => {
    const thin = building({ footprint: { minX: 0, maxX: 600, minZ: 0, maxZ: 40000 } });
    const step = stepOf(thin);
    if (step) expect(step.inset * 2).toBeLessThan(600);
  });

  it('steps some towers and not others', () => {
    const stepped = sweep('tower').filter((row) => row.step).length;
    expect(stepped).toBeGreaterThan(0);
    expect(stepped).toBeLessThan(400);
  });

  // A stepped warehouse is a ziggurat, and a stepped midtown block is a
  // wedding cake down every street in the district.
  it('steps nothing that is not a tower', () => {
    expect(sweep('block').filter((row) => row.step)).toHaveLength(0);
    expect(sweep('shed').filter((row) => row.step)).toHaveLength(0);
  });

  it('gives the same building the same step twice', () => {
    const b = building({ variant: 0.83 });
    expect(stepOf(b)).toEqual(stepOf(b));
  });
});
