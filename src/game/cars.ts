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
 * Where a car comes from matters as much as what it is (#66). The starter is
 * the one you begin in; thirty-three are parked around the city; the other ten belong
 * to the ladder and are only ever taken off the rival who was driving one.
 *
 * Names and shapes are original, per the project's non-goals.
 */
/** The body styles a car can be drawn with (#434). */
export type CarBody = 'coupe' | 'hatch' | 'saloon' | 'roadster' | 'frame' | 'wedge' | 'suv' | 'pickup';

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
  /**
   * The shape it is drawn with (#434): what class of car it stands in for, so
   * a pickup reads as a pickup and a featherweight as a frame with wheels on.
   * Drawing only; nothing in the sim reads it.
   */
  body: CarBody;
  /**
   * How you get it: the one you start in, one parked in the city (#67), or one
   * taken off a ladder rival (#66).
   */
  source: 'start' | 'street' | 'rival';
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
  // Every profile is its real counterpart's published figures turned into
  // multipliers on the reference car by one rule (docs/research/car-roster.md,
  // #434). Nothing here names the car it stands in for.
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
    body: 'coupe',
    source: 'start',
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    blurb: 'Heavier than two of anything else, slower than all of them, and nothing stops it.',
    colour: '#5a6a3a',
    topSpeed: 0.82,
    accel: 0.72,
    grip: 0.84,
    nitro: 0.88,
    scale: 1.14,
    body: 'suv',
    source: 'street',
  },
  {
    id: 'bighorn',
    name: 'Bighorn',
    blurb: 'A pickup on long-travel springs. Does not care where the road went.',
    colour: '#8a6a3a',
    topSpeed: 0.84,
    accel: 0.83,
    grip: 0.84,
    nitro: 0.88,
    scale: 1.22,
    body: 'pickup',
    source: 'street',
  },
  {
    id: 'crossing',
    name: 'Crossing',
    blurb: 'A school-run crossover that found its way here. Honest, slow and hard to hurt.',
    colour: '#b8b0a0',
    topSpeed: 0.86,
    accel: 0.77,
    grip: 0.88,
    nitro: 0.88,
    scale: 1.14,
    body: 'suv',
    source: 'street',
  },
  {
    id: 'trailbreaker',
    name: 'Trailbreaker',
    blurb: 'A family 4x4 with a racing engine in it. Nobody told the family.',
    colour: '#7a7a7a',
    topSpeed: 0.92,
    accel: 0.95,
    grip: 0.84,
    nitro: 0.9,
    scale: 1.14,
    body: 'suv',
    source: 'street',
  },
  {
    id: 'sideways',
    name: 'Sideways',
    blurb: 'From when rallies were won on gravel by cars you could buy. Still wants to go sideways.',
    colour: '#b02a2a',
    topSpeed: 0.86,
    accel: 0.89,
    grip: 1.06,
    nitro: 0.88,
    scale: 0.95,
    body: 'hatch',
    source: 'street',
  },
  {
    id: 'sparrow',
    name: 'Sparrow',
    blurb: 'Quick for what it is, which is a family car. The easiest thing in the city to drive fast.',
    colour: '#e06a1a',
    topSpeed: 0.91,
    accel: 0.86,
    grip: 1.02,
    nitro: 0.88,
    scale: 0.95,
    body: 'hatch',
    source: 'street',
  },
  {
    id: 'verso',
    name: 'Verso',
    blurb: 'A coupe that does everything a little better than the last thing you drove.',
    colour: '#3a8fd8',
    topSpeed: 0.91,
    accel: 0.99,
    grip: 0.94,
    nitro: 0.97,
    scale: 1.05,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'outrider',
    name: 'Outrider',
    blurb: 'A pony car with the edges sharpened. Happier on a track than on a boulevard.',
    colour: '#e8d8a0',
    topSpeed: 0.91,
    accel: 1.0,
    grip: 0.94,
    nitro: 0.98,
    scale: 1.05,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'backfire',
    name: 'Backfire',
    blurb: 'All the power arrives at once, and it arrives late. Respect the lift-off.',
    colour: '#d8c060',
    topSpeed: 0.91,
    accel: 0.9,
    grip: 1.06,
    nitro: 0.92,
    scale: 1.0,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'current',
    name: 'Current',
    blurb: 'Silent, instant and short of breath at the top. Nothing is quicker to the first corner.',
    colour: '#d02040',
    topSpeed: 0.83,
    accel: 1.07,
    grip: 1.06,
    nitro: 0.95,
    scale: 1.0,
    body: 'roadster',
    source: 'street',
  },
  {
    id: 'shade',
    name: 'Shade',
    blurb: 'A hot hatch that kept going. All the power goes to the front and most of it arrives.',
    colour: '#3a3d42',
    topSpeed: 0.94,
    accel: 0.9,
    grip: 1.02,
    nitro: 0.94,
    scale: 0.95,
    body: 'hatch',
    source: 'street',
  },
  {
    id: 'switchback',
    name: 'Switchback',
    blurb: 'All four wheels and a computer arguing about which way you meant. Loves a bend.',
    colour: '#e8e8ea',
    topSpeed: 0.9,
    accel: 0.95,
    grip: 1.06,
    nitro: 0.88,
    scale: 0.95,
    body: 'saloon',
    source: 'street',
  },
  {
    id: 'velvet',
    name: 'Velvet',
    blurb: 'A long bonnet, a quiet cabin and a supercharger. Gentlemanly until it is not.',
    colour: '#2a3a5a',
    topSpeed: 0.91,
    accel: 0.97,
    grip: 1.06,
    nitro: 1.04,
    scale: 1.0,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'ridgeback',
    name: 'Ridgeback',
    blurb: 'All engine. Enormous down a boulevard, hopeless anywhere that turns.',
    colour: '#8a3ad8',
    topSpeed: 0.98,
    accel: 0.98,
    grip: 0.94,
    nitro: 0.96,
    scale: 1.05,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'aria',
    name: 'Aria',
    blurb: 'An Italian GT with the comfort taken out and the noise left in.',
    colour: '#d8d4c8',
    topSpeed: 0.99,
    accel: 0.99,
    grip: 0.98,
    nitro: 0.98,
    scale: 1.06,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'bluehour',
    name: 'Blue Hour',
    blurb: "A rally-bred saloon with a tuner's hand on it. Grips where nothing else does.",
    colour: '#2a4aa8',
    topSpeed: 0.91,
    accel: 1.07,
    grip: 1.06,
    nitro: 0.97,
    scale: 0.95,
    body: 'saloon',
    source: 'street',
  },
  {
    id: 'brawler',
    name: 'Brawler',
    blurb: 'Supercharged, heavy and loud. Goes through a corner the way it goes through everything else.',
    colour: '#3a7a3a',
    topSpeed: 0.99,
    accel: 1.05,
    grip: 0.94,
    nitro: 1.03,
    scale: 1.05,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'pipit',
    name: 'Pipit',
    blurb: 'A shopping hatch with six times the engine it was built for, and all four wheels pulling.',
    colour: '#e8e4dc',
    topSpeed: 0.91,
    accel: 1.1,
    grip: 1.06,
    nitro: 1.09,
    scale: 0.95,
    body: 'hatch',
    source: 'street',
  },
  {
    id: 'halcyon',
    name: 'Halcyon',
    blurb: 'Mid-engined and completely unreasonable. Very hard to keep on the road.',
    colour: '#e8e2d2',
    topSpeed: 0.99,
    accel: 0.95,
    grip: 1.06,
    nitro: 1.02,
    scale: 1.0,
    body: 'wedge',
    source: 'street',
  },
  {
    id: 'sable',
    name: 'Sable',
    blurb: 'Heavy, quiet and quick. Shrugs off traffic that would stop anything else.',
    colour: '#5a6270',
    topSpeed: 1.03,
    accel: 1.06,
    grip: 0.98,
    nitro: 0.98,
    scale: 1.06,
    body: 'roadster',
    source: 'street',
  },
  {
    id: 'ardent',
    name: 'Ardent',
    blurb: 'A proper GT. Fast everywhere, and asks to be driven properly.',
    colour: '#3ac98a',
    topSpeed: 1.0,
    accel: 1.04,
    grip: 1.06,
    nitro: 1.03,
    scale: 1.0,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'upswing',
    name: 'Upswing',
    blurb: 'Doors that open to the sky and a nose that goes on for a week.',
    colour: '#c02a2a',
    topSpeed: 1.02,
    accel: 1.09,
    grip: 0.98,
    nitro: 1.08,
    scale: 1.06,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'longhaul',
    name: 'Longhaul',
    blurb: 'Four doors, four seats and faster than most two-seaters in the city.',
    colour: '#4a4a50',
    topSpeed: 1.0,
    accel: 1.09,
    grip: 1.02,
    nitro: 0.99,
    scale: 1.06,
    body: 'saloon',
    source: 'street',
  },
  {
    id: 'fang',
    name: 'Fang',
    blurb: 'A long nose, a huge engine and no interest in helping you.',
    colour: '#1a4ab8',
    topSpeed: 1.04,
    accel: 1.12,
    grip: 0.94,
    nitro: 1.16,
    scale: 1.05,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'nightjar',
    name: 'Nightjar',
    blurb: 'Nobody knows where it came from. Nothing in Kestrel Bay goes with it.',
    colour: '#1d2028',
    topSpeed: 1.01,
    accel: 1.09,
    grip: 1.06,
    nitro: 1.12,
    scale: 1.0,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'solstice',
    name: 'Solstice',
    blurb: 'Open-topped and mid-engined. Grips like a coupe, sounds like it is trying to get out of one.',
    colour: '#9aa3ab',
    topSpeed: 1.02,
    accel: 1.09,
    grip: 1.1,
    nitro: 1.07,
    scale: 1.0,
    body: 'roadster',
    source: 'street',
  },
  {
    id: 'tempest',
    name: 'Tempest',
    blurb: 'Roofless, light and wide. Every tunnel in the bay is a reason to take it.',
    colour: '#f0a020',
    topSpeed: 1.03,
    accel: 1.07,
    grip: 1.1,
    nitro: 1.12,
    scale: 1.0,
    body: 'roadster',
    source: 'street',
  },
  {
    id: 'harrier',
    name: 'Harrier',
    blurb: 'The fastest thing on the street for years. Still does not believe anybody has caught up.',
    colour: '#2f5fd0',
    topSpeed: 1.04,
    accel: 1.12,
    grip: 1.15,
    nitro: 1.17,
    scale: 1.02,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'enduro',
    name: 'Enduro',
    blurb: 'Built to win somewhere a long time ago, and never told it could stop.',
    colour: '#3a6ad8',
    topSpeed: 1.04,
    accel: 1.13,
    grip: 1.15,
    nitro: 1.1,
    scale: 1.02,
    body: 'wedge',
    source: 'street',
  },
  {
    id: 'monolith',
    name: 'Monolith',
    blurb: 'Heavy, clever and relentless. Makes everyone in it look better than they are.',
    colour: '#1c1c20',
    topSpeed: 1.02,
    accel: 1.22,
    grip: 1.1,
    nitro: 1.02,
    scale: 1.0,
    body: 'coupe',
    source: 'street',
  },
  {
    id: 'kite',
    name: 'Kite',
    blurb: 'Barely there. Slow down the straights and untouchable in the corners.',
    colour: '#e0c23a',
    topSpeed: 0.9,
    accel: 1.25,
    grip: 1.35,
    nitro: 1.25,
    scale: 0.88,
    body: 'frame',
    source: 'street',
  },
  {
    id: 'singleton',
    name: 'Singleton',
    blurb: 'One seat, no roof, no apology. Built for a track that Kestrel Bay does not have.',
    colour: '#e8b020',
    topSpeed: 0.95,
    accel: 1.25,
    grip: 1.35,
    nitro: 1.25,
    scale: 0.88,
    body: 'frame',
    source: 'street',
  },
  {
    id: 'wisp',
    name: 'Wisp',
    blurb: 'A frame, an engine and a seat. Nothing else to slow it down, and nothing between you and the road.',
    colour: '#c8e04a',
    topSpeed: 0.95,
    accel: 1.4,
    grip: 1.35,
    nitro: 1.25,
    scale: 0.88,
    body: 'frame',
    source: 'street',
  },

  /* ---------------------------------------------------------------- */
  /* The ladder's cars (#66). One each, and the only way to get one is  */
  /* to beat the rival driving it and then wreck it. They run from      */
  /* better-than-anything-on-the-street to the best thing in the game.  */
  /* ---------------------------------------------------------------- */
  {
    id: 'hatchling',
    name: 'Hatchling',
    blurb: "Vex's. Barely a tonne, every bolt changed, and it still feels like it could fold up.",
    colour: '#4b7bc9',
    topSpeed: 0.92,
    accel: 1.0,
    grip: 1.11,
    nitro: 0.96,
    scale: 1.0,
    body: 'coupe',
    source: 'rival',
  },
  {
    id: 'emberline',
    name: 'Emberline',
    blurb: "Cinder's. Runs hot, sounds worse, and will not let go of a corner.",
    colour: '#d8663a',
    topSpeed: 0.99,
    accel: 1.02,
    grip: 0.99,
    nitro: 1.2,
    scale: 1.05,
    body: 'roadster',
    source: 'rival',
  },
  {
    id: 'corona',
    name: 'Corona',
    blurb: "Halo's. Set up by somebody who never makes a mistake in it.",
    colour: '#d8b23a',
    topSpeed: 1.03,
    accel: 1.09,
    grip: 0.94,
    nitro: 1.09,
    scale: 1.05,
    body: 'coupe',
    source: 'rival',
  },
  {
    id: 'wideboy',
    name: 'Wideboy',
    blurb: "Nyx's. Takes up the whole road, and knows it.",
    colour: '#3ac9a0',
    topSpeed: 1.04,
    accel: 1.1,
    grip: 1.15,
    nitro: 1.08,
    scale: 1.02,
    body: 'coupe',
    source: 'rival',
  },
  {
    id: 'castling',
    name: 'Castling',
    blurb: "Rook's. Patient, heavy, and quicker than it has any right to be.",
    colour: '#c93a5a',
    topSpeed: 1.05,
    accel: 1.2,
    grip: 1.15,
    nitro: 1.16,
    scale: 1.02,
    body: 'wedge',
    source: 'rival',
  },
  {
    id: 'surge',
    name: 'Surge',
    blurb: "Blitz's. An engine and two motors between them, and no plan for what happens after.",
    colour: '#3a9ec9',
    topSpeed: 1.07,
    accel: 1.32,
    grip: 1.19,
    nitro: 1.25,
    scale: 1.02,
    body: 'roadster',
    source: 'rival',
  },
  {
    id: 'arcline',
    name: 'Arcline',
    blurb: "Volt's. Whatever it is, it was not finished before it was driven.",
    colour: '#5ad86a',
    topSpeed: 1.08,
    accel: 1.25,
    grip: 1.19,
    nitro: 1.19,
    scale: 1.02,
    body: 'wedge',
    source: 'rival',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    blurb: "Onyx's. Black on black, and nothing written on it anywhere.",
    colour: '#3a3f46',
    topSpeed: 1.21,
    accel: 1.34,
    grip: 1.19,
    nitro: 1.25,
    scale: 1.02,
    body: 'wedge',
    source: 'rival',
  },
  {
    id: 'apparition',
    name: 'Apparition',
    blurb: "Ghost's. You will have seen it before. You will not have caught it.",
    colour: '#dcdfe6',
    topSpeed: 1.13,
    accel: 1.27,
    grip: 1.15,
    nitro: 1.25,
    scale: 1.02,
    body: 'wedge',
    source: 'rival',
  },
  {
    id: 'nightfall',
    name: 'Nightfall',
    blurb: "Reaper's. The best thing in Kestrel Bay, and now it is parked outside.",
    colour: '#e8462b',
    topSpeed: 1.22,
    accel: 1.27,
    grip: 1.15,
    nitro: 1.25,
    scale: 1.02,
    body: 'wedge',
    source: 'rival',
  },
];

