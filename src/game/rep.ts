import {
  REP_TAKEDOWN,
  REP_ROADBLOCK,
  REP_WRECK,
  REP_NEAR_MISS,
  REP_ESCAPE,
  REP_RACE_WIN,
  REP_RACE_LOSS,
  REP_BILLBOARD,
  REP_CAMERA,
  REP_STREET_FIND,
  REP_AMBUSH,
  REP_CLAIM,
  REP_HEAT_BONUS,
  REP_POPUP_TIME,
  REP_POPUPS,
} from './constants';

/**
 * Rep, the single progression currency (#64).
 *
 * Earned from everything rather than from winning races, which is the whole
 * point of it: in a free-roam game the time between events *is* most of the
 * game, and a currency that only pays for events makes driving around worth
 * nothing.
 *
 * Kept as its own module rather than as three fields on `CityWorld` for two
 * reasons. The award table is a design document as much as it is code - it is
 * the answer to "is a takedown worth more than getting away?" - and it is
 * about to be paid into from three more places (races, collectibles, rivals)
 * that have no business reaching into the car's physics.
 *
 * Nothing in here knows about the renderer, storage or the pursuit. It is told
 * what happened and what the heat was; it decides what that is worth.
 */

/** What an award was for. Each one has a fixed value and a fixed label. */
export type RepReason =
  | 'takedown'
  | 'roadblock'
  | 'wreck'
  | 'nearMiss'
  | 'pursuit'
  | 'escape'
  | 'raceWin'
  | 'raceLoss'
  | 'billboard'
  | 'camera'
  | 'streetFind'
  | 'ambush'
  | 'claim';

interface RepKind {
  /** Base value, before the heat multiplier. */
  value: number;
  /** What the popup says. */
  label: string;
}

const KINDS: Record<RepReason, RepKind> = {
  takedown: { value: REP_TAKEDOWN, label: 'TAKEDOWN' },
  roadblock: { value: REP_ROADBLOCK, label: 'ROADBLOCK' },
  wreck: { value: REP_WRECK, label: 'WRECKAGE' },
  nearMiss: { value: REP_NEAR_MISS, label: 'NEAR MISS' },
  pursuit: { value: 0, label: 'EVADING' }, // valued by the caller, per second
  escape: { value: REP_ESCAPE, label: 'ESCAPED' },
  raceWin: { value: REP_RACE_WIN, label: 'RACE WON' },
  raceLoss: { value: REP_RACE_LOSS, label: 'RACE FINISHED' },
  billboard: { value: REP_BILLBOARD, label: 'BILLBOARD' },
  camera: { value: REP_CAMERA, label: 'SPEED CAMERA' },
  streetFind: { value: REP_STREET_FIND, label: 'STREET FIND' },
  ambush: { value: REP_AMBUSH, label: 'AMBUSH SURVIVED' },
  claim: { value: REP_CLAIM, label: 'CAR CLAIMED' },
};

/** One award, still worth showing. */
export interface Award {
  reason: RepReason;
  label: string;
  amount: number;
  /** Seconds since it was earned. Dropped past `REP_POPUP_TIME`. */
  age: number;
}

export class RepLedger {
  total = 0;
  /** Awards still on screen, oldest first. */
  readonly recent: Award[] = [];
  /** Set on any step that paid out, so a caller can decide to persist. */
  earnedThisStep = 0;

  /**
   * Pay for something.
   *
   * `level` is the heat level it happened at, 1 when nothing is chasing you.
   * That multiplier is the shape of the whole economy: a takedown in free roam
   * is worth a takedown, and the same takedown at heat five is worth two and a
   * half of them. Running is the multiplier.
   */
  award(reason: RepReason, level = 1, units = 1): number {
    const kind = KINDS[reason];
    const base = (kind.value || 1) * units;
    const amount = Math.round(base * (1 + REP_HEAT_BONUS * (level - 1)));
    if (amount <= 0) return 0;

    this.total += amount;
    this.earnedThisStep += amount;

    // Same thing twice in quick succession folds into one popup rather than
    // stacking two: ploughing through traffic should read as one event that
    // is going well, not as a wall of identical lines.
    const last = this.recent[this.recent.length - 1];
    if (last && last.reason === reason && last.age < 0.6) {
      last.amount += amount;
      last.age = 0;
    } else {
      this.recent.push({ reason, label: kind.label, amount, age: 0 });
      if (this.recent.length > REP_POPUPS) this.recent.shift();
    }
    return amount;
  }

  /** Age the popups and drop the ones that have had their time. */
  step(dt: number): void {
    this.earnedThisStep = 0;
    for (let i = this.recent.length - 1; i >= 0; i--) {
      this.recent[i].age += dt;
      if (this.recent[i].age > REP_POPUP_TIME) this.recent.splice(i, 1);
    }
  }
}
