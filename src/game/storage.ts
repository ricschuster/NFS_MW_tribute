/**
 * Where a save actually lives (#101).
 *
 * `progress.ts` has always wrapped `localStorage`, which is the right seam; it
 * was just nailed shut. This opens it: the game asks a `Store` for a string
 * and hands it one back, and what that store *is* becomes something the host
 * decides at startup. In a browser it is `localStorage`. In a desktop shell it
 * is a file in the user's app data directory - which survives clearing site
 * data, can be backed up, and can be looked at.
 *
 * Synchronous on purpose. `World.step` saves, and a step that has to await
 * anything is a step that cannot run on a fixed timestep; a shell wanting a
 * file can buffer in memory and flush on its own clock.
 */
export interface Store {
  /** What is under this key, or null if nothing is. */
  read(key: string): string | null;
  /** Keep this. Returns false when it could not be kept. */
  write(key: string, value: string): boolean;
  /** Forget it. */
  remove(key: string): void;
  /**
   * Does what is written here survive the session?
   *
   * The old code could not tell a save that failed from a fresh start, which
   * is the one thing a player needs to know before they spend an evening on
   * something.
   */
  readonly persistent: boolean;
}

/** `localStorage`, with everything it can throw swallowed. */
export function browserStore(): Store {
  const available = (() => {
    try {
      const probe = '__crosstown_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      // No storage at all, or a browser refusing it (private mode, site data
      // blocked, an iframe without access).
      return false;
    }
  })();

  return {
    persistent: available,
    read(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        // Quota, or storage disabled between the probe and now.
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Nothing to do about it, and nothing worth stopping the game for.
      }
    },
  };
}

/**
 * A store in a variable.
 *
 * The fallback where there is no storage - the tests, a browser that refuses
 * it - and the reason progress works within a session even then. It reports
 * itself as not persistent, which is the honest answer.
 */
export function memoryStore(seed: Record<string, string> = {}): Store {
  const held = new Map(Object.entries(seed));
  return {
    persistent: false,
    read: (key) => held.get(key) ?? null,
    write: (key, value) => {
      held.set(key, value);
      return true;
    },
    remove: (key) => {
      held.delete(key);
    },
  };
}

/**
 * The store the game is using.
 *
 * Chosen once, lazily, so importing this module does not touch `localStorage`
 * at module scope - which is what would make it explode under a test runner or
 * on a server.
 */
let current: Store | null = null;

export function getStore(): Store {
  if (!current) {
    const browser = typeof localStorage !== 'undefined' ? browserStore() : null;
    current = browser?.persistent ? browser : memoryStore();
  }
  return current;
}

/**
 * Put a different store in, and hand back the one that was there.
 *
 * This is the whole point of the seam: a desktop shell calls it at startup
 * with a file-backed store before the game has read anything.
 */
export function setStore(store: Store | null): Store | null {
  const was = current;
  current = store;
  return was;
}
