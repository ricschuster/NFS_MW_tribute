import { describe, it, expect } from "vitest";
import { tileRepeat } from "./surfaces";
import { UNITS_PER_METRE } from "../constants";

/**
 * The tarmac tile has to be a fixed size on the ground, not a fixed fraction
 * of it. Nothing catches the difference by eye: a stretched tile from a wider
 * seed still looks like tarmac, just tarmac whose stones are two metres
 * across, and the aerial view is too far up to tell.
 */
describe("the ground tiling", () => {
  it("covers a fixed number of metres per tile", () => {
    const across = tileRepeat(1000 * UNITS_PER_METRE, 1000 * UNITS_PER_METRE);
    // One tile per eight metres, so a kilometre is a hundred and twenty five.
    expect(across.x).toBeCloseTo(125, 6);
    expect(across.y).toBeCloseTo(125, 6);
  });

  it("scales with the map rather than stretching over it", () => {
    const small = tileRepeat(1000, 2000);
    const big = tileRepeat(3000, 2000);
    expect(big.x / small.x).toBeCloseTo(3, 6);
    // The other axis is not touched by a change to this one.
    expect(big.y).toBeCloseTo(small.y, 6);
  });
});
