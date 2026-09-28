import { CARS, STARTER_CAR } from './cars';

/**
 * One-off bonuses popped up while driving (#353).
 *
 * The 2012 game's, not the 2005 game's: nothing here is a career or a menu,
 * each is a line in the Rep feed the first time something happens - the first
 * speed camera, the tenth, a car driven for the first time - and never again.
 * Which have been reached is saved, so "never again" survives a reload.
 *
 * A table because it is content, like the Rep award table: which moments are
 * worth marking and what each pays is a design decision, and it should be
 * editable without reading any code. Amounts sit around a billboard's worth
 * for a first and a good pursuit's for the long ones, so none of them is a
 * reason to grind and all of them are a nice surprise.
 */

/** What the milestones are judged against, read off the world. */
export interface MilestoneStats {
  cameras: number;
  billboards: number;
  gates: number;
  escapes: number;
  beaten: number;
  /** Ids of every car that has been driven. */
  driven: ReadonlySet<string>;
}

export interface Milestone {
  /** Stable: it is what a save records. */
  id: string;
  label: string;
  rep: number;
  reached: (stats: MilestoneStats) => boolean;
}

const count = (id: string, label: string, rep: number, of: keyof Omit<MilestoneStats, 'driven'>, n: number): Milestone => ({
  id,
  label,
  rep,
  reached: (stats) => stats[of] >= n,
});

export const MILESTONES: Milestone[] = [
  count('camera-1', 'FIRST SPEED CAMERA', 250, 'cameras', 1),
  count('camera-10', '10 SPEED CAMERAS', 1000, 'cameras', 10),
  count('camera-25', '25 SPEED CAMERAS', 2500, 'cameras', 25),
  count('billboard-1', 'FIRST BILLBOARD', 250, 'billboards', 1),
  count('billboard-25', '25 BILLBOARDS', 1500, 'billboards', 25),
  count('billboard-50', '50 BILLBOARDS', 3000, 'billboards', 50),
  count('gate-1', 'FIRST GATE', 250, 'gates', 1),
  count('gate-10', '10 GATES', 1000, 'gates', 10),
  count('escape-1', 'FIRST ESCAPE', 1000, 'escapes', 1),
  count('claim-1', 'FIRST RIVAL CLAIMED', 2000, 'beaten', 1),
  // Every car but the one you start in, the first time you are behind the
  // wheel of it: the reference's "Porsche 911 Driven".
  ...CARS.filter((car) => car.id !== STARTER_CAR.id).map((car) => ({
    id: `drove-${car.id}`,
    label: `${car.name.toUpperCase()} DRIVEN`,
    rep: 500,
    reached: (stats: MilestoneStats) => stats.driven.has(car.id),
  })),
];

/** The milestones these stats reach that are not in `done` yet, in table order. */
export function newlyReached(stats: MilestoneStats, done: ReadonlySet<string>): Milestone[] {
  return MILESTONES.filter((m) => !done.has(m.id) && m.reached(stats));
}
