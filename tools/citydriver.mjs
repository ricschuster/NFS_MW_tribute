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

/**
 * How far right of the centreline the driver sits, in world units.
 *
 * Traffic keeps right by `TRAFFIC_LANE` capped at a quarter of the road's
 * width, which works out at 333 units on the narrowest two-lane street and 405
 * on anything wider. Sitting on the centreline - which is what this driver did
 * until #171 - straddles both lanes, so it meets oncoming traffic head on and
 * cannot be run with traffic at all.
 *
 * Traffic keeps right by `TRAFFIC_LANE` capped at a quarter of the road's
 * width, which is 333 units on the narrowest two-lane street and 405 on
 * anything wider. This is 330: the widest offset that is still inside the
 * narrowest street here, so the driver is never hung off the tarmac.
 *
 * Getting here took three measurements and two of them said the opposite of
 * what was expected, so they are worth writing down. Classifying every impact
 * on a traffic-on lap, the centreline driver met oncoming traffic head on in
 * only 10% of them - it rear-ended same-direction traffic in 47% and hit
 * buildings in 43%. So a lane on its own made things *worse*: it fixed the 10%
 * and tripled the building impacts. Only once the driver braked for the car in
 * front did head-ons become what they always looked like they should be - 59%
 * of what was left - and only once `cornerSpeed` knew about the offset did
 * holding it stop costing corners. All three are needed and none works alone.
 */
export const DRIVER_LANE = 330;

