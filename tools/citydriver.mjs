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
// At full skill it is a *reference* driver rather than a good one: it holds its
// lane exactly, looks the whole braking window ahead, and never once stops
// paying attention. What it has to be is consistent, so a change to the car
// shows up as a change in the number.
//
// `DRIVERS` below turns that into a range, because a floor nobody stands on is
// a poor thing to tune against. Skill under 1 adds the four things a person
// actually does wrong - drifts off the line, looks less far ahead, misjudges a
// corner, and occasionally is not paying attention - all seeded, so a fallible
// driver is still a repeatable one. Every term is exactly zero at skill 1, so
// the recorded baseline does not move.

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
 * A seeded PRNG, local to this file on purpose.
 *
 * The driver is handed `K` rather than importing the game, and the same rule
 * applies to randomness: a probe that reached into `city/rng.ts` would be a
 * probe that breaks when the generator's seeding changes. Seven lines is
 * cheaper than that coupling.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth wander in [-1, 1], sampled by *distance along the route* rather than
 * by time.
 *
 * That is the deliberate choice. Sampled by time, a driver is randomly bad
 * everywhere and two laps of the same route are incomparable. Sampled by
 * distance, a driver is consistently bad at the same corner, which is both what
 * a person is like and what makes a lap worth reading: an excursion that
 * repeats is a corner this driver cannot take, not a coin that came up tails.
 *
 * Three octaves, because one sine is a wobble with an obvious period and the
 * eye - and the crash count - both pick it out.
 */
