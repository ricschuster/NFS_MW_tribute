const STORAGE_KEY = 'crosstown.progress.v1';

/**
 * Persisted player progress.
 *
 * `beaten` is how many track rivals have been defeated. `rep` is the free-roam
 * currency from #64, and it is deliberately in the same record and the same
 * storage key: they are one player's progress, and the ladder is about to be
 * driven by Rep rather than by a count of wins (#91).
 */
export interface Progress {
  beaten: number;
  rep: number;
  /** Ids of the billboards smashed so far (#93). */
  smashed: number[];
  /** Speed camera id to the best fraction of top speed clocked at it. */
  clocked: [number, number][];
  /** Ids of the cars found so far, and the one being driven (#67). */
  cars: string[];
  car: string;
}

/** Load progress from localStorage; returns a fresh start if unavailable. */
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      if (typeof parsed.beaten === 'number' && parsed.beaten >= 0) {
        // `rep` is read as optional so saves written before #64 still load
        // rather than being thrown away as malformed.
        const rep = typeof parsed.rep === 'number' && parsed.rep >= 0 ? Math.floor(parsed.rep) : 0;
        const smashed = Array.isArray(parsed.smashed)
          ? parsed.smashed.filter((id): id is number => typeof id === 'number')
          : [];
        const clocked = Array.isArray(parsed.clocked)
          ? parsed.clocked.filter(
              (row): row is [number, number] =>
                Array.isArray(row) && typeof row[0] === 'number' && typeof row[1] === 'number',
            )
          : [];
        const cars = Array.isArray(parsed.cars)
          ? parsed.cars.filter((id): id is string => typeof id === 'string')
          : [];
        const car = typeof parsed.car === 'string' ? parsed.car : '';
        return { beaten: Math.floor(parsed.beaten), rep, smashed, clocked, cars, car };
      }
    }
  } catch {
    // no localStorage (e.g. tests / SSR) or malformed data — start fresh
  }
  return { beaten: 0, rep: 0, smashed: [], clocked: [], cars: [], car: '' };
}

/** Persist progress; a no-op where localStorage is unavailable. */
export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore — storage unavailable
  }
}