export function routeDriver(route, K, { lane = DRIVER_LANE } = {}) {
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
      // `<=`, not `<`, and the difference is a driver that finishes. At a
      // vertex the two segments share a point, so a car level with a corner
      // is exactly as far from the road it is leaving as from the one it is
      // joining. Keeping the first match points the driver back down the
      // street it has already driven; because that heading is also the
      // direction it is travelling, the cross-track term reads zero and
      // nothing ever corrects it. It drives in a straight line to the edge of
      // the map with the route reporting no error at all.
      if (gap <= bestGap) {
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

  /**
   * The fastest the car can hold a bend of this radius.
   *
   * `sqrt(grip * radius)` is the sim's own limit, and taking it literally is
   * why this driver arrived at every right-angle junction sideways: the limit
   * assumes an optimal line, and this follows the centreline. A right-angle
   * turn taken at the limit sweeps a radius of roughly half the road's width,
   * which fits only if the car starts hard against the outside kerb and clips
   * the inside one. The margin is the difference between possible and
   * repeatable, and it is the single biggest lever on how often this driver
   * hits a building.
   */
  const CORNER_MARGIN = 0.65;
  /**
   * A driver holding a lane corners on a tighter radius than the centreline
   * one whenever the bend turns toward its side, and the route only knows the
   * centreline. Taking the worst case - the whole offset off the radius - is
   * what stops a lane-holding driver running wide into the outside of every
   * bend. Measured: at traffic's own offset it takes building impacts on a
   * traffic-on lap from 89 to 66, and the damage that goes with them.
   */
  const cornerSpeed = (radius) => {
    if (radius === Infinity) return Infinity;
    const effective = Math.max(radius * 0.25, radius - Math.abs(lane));
    return CORNER_MARGIN * Math.sqrt(K.LATERAL_GRIP * effective);
  };

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
      // Aim for the lane, not the line. `side` is positive on the far side of
      // the centreline from traffic (see `progress`), so keeping right is a
      // negative target and the error is measured against that rather than
      // against zero.
      const error = found.side - -lane;
      const correction = Math.atan2(CROSS_GAIN * -error, Math.max(1200, Math.abs(speed)));
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

/**
 * The fastest this car should be going for whatever is in front of it.
 *
 * Without this the driver has no idea traffic exists and simply drives into the
 * back of it: classifying impacts on a lap, 47% were rear-ending
 * same-direction traffic, far and away the largest single kind (#171). A player
 * lifts. This lifts.
 *
 * The cone is deliberately narrow and measured in world space rather than along
 * the route, for the same reason traffic finds the car in front that way: roads
 * are split at every junction, so the car ahead is usually on a different road
 * object, and a route-relative search misses it at exactly the moment it
 * matters.
 */
export function carAheadLimit(world, K) {
  const cars = world.traffic?.cars;
  if (!cars || cars.length === 0) return Infinity;

  // Look as far ahead as it would take to stop, plus a car's length of room.
  const reach = Math.max(20 * K.UNITS_PER_METRE, (world.speed * world.speed) / (2 * world.maxSpeed));
  const fx = Math.sin(world.heading);
  const fz = Math.cos(world.heading);

  let limit = Infinity;
  for (const car of cars) {
    const dx = car.x - world.x;
    const dz = car.z - world.z;
    const ahead = dx * fx + dz * fz;
    if (ahead <= 0 || ahead > reach) continue;
    // How far off our line it is. A car in the next lane is not in the way.
    const across = Math.abs(dx * fz - dz * fx);
    if (across > K.CAR_RADIUS * 2.2) continue;
    // Close the gap to a following distance, not to a touch.
    const room = ahead - K.TRAFFIC_GAP;
    if (room <= 0) return Math.min(limit, car.speed * 0.6);
    // Fastest we can be here and still match their speed by the time we
    // arrive: the same braking-window arithmetic the route target uses.
    limit = Math.min(limit, Math.sqrt(car.speed * car.speed + 2 * world.maxSpeed * room));
  }
  return limit;
}

export function driveRoute(world, route, K, { seconds = 240, none, hold = () => ({}), lane = DRIVER_LANE } = {}) {
  const driver = routeDriver(route, K, { lane });
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
  /** How long since the car last put any real distance of route behind it. */
  let still = 0;
  let lastCovered = 0;
  /** Which way the current three-point turn is winding. 0 when not stuck. */
  let escape = 0;
  let moved = false;
  let sinceHit = 1;

  const trace = process.env.TRACE === route.name;
  for (let t = 0; t < seconds && covered < driver.length; t += K.STEP) {
    const found = driver.progress(world.x, world.z, along);
    if (trace && Math.abs(t % 2) < K.STEP / 2) {
      console.log(
        `t=${t.toFixed(0)} lap=${((covered / driver.length) * 100).toFixed(0)}% x=${world.x.toFixed(0)} z=${world.z.toFixed(0)} spd=${world.speed.toFixed(0)} off=${(found.off / K.UNITS_PER_METRE).toFixed(1)}m hits=${crashes}`,
      );
    }
    let step = found.along - along;
    // Only forward motion counts, and only a plausible amount of it: a jump
    // across the loop is the search having been wrong, not distance covered.
    if (step < -driver.length / 2) step += driver.length;
    if (step > 0 && step < driver.length / 4) covered += step;
    along = found.along;
    // Measured against the lane the driver is holding, not the centreline,
    // or every run would report the lane offset as an error.
    offRoute = Math.max(offRoute, Math.abs(found.side + lane));

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
    // Stuck means "not getting anywhere", not "not moving". A car wedged nose
    // into a corner rocks back and forth at a few hundred units per second
    // for as long as you let it, which reads as moving to any speed test, and
    // it will do that until the clock runs out. Measure the thing that
    // actually matters: has any of the route gone by lately.
    if (covered > lastCovered + 400) {
      lastCovered = covered;
      still = 0;
    } else {
      still += K.STEP;
    }
    stuck = moved && still > 1.5 ? stuck + K.STEP : 0;
    if (stuck > 0.4) {
      // A three-point turn, with the steering *latched*.
      //
      // Deciding which way to turn from the current heading error on every
      // frame is what wedged this driver against a wall for three minutes at
      // a time: pinned nose-in, the error is close to a half turn, its sign
      // flips with every twitch, and the car rocks forward and back inside a
      // half-metre box until the clock runs out. Pick a direction once and
      // commit to it. Reversing swings the nose the other way, so the escape
      // steers opposite to where the car wants to end up pointing.
      if (escape === 0) escape = error > 0 ? -1 : 1;
      const backing = stuck < 1.6;
      const turn = backing ? escape : -escape;
      world.step(K.STEP, {
        ...none,
        down: backing,
        up: !backing,
        left: turn > 0,
        right: turn < 0,
        ...hold(world),
      });
      elapsed += K.STEP;
      if (stuck > 2.4) {
        stuck = 0;
        still = 0;
        escape = 0;
      }
      continue;
    }
    escape = 0;

    // The route says how fast the road allows; the car in front says how fast
    // the road is actually going. Whichever is lower wins.
    const target = Math.min(
      driver.target(along, world.speed, world.maxSpeed),
      carAheadLimit(world, K),
    );
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
