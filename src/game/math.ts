export function limit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function accelerate(v: number, accel: number, dt: number): number {
  return v + accel * dt;
}

export function interpolate(a: number, b: number, percent: number): number {
  return a + (b - a) * percent;
}

export function easeIn(a: number, b: number, percent: number): number {
  return a + (b - a) * Math.pow(percent, 2);
}

export function easeInOut(a: number, b: number, percent: number): number {
  return a + (b - a) * (-Math.cos(percent * Math.PI) / 2 + 0.5);
}

/** Distance fog falloff; returns a visibility factor in (0,1]. */
export function exponentialFog(distance: number, density: number): number {
  return 1 / Math.pow(Math.E, distance * distance * density);
}

/** Advance a looping position within [0, max). */
export function increase(start: number, increment: number, max: number): number {
  let result = start + increment;
  while (result >= max) result -= max;
  while (result < 0) result += max;
  return result;
}

export function percentRemaining(n: number, total: number): number {
  return (n % total) / total;
}
