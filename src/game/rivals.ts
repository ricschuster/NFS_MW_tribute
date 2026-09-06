/**
 * The ladder of ten (#91).
 *
 * Ten, not fifteen, and unlocked by Rep rather than by a count of wins. That
 * second half is the important one: the ladder used to be a queue, where the
 * only thing that moved you along it was beating the person in front. Now
 * every pursuit survived, every cop wrecked and every roadblock gone through
 * moves you up it, and the race is the thing you spend the Rep on rather than
 * the only thing that earns it.
 *
 * Names and cars are original, per the project's non-goals.
 */
export interface Rival {
  /** 10 (the first challenge) down to 1 (the boss). */
  rank: number;
  name: string;
  car: string;
  /** Body colour for the rival's sprite. */
  color: string;
  /** 0..1; scales the rival's race speed. */
  difficulty: number;
  /**
   * Rep needed before they will take the call.
   *
   * The first is zero: a ladder whose bottom rung is locked is a game that
   * starts by refusing to start.
   */
  rep: number;
  /** How they drive, in a line. Shown when the challenge is offered. */
  character: string;
  /**
   * The `CarProfile` they drive, and the one you take off them (#66).
   *
   * `car` above is the label; this is the thing with numbers in it. Two fields
   * rather than one because the label is what a rival is *known* for and the
   * profile is what the car does, and the ladder screen wants the first.
   */
  carId: string;
}

export const RIVALS: Rival[] = [
  {
    rank: 10,
    name: 'Vex',
    car: 'Tuned Hatch',
    color: '#4b7bc9',
    difficulty: 0.15,
    rep: 0,
    character: 'Quick off the line and nowhere near quick enough after it.',
    carId: 'hatchling',
  },
  {
    rank: 9,
    name: 'Cinder',
    car: 'Hot Coupe',
    color: '#d8663a',
    difficulty: 0.24,
    rep: 2000,
    character: 'Brakes late, apologises never.',
    carId: 'emberline',
  },
  {
    rank: 8,
    name: 'Halo',
    car: 'Street GT',
    color: '#d8b23a',
    difficulty: 0.33,
    rep: 5000,
    character: 'Clean, tidy, and will not put a wheel wrong all night.',
    carId: 'corona',
  },
  {
    rank: 7,
    name: 'Nyx',
    car: 'Widebody',
    color: '#3ac9a0',
    difficulty: 0.42,
    rep: 9000,
    character: 'Drives the whole road, yours included.',
    carId: 'wideboy',
  },
  {
    rank: 6,
    name: 'Rook',
    car: 'Sport Sedan',
    color: '#c93a5a',
    difficulty: 0.51,
    rep: 14000,
    character: 'Patient. Sits on your bumper for a mile and then goes.',
    carId: 'castling',
  },
  {
    rank: 5,
    name: 'Blitz',
    car: 'Turbo Coupe',
    color: '#3a9ec9',
    difficulty: 0.6,
    rep: 20000,
    character: 'All boost, all the time, and it usually works.',
    carId: 'surge',
  },
  {
    rank: 4,
    name: 'Volt',
    car: 'Prototype',
    color: '#5ad86a',
    difficulty: 0.69,
    rep: 28000,
    character: 'Something unfinished with far too much power in it.',
    carId: 'arcline',
  },
  {
    rank: 3,
    name: 'Onyx',
    car: 'Blacked Coupe',
    color: '#6a6f7a',
    difficulty: 0.78,
    rep: 38000,
    character: 'No lights, no plates, no interest in talking about it.',
    carId: 'obsidian',
  },
  {
    rank: 2,
    name: 'Ghost',
    car: 'Phantom GT',
    color: '#dcdfe6',
    difficulty: 0.89,
    rep: 50000,
    character: 'Never seen twice on the same street. Never once caught.',
    carId: 'apparition',
  },
  {
    rank: 1,
    name: 'Reaper',
    car: 'Nightfall',
    color: '#e8462b',
    difficulty: 1.0,
    rep: 65000,
    character: 'Runs Kestrel Bay after dark, and has not been beaten in it.',
    carId: 'nightfall',
  },
];

/** The rival the player faces next, or null once the ladder is cleared. */
export const nextRival = (beaten: number): Rival | null => RIVALS[beaten] ?? null;

/** Will they take the call at this Rep total? */
export const unlocked = (rival: Rival | null, rep: number): boolean =>
  rival !== null && rep >= rival.rep;