function wanderField(seed, wavelength) {
  const rng = mulberry32(seed);
  const waves = [1, 2.3, 5.7].map((harmonic) => ({
    k: (Math.PI * 2 * harmonic) / wavelength,
    phase: rng() * Math.PI * 2,
    amp: 1 / harmonic,
  }));
  const norm = waves.reduce((sum, w) => sum + w.amp, 0);
  return (along) => waves.reduce((sum, w) => sum + w.amp * Math.sin(along * w.k + w.phase), 0) / norm;
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

/**
 * What a driver of a given skill gets wrong.
 *
 * `skill` is 1 for the reference driver and 0 for someone who has just picked
 * the game up. Every term below is exactly zero at 1, so the reference driver's
 * numbers - and therefore `docs/city-baseline.json` - do not move.
 *
 * The four things modelled are the four a person actually does: they do not
 * hold a line, they do not look as far ahead, they misjudge how fast a corner
 * can be taken, and every so often they are not paying attention.
 */
export function faults(skill) {
  const off = 1 - Math.max(0, Math.min(1, skill));
  // Two of these are square-rooted rather than linear, and the reason is that
  // being human is not a small amount of being bad. Reaction time is the clear
  // case: a linear ramp gives an expert 45 ms, which is not a number any person
  // has - a trained one is around 200 ms and the range from there to a novice is
  // narrow. The curve puts most of the fault in as soon as skill leaves 1, which
  // is also what makes `perfect` read as the control it is rather than as one
  // more driver. Line-holding behaves the same way: nobody holds one exactly.
  const human = Math.sqrt(off);
  return {
    /** How far the held line drifts either side of the lane, in world units. */
    wander: human * 1.7 * 135,
    /** How much of the reference lookahead they use. Less means later braking. */
    lookahead: 1 - off * 0.55,
    /** How much they misjudge a corner's limit, either way. */
    misjudge: off * 0.26,
    /** Seconds between perceiving and doing. */
    reaction: human * 0.42,
    /** Roughly how often attention goes, in seconds. Infinity at full skill. */
    lapseEvery: off === 0 ? Infinity : 22 / off,
    /** How long one lasts. */
    lapseFor: 0.55 + off * 0.5,
  };
}

/**
 * The drivers worth measuring against.
 *
 * A single reference driver is a floor nobody stands on. These are four points
 * on the way up to it, and the top one is deliberately labelled as unreachable:
 * `perfect` has no reaction time, never wanders off its line, never misjudges a
 * corner and never stops paying attention, which is not a hard driver to beat
 * so much as not a driver at all. It is the control, and it is what
 * `docs/city-baseline.json` records.
 *
 * The three below it are where people actually are. Read `expert` as somebody
 * who knows this city and this car, `advanced` as somebody comfortable in both,
 * and `beginner` as the first half hour. The numbers between them are a guess
 * calibrated on one thing only - that the gaps should be legible in a lap time -
 * and they are worth revisiting whenever somebody plays for long enough to say
 * which one they recognise.
 */
export const DRIVERS = [
  { name: 'beginner', skill: 0.45 },
  { name: 'advanced', skill: 0.6 },
  { name: 'expert', skill: 0.82 },
  { name: 'perfect', skill: 1 },
];

export const driverNamed = (name) => DRIVERS.find((d) => d.name === name.toLowerCase());

export function routeDriver(route, K, { lane = DRIVER_LANE, skill = 1, seed = 1 } = {}) {
  const fault = faults(skill);
  const wanderAt = fault.wander === 0 ? () => 0 : wanderField(seed, 4200);
  const misjudge = fault.misjudge === 0 ? () => 0 : wanderField(seed ^ 0x9e37, 9500);
  /**
   * Seconds of concentration left after a scrape.
   *
   * Sampling the wander by distance is what makes a driver consistently bad at
   * one corner rather than randomly bad everywhere, and that is the right
   * model right up until it becomes a trap: a spot that puts the car into a
   * wall does it again on the recovery, and again, and the lap never ends. A
   * beginner on the Harbour Loop ground out 233 impacts per kilometre that way
   * and finished nothing.
   *
   * What a person does after scraping a wall is pay attention for a moment, so
   * that is what this is. It breaks the loop without giving up the property
   * that makes the model worth having.
   */
  let focus = 0;
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
  const cornerSpeed = (radius, at = 0) => {
    if (radius === Infinity) return Infinity;
    const effective = Math.max(radius * 0.25, radius - Math.abs(lane));
    // A misjudged corner is entered too fast or too slow, and the too-fast half
    // is the half that costs: it is what running wide into the outside of a
    // bend looks like from the inside of the car.
    const judged = CORNER_MARGIN * (1 + fault.misjudge * misjudge(at));
    return judged * Math.sqrt(K.LATERAL_GRIP * effective);
  };

  return {
    length,
    at,
    progress,
    /** Concentrate: hold the line exactly for a moment. Called after a scrape. */
    concentrate(seconds) {
      focus = Math.max(focus, seconds);
    },
    tick(dt) {
      if (focus > 0) focus -= dt;
    },
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
      // A less practised driver simply does not look as far up the road, which
      // is most of why they brake late rather than early.
      const window = 40000 * fault.lookahead;
      for (let ahead = 0; ahead < window; ahead += 1200) {
        const corner = cornerSpeed(radiusAt(along + ahead), along + ahead);
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
      // Clamped to the carriageway. Traffic caps its own offset at a quarter of
      // the road's width for the same reason, and without it the wander adds to
      // the lane and puts the held line over the kerb - which is a driver that
      // aims at the pavement rather than one that drives untidily, and it is
      // most of why the beginner tier read as a pinball rather than a person.
      const drift = focus > 0 ? 0 : fault.wander * wanderAt(found.along);
      const held = Math.max(0, Math.min(lane * 1.35, lane + drift));
      const error = found.side - -held;
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

export function driveRoute(
  world,
  route,
  K,
  { seconds = 240, none, hold = () => ({}), lane = DRIVER_LANE, skill = 1, seed = 1 } = {},
) {
  const driver = routeDriver(route, K, { lane, skill, seed });
  const fault = faults(skill);
  const lag = Math.round(fault.reaction / K.STEP);
  /** Inputs waiting to happen, so a decision takes a human moment to arrive. */
  const pending = [];
  const lapseRng = mulberry32(seed ^ 0x51ed);
  let lapseLeft = 0;
  let nextLapse = fault.lapseEvery === Infinity ? Infinity : fault.lapseEvery * lapseRng();
  let lastInput = null;

  /**
   * Put an input through the driver's hands rather than straight into the car.
   *
   * Two things happen here and they are different.
   *
   * **Lag** delays the *steering* by a reaction time, and deliberately not the
   * throttle. A person does not brake for a corner by reacting to it; they
   * brake at a point they picked while they were still approaching, which is
   * anticipation and has no reaction time in it. Correcting a drift is the
   * other thing, and that is pure reaction. Lagging both was worth measuring
   * and was badly wrong: it turned the expert into a driver who crashed 358
   * times over six routes, because every planned lift arrived a car's length
   * late as well.
   *
   * A **lapse** freezes the last input entirely for most of a second: attention
   * goes, and what a person does then is not something random, it is *nothing*
   * - they hold whatever they were already doing. On a straight that costs
   * nothing, which is why a lapse is sampled by the clock and allowed to land
   * wherever it lands.
   */
  const throughHands = (want, dt) => {
    if (fault.lapseEvery !== Infinity) {
      nextLapse -= dt;
      if (lapseLeft > 0) lapseLeft -= dt;
      else if (nextLapse <= 0) {
        lapseLeft = fault.lapseFor;
        nextLapse = fault.lapseEvery * (0.5 + lapseRng());
      }
    }
    if (lapseLeft > 0 && lastInput) return lastInput;
    lastInput = want;
    if (lag === 0) return want;
    pending.push({ left: want.left, right: want.right });
    const hands = pending.length > lag ? pending.shift() : { left: false, right: false };
    // Throttle and brake are planned, so they go through now; the wheel is a
    // reaction, so it goes through late.
    return { ...want, left: hands.left, right: hands.right };
  };
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
      // Unwedging is deliberately *not* put through the driver's hands: a
      // three-point turn is the probe rescuing itself, not the driver driving,
      // and lagging it means a car that never gets out of the corner it is in.
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
    const intent = {
      ...none,
      left: error > 0.02,
      right: error < -0.02,
      up: world.speed < target * 0.98,
      down: world.speed > target * 1.08,
    };
    world.step(K.STEP, { ...throughHands(intent, K.STEP), ...hold(world) });
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
