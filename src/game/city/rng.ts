/**
 * mulberry32: a small, fast, deterministic PRNG.
 *
 * The city generator never touches `Math.random`. The map is content, not a
 * per-session roll: the same seed has to give back the same Kestrel Bay in the
 * browser, in the playtests and in the map tool, and a global generator that
 * anything else can advance would quietly break that.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** The next value in [0, 1). */
  float(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A value in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** An integer in [0, max). */
  int(max: number): number {
    return Math.floor(this.float() * max);
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}