/** The car you start in, and the reference every profile is written against. */
export const STARTER_CAR = CARS[0];

export const carById = (id: string): CarProfile =>
  CARS.find((car) => car.id === id) ?? STARTER_CAR;

/**
 * What a colour is called over the radio (#339).
 *
 * Dispatch describes a car the way a witness would, and a witness does not
 * say `#3a8fd8`. The nearest of a dozen plain names, by distance in RGB, which
 * is crude and is enough: the palette above is a handful of saturated colours
 * a long way apart, and a name only has to be the one a person would pick.
 */
const COLOUR_NAMES: [string, number, number, number][] = [
  ['red', 205, 50, 45],
  ['orange', 225, 110, 50],
  ['yellow', 225, 195, 55],
  ['green', 60, 200, 130],
  ['blue', 60, 130, 210],
  ['purple', 140, 60, 210],
  ['pink', 205, 60, 100],
  ['white', 232, 228, 215],
  ['silver', 150, 155, 165],
  ['grey', 90, 98, 112],
  ['black', 29, 32, 40],
];

export function colourName(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = COLOUR_NAMES[0];
  let gap = Infinity;
  for (const named of COLOUR_NAMES) {
    const d = (named[1] - r) ** 2 + (named[2] - g) ** 2 + (named[3] - b) ** 2;
    if (d < gap) {
      gap = d;
      best = named;
    }
  }
  return best[0];
}
