// A reference driver for Kestrel Bay's routes.
//
// The city has never had a feel baseline, and the reason is this file: a lap of
// a generated city needs a driver that can actually get round one, and the
// throwaway attempts written for #72 got round two routes of six. Everything
// they got wrong is fixed here, and the fixes are the interesting part:
//
//  - **Progress is tracked forward, not searched globally.** A route passes
//    near itself, so the nearest point on the whole loop is regularly on the
//    wrong side of it, and the aim point jumps a kilometre backwards. The
//    search is windowed around where the car was last.
//  - **The speed target is derived, not guessed.** The sim caps yaw at
//    `LATERAL_GRIP / v`, so holding a bend of radius R needs `v / R` under
//    that, which is `v <= sqrt(LATERAL_GRIP * R)`. The driver reads the radius
//    off the route ahead and drives to that number.
//  - **It brakes for what is coming, not for what it is in.** The target is the
//    lowest speed it can still reach anything in the lookahead window from,
//    which is what makes it lift before a corner rather than in one.
//
// It is a *reference* driver, not a good one: it holds the centreline and never
// takes a line. What it has to be is consistent, so a change to the car shows
// up as a change in the number.

/**
 * How hard the driver pulls back toward the line, in units of 1/second.
 *
 * Too low and it drifts wide through every bend; too high and it saws at the
 * wheel on a straight. This is about a fifth of a radian of correction for a
 * car five metres off the line at half speed.
 */
const CROSS_GAIN = 1.6;

/** Distance from the first point to each point, and the total. */
function measure(points) {
  const cumulative = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return cumulative;
}

export function routeDriver(route, K) {
  const points = route.points;
  const cumulative = measure(points);
  const length = cumulative[points.length];

  /**
   * The point `along` world units into the loop, wrapping.
   *
   * Binary search rather than a walk: the speed target samples the route
   * thirty times a step and a linear walk makes the probe take minutes.
   */
  function at(along) {
    const left = ((along % length) + length) % length;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cumulative[mid] <= left) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo];
    const b = points[(lo + 1) % points.length];
    const span = cumulative[lo + 1] - cumulative[lo];
    const t = span < 1e-6 ? 0 : (left - cumulative[lo]) / span;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }

  /**
   * How far along the car is, searched near where it was.
   *
   * Windowed on purpose: a global nearest-point search snaps to the far side
   * of a loop that passes near itself, and the driver spends the rest of the
   * lap aiming backwards.
   */
  function progress(x, z, hint) {
    let best = hint;
    let bestGap = Infinity;
    let bestHeading = 0;
    let bestSide = 0;
    const back = 6000;
    const forward = 14000;

    for (let i = 0; i < points.length; i++) {
      const from = cumulative[i];
      const span = cumulative[i + 1] - from;
      // Distance from the hint to this segment, the short way round the loop.
      let off = from + span / 2 - hint;
      while (off > length / 2) off -= length;
      while (off < -length / 2) off += length;
      if (off < -back - span || off > forward + span) continue;

      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = Math.max(1, dx * dx + dz * dz);
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const gap = Math.hypot(px - x, pz - z);
      if (gap < bestGap) {
        bestGap = gap;
        best = from + span * t;
        bestHeading = Math.atan2(dx, dz);
        // Which side of the line the car is on, in the same sign convention
        // the game's heading uses: forward crossed with up points at -x.
        const len = Math.max(1, Math.sqrt(len2));
        bestSide = ((x - px) * dz - (z - pz) * dx) / len;
      }
    }
    return { along: best, off: bestGap, heading: bestHeading, side: bestSide };
  }

  /**
   * The radius of the bend `ahead` units up the road.
   *
   * Taken as the angle turned over a fixed arc rather than a circumradius of
   * three points: the polyline is a chain of straight road pieces, so three
   * consecutive points on a straight are collinear and a circumradius is
   * infinite in a way that is numerically unpleasant.
   */
  function radiusAt(along, arc = 1600) {
    const a = at(along);
    const b = at(along + arc);
    const c = at(along + arc * 2);
    const first = Math.atan2(b.x - a.x, b.z - a.z);
    const second = Math.atan2(c.x - b.x, c.z - b.z);
    let turn = second - first;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    return Math.abs(turn) < 1e-4 ? Infinity : arc / Math.abs(turn);
  }

  /** The fastest the car can hold a bend of this radius. */
  const cornerSpeed = (radius) =>
    radius === Infinity ? Infinity : Math.sqrt(K.LATERAL_GRIP * radius);

  return {
    length,
    at,
    progress,
    /**
     * What to hold here: the lowest speed the car can still slow to anything
     * in the window from. That is what makes it lift before a corner.
     */
    target(along, speed, maxSpeed) {
      const brake = maxSpeed; // `braking` in the sim is -maxSpeed
      let limit = maxSpeed;
      // Stepped finely enough not to walk over a junction: the route's
      // vertices are the corners, and a sample that steps past one reports a
      // straight where there is a right-angle turn.
      for (let ahead = 0; ahead < 40000; ahead += 1200) {
        const corner = cornerSpeed(radiusAt(along + ahead));
        if (corner === Infinity) continue;
        // The fastest we can be here and still be at `corner` by then.
        limit = Math.min(limit, Math.sqrt(corner * corner + 2 * brake * ahead));
      }
      void speed;
      return limit;
    },
    /**
     * Which way to point, given where the car is relative to the line.
     *
     * This follows the path rather than aiming at a point on it, and the
     * difference is everything. A pure-pursuit driver aiming at a point far
     * enough ahead to be stable cuts every corner and drives through the
     * building on the inside of it; aiming at one close enough not to cut
     * oscillates. This is the standard answer: point along the road, plus a
     * correction that grows with how far off it the car is and shrinks with
     * speed, so a metre off at 300 km/h is a nudge and a metre off at walking
     * pace is a turn.
     */
    steer(found, speed) {
      const correction = Math.atan2(CROSS_GAIN * -found.side, Math.max(1200, Math.abs(speed)));
      return found.heading + correction;
    },
  };
}

