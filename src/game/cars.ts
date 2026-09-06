/**
 * The cars (#67).
 *
 * There is no dealership, no garage and no money. Every car in the game is
 * parked somewhere in Kestrel Bay; you find it, drive into it, and it is
 * yours. That removes a whole system rather than reshaping one, and it makes
 * exploring the city the way you get a better car.
 *
 * A car is a handling *profile* rather than a set of absolute numbers: every
 * figure is a multiplier on the reference car, which is the car the game has
 * always had. That is deliberate. The feel work in #14 and #46 was done
 * against those numbers, the police speeds are fractions of the player's top
 * speed, and the rival ladder is tuned against a reference driver - expressing
 * a hypercar as "1.14 times the top speed" keeps all three honest, where
 * expressing it as "13680 units per second" quietly detaches it from them.
 *
 * Names and shapes are original, per the project's non-goals.
 */
export interface CarProfile {
  /** Stable across saves: it is what a save file records. */
  id: string;
  name: string;
  /** What it is, in a line. Shown when you find it. */
  blurb: string;
  colour: string;
  /** Multipliers on the reference car. The starter is 1 on every axis. */
  topSpeed: number;
  accel: number;
  /** Scales the cornering grip, so a stickier car holds a bend faster. */
  grip: number;
  nitro: number;
  /** How big it is drawn against the reference car. */
  scale: number;
}

/**
 * The roster.
 *
 * Ordered roughly by how good they are, which is also the order they are
 * placed in the city: the further you have to go, the better the car. Nothing
 * here is strictly better than everything below it, though - the Ridgeback
 * will out-run a Kite in a straight line and lose it entirely in the bends,
 * and which of those you want depends on where you are being chased.
 */
export const CARS: CarProfile[] = [
  {
    id: 'kestrel',
    name: 'Kestrel',
    blurb: 'The one you started in. Nothing special, and it never lets you down.',
    colour: '#d8442f',
    topSpeed: 1,
    accel: 1,
    grip: 1,
    nitro: 1,
    scale: 1,
  },
  {
    id: 'kite',
    name: 'Kite',
    blurb: 'Barely there. Slow down the straights and untouchable in the corners.',
    colour: '#e0c23a',
    topSpeed: 0.92,
    accel: 1.08,
    grip: 1.22,
    nitro: 1,
    scale: 0.94,
  },
  {
    id: 'verso',
    name: 'Verso',
    blurb: 'A coupe that does everything a little better than the last thing you drove.',
    colour: '#3a8fd8',
    topSpeed: 1.04,
    accel: 1.06,
    grip: 1.04,
    nitro: 1.04,
    scale: 1,
  },
  {
    id: 'ridgeback',
    name: 'Ridgeback',
    blurb: 'All engine. Enormous down a boulevard, hopeless anywhere that turns.',
    colour: '#8a3ad8',
    topSpeed: 1.11,
    accel: 1.18,
    grip: 0.84,
    nitro: 1.12,
    scale: 1.1,
  },
  {
    id: 'sable',
    name: 'Sable',
    blurb: 'Heavy, quiet and quick. Shrugs off traffic that would stop anything else.',
    colour: '#5a6270',
    topSpeed: 1.06,
    accel: 0.96,
    grip: 1.1,
    nitro: 0.96,
    scale: 1.08,
  },
  {
    id: 'ardent',
    name: 'Ardent',
    blurb: 'A proper GT. Fast everywhere, and asks to be driven properly.',
    colour: '#3ac98a',
    topSpeed: 1.09,
    accel: 1.1,
    grip: 1.12,
    nitro: 1.06,
    scale: 1.02,
  },
  {
    id: 'halcyon',
    name: 'Halcyon',
    blurb: 'Mid-engined and completely unreasonable. Very hard to keep on the road.',
    colour: '#e8e2d2',
    topSpeed: 1.13,
    accel: 1.24,
    grip: 1.02,
    nitro: 1.14,
    scale: 0.98,
  },
  {
    id: 'nightjar',
    name: 'Nightjar',
    blurb: 'Nobody knows where it came from. Nothing in Kestrel Bay goes with it.',
    colour: '#1d2028',
    topSpeed: 1.17,
    accel: 1.22,
    grip: 1.18,
    nitro: 1.15,
    scale: 1.04,
  },
];

/** The car you start in, and the reference every profile is written against. */
export const STARTER_CAR = CARS[0];

export const carById = (id: string): CarProfile =>
  CARS.find((car) => car.id === id) ?? STARTER_CAR;
