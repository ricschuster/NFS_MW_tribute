import { getStore } from './storage';

const STORAGE_KEY = 'crosstown.progress.v1';

/**
 * The save format's own version (#101).
 *
 * Separate from the key, and deliberately so: a versioned *key* orphans every
 * older save, where a versioned *record* can be read and brought forward. It
 * is 2 because there is already a 1 in the wild - everything written before
 * this had no version field at all.
 */
export const SAVE_VERSION = 2;

/**
 * Persisted player progress.
 *
 * One record for one player. `beaten` is how far up the ladder they are, `rep`
 * is the currency that unlocks it (#64, #91), and the rest is what they have
 * found and what they are driving. It is all in the same record and under the
 * same key because it is all the same answer to "where was I".
 */
export interface Progress {
  /** Which shape this was written in. Used to bring older saves forward. */
  version: number;
  beaten: number;
  rep: number;
  /** Ids of the billboards smashed so far (#93). */
  smashed: number[];
  /** Speed camera id to the best fraction of top speed clocked at it. */
  clocked: [number, number][];
  /** Ids of the cars found so far, and the one being driven (#67). */
  cars: string[];
  car: string;
  /** Parts earned per car, and the ones fitted to each (#68). */
  parts: [string, string[]][];
  fitted: [string, string[]][];
}

/** A player who has just arrived. */
export function freshProgress(): Progress {
  return {
    version: SAVE_VERSION,
    beaten: 0,
    rep: 0,
    smashed: [],
    clocked: [],
    cars: [],
    car: '',
    parts: [],
    fitted: [],
  };
}

/**
 * Read a save out of a string.
 *
 * Every field is validated rather than trusted, and anything missing or wrong
 * falls back to the fresh value instead of throwing the whole save away. That
 * is what makes an older format readable: a save written before Rep existed is
 * a save with no `rep` in it, not a corrupt one.
 *
 * Exported so the format can be tested without a store in the way, and so the
 * two implementations of one can be shown to agree (#101).
 */
export function decodeProgress(raw: string | null): Progress {
  const fresh = freshProgress();
  if (!raw) return fresh;

  let parsed: Partial<Progress>;
  try {
    parsed = JSON.parse(raw) as Partial<Progress>;
  } catch {
    return fresh;
  }
  if (!parsed || typeof parsed !== 'object') return fresh;
  // The one field that has to be there. Anything without it is not a save.
  if (typeof parsed.beaten !== 'number' || parsed.beaten < 0) return fresh;

  const numbers = (rows: unknown): number[] =>
    Array.isArray(rows) ? rows.filter((id): id is number => typeof id === 'number') : [];
  const pairs = (rows: unknown): [number, number][] =>
    Array.isArray(rows)
      ? rows.filter(
          (row): row is [number, number] =>
            Array.isArray(row) && typeof row[0] === 'number' && typeof row[1] === 'number',
        )
      : [];
  const strings = (rows: unknown): string[] =>
    Array.isArray(rows) ? rows.filter((id): id is string => typeof id === 'string') : [];
  const perCar = (rows: unknown): [string, string[]][] =>
    Array.isArray(rows)
      ? rows.filter(
          (row): row is [string, string[]] =>
            Array.isArray(row) && typeof row[0] === 'string' && Array.isArray(row[1]),
        )
      : [];

  return {
    // A save with no version is one written before there were any: v1.
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    beaten: Math.floor(parsed.beaten),
    rep: typeof parsed.rep === 'number' && parsed.rep >= 0 ? Math.floor(parsed.rep) : 0,
    smashed: numbers(parsed.smashed),
    clocked: pairs(parsed.clocked),
    cars: strings(parsed.cars),
    car: typeof parsed.car === 'string' ? parsed.car : '',
    parts: perCar(parsed.parts),
    fitted: perCar(parsed.fitted),
  };
}

/** Write a save out as a string, always in the current format. */
export function encodeProgress(progress: Progress): string {
  return JSON.stringify({ ...progress, version: SAVE_VERSION });
}

/** Load progress from wherever this build keeps it; a fresh start if nowhere. */
export function loadProgress(): Progress {
  return decodeProgress(getStore().read(STORAGE_KEY));
}

/**
 * Persist progress. Returns false when it could not be kept.
 *
 * The old version could not tell a save that failed from one that worked,
 * which is the one thing a player needs to know before they spend an evening
 * on something.
 */
export function saveProgress(progress: Progress): boolean {
  return getStore().write(STORAGE_KEY, encodeProgress(progress));
}

/** Will anything written here survive the session? */
export function progressSurvives(): boolean {
  return getStore().persistent;
}

/** Throw the save away. For a "start again" that is not a cleared browser. */
export function clearProgress(): void {
  getStore().remove(STORAGE_KEY);
}