/**
 * Drive `world` round `route` for up to `seconds`, and report what happened.
 *
 * `input` is the world's own input shape; the caller passes it in so this file
 * does not need to know what a `CityWorld` is.
 */
export function driveRoute(world, route, K, { seconds = 240, none, hold = () => ({}) } = {}) {
  const driver = routeDriver(route, K);
  const start = driver.at(0);
  const facing = driver.at(400);

  world.x = start.x;
  world.z = start.z;
  world.y = 0;
  world.heading = Math.atan2(facing.x - start.x, facing.z - start.z);
  world.speed = 0;

  let along = 0;
  let covered = 0;
  let elapsed = 0;
  let crashes = 0;
  let offRoute = 0;
  let stuck = 0;
  let moved = false;
  let sinceHit = 1;

  for (let t = 0; t < seconds && covered < driver.length; t += K.STEP) {
    const found = driver.progress(world.x, world.z, along);
    let step = found.along - along;
    // Only forward motion counts, and only a plausible amount of it: a jump
    // across the loop is the search having been wrong, not distance covered.
    if (step < -driver.length / 2) step += driver.length;
    if (step > 0 && step < driver.length / 4) covered += step;
    along = found.along;
    offRoute = Math.max(offRoute, found.off);

    sinceHit += K.STEP;
    if (world.crashFlash > 0.9 && sinceHit > 0.5) {
      crashes++;
      sinceHit = 0;
    }

    const want = driver.steer(found, world.speed);
    let error = want - world.heading;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;

    if (covered > 3000) moved = true;
    stuck = moved && Math.abs(world.speed) < world.maxSpeed * 0.02 ? stuck + K.STEP : 0;
    if (stuck > 0.4 && stuck < 1.5) {
      // Backing off whatever it is against, still aiming at the line.
      world.step(K.STEP, { ...none, down: true, left: error > 0, right: error < 0, ...hold(world) });
      elapsed += K.STEP;
      continue;
    }
    if (stuck >= 1.5) stuck = 0;

    const target = driver.target(along, world.speed, world.maxSpeed);
    // Left *increases* heading: the sim steers with `heading -= steer`, and a
    // driver facing +z has their right hand pointing at -x. Getting this the
    // other way round is a driver that steers away from every corner, which
    // is exactly what it did.
    world.step(K.STEP, {
      ...none,
      left: error > 0.02,
      right: error < -0.02,
      up: world.speed < target * 0.98,
      down: world.speed > target * 1.08,
      ...hold(world),
    });
    elapsed += K.STEP;
  }

  return {
    finished: covered >= driver.length,
    lap: covered / driver.length,
    elapsed,
    average: covered / Math.max(K.STEP, elapsed),
    crashes,
    offRoute,
  };
}
