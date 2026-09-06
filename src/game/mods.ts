/**
 * Mods (#68).
 *
 * Not bought. There is no shop and no money in this game: a part is earned by
 * finishing first or second in an event in the car you want it for, which
 * makes tuning a thing you drive for rather than a thing you shop for.
 *
 * The set is small on purpose. Five slots of two would be ten decisions nobody
 * can hold in their head at two hundred kilometres an hour; four slots of two
 * is a choice you can make from the Quick Wheel without stopping.
 *
 * Every mod is a *trade*, which is the difference between tuning and a stat
 * boost. Long gears buy top speed with acceleration; a splitter buys grip with
 * top speed. Only the tyres are close to free, and what they cost is the grip
 * of the ones that are not made to survive a spike strip.
 */
export type ModSlot = 'engine' | 'tyres' | 'gearing' | 'aero';

export interface Mod {
  id: string;
  name: string;
  slot: ModSlot;
  /** What it does, in a line short enough for the wheel. */
  detail: string;
  /** Multipliers over the car's own profile. Absent means unchanged. */
  topSpeed?: number;
  accel?: number;
  grip?: number;
  nitro?: number;
  /**
   * Tyres that come back up (#60). A spike strip costs you a moment instead of
   * the rest of the pursuit, which is the one mod that argues with the police
   * rather than with the stopwatch.
   */
  reinflating?: boolean;
}

/**
 * The catalogue, in the order it is unlocked.
 *
 * Ordered so the first part a car earns is a plain improvement and the trades
 * come later: the fourth event in a car is a better time to be asked whether
 * you would rather have top speed or acceleration than the first.
 */
export const MODS: Mod[] = [
  {
    id: 'block',
    name: 'Tuned Block',
    slot: 'engine',
    detail: 'ACC +8%',
    accel: 1.08,
  },
  {
    id: 'track-tyres',
    name: 'Track Tyres',
    slot: 'tyres',
    detail: 'GRP +12%',
    grip: 1.12,
  },
  {
    id: 'short-gears',
    name: 'Short Gears',
    slot: 'gearing',
    detail: 'ACC +14%, SPD -4%',
    accel: 1.14,
    topSpeed: 0.96,
  },
  {
    id: 'splitter',
    name: 'Splitter',
    slot: 'aero',
    detail: 'GRP +8%, SPD -2%',
    grip: 1.08,
    topSpeed: 0.98,
  },
  {
    id: 'turbo',
    name: 'Big Turbo',
    slot: 'engine',
    detail: 'SPD +5%, NOS +8%, ACC -2%',
    topSpeed: 1.05,
    nitro: 1.08,
    // It has to spool. Two gains and no cost is an upgrade with a menu in
    // front of it rather than a decision about what kind of car you want.
    accel: 0.98,
  },
  {
    id: 'reinflatables',
    name: 'Reinflatables',
    slot: 'tyres',
    detail: 'GRP +2%, shrugs off spikes',
    grip: 1.02,
    reinflating: true,
  },
  {
    id: 'long-gears',
    name: 'Long Gears',
    slot: 'gearing',
    detail: 'SPD +7%, ACC -10%',
    topSpeed: 1.07,
    accel: 0.9,
  },
  {
    id: 'low-drag',
    name: 'Low Drag',
    slot: 'aero',
    detail: 'SPD +5%, GRP -3%',
    topSpeed: 1.05,
    grip: 0.97,
  },
];

export const modById = (id: string): Mod | undefined => MODS.find((mod) => mod.id === id);

/** What a set of fitted mods does to a car, as one multiplier per axis. */
export interface ModEffect {
  topSpeed: number;
  accel: number;
  grip: number;
  nitro: number;
  reinflating: boolean;
}

export function effectOf(fitted: Iterable<string>): ModEffect {
  const effect: ModEffect = {
    topSpeed: 1,
    accel: 1,
    grip: 1,
    nitro: 1,
    reinflating: false,
  };
  for (const id of fitted) {
    const mod = modById(id);
    if (!mod) continue;
    effect.topSpeed *= mod.topSpeed ?? 1;
    effect.accel *= mod.accel ?? 1;
    effect.grip *= mod.grip ?? 1;
    effect.nitro *= mod.nitro ?? 1;
    effect.reinflating = effect.reinflating || mod.reinflating === true;
  }
  return effect;
}
