const STORAGE_KEY = 'nfsmw.progress.v1';

/** Persisted player progress. `beaten` = how many rivals have been defeated. */
export interface Progress {
  beaten: number;
}

/** Load progress from localStorage; returns a fresh start if unavailable. */
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      if (typeof parsed.beaten === 'number' && parsed.beaten >= 0) {
        return { beaten: Math.floor(parsed.beaten) };
      }
    }
  } catch {
    // no localStorage (e.g. tests / SSR) or malformed data — start fresh
  }
  return { beaten: 0 };
}

/** Persist progress; a no-op where localStorage is unavailable. */
export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore — storage unavailable
  }
}
