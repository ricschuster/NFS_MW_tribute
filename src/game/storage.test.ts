import { describe, it, expect } from 'vitest';
import { browserStore, memoryStore, getStore, setStore, type Store } from './storage';

describe('a store in memory', () => {
  it('keeps what it is given', () => {
    const store = memoryStore();
    expect(store.read('a')).toBeNull();
    expect(store.write('a', 'one')).toBe(true);
    expect(store.read('a')).toBe('one');
    store.remove('a');
    expect(store.read('a')).toBeNull();
  });

  it('can be started with something already in it', () => {
    expect(memoryStore({ a: 'one' }).read('a')).toBe('one');
  });

  // It is right for a browser tab with no storage and wrong to claim more.
  it('does not pretend to be persistent', () => {
    expect(memoryStore().persistent).toBe(false);
  });
});

describe('a store in the browser', () => {
  /** Stand in for `localStorage` for the length of one test. */
  function withLocalStorage(fake: Partial<Storage> | null, run: () => void): void {
    const globals = globalThis as unknown as { localStorage?: unknown };
    const was = 'localStorage' in globals ? globals.localStorage : undefined;
    if (fake === null) delete globals.localStorage;
    else globals.localStorage = fake;
    try {
      run();
    } finally {
      if (was === undefined) delete globals.localStorage;
      else globals.localStorage = was;
    }
  }

  it('uses it when it works', () => {
    const held = new Map<string, string>();
    withLocalStorage(
      {
        getItem: (k: string) => held.get(k) ?? null,
        setItem: (k: string, v: string) => void held.set(k, v),
        removeItem: (k: string) => void held.delete(k),
      },
      () => {
        const store = browserStore();
        expect(store.persistent).toBe(true);
        expect(store.write('a', 'one')).toBe(true);
        expect(store.read('a')).toBe('one');
        store.remove('a');
        expect(store.read('a')).toBeNull();
      },
    );
  });

  // Private mode, blocked site data, an iframe without access: all of these
  // throw rather than return null, and none of them may stop the game.
  it('reports itself unusable rather than throwing when it is refused', () => {
    withLocalStorage(
      {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      },
      () => {
        const store = browserStore();
        expect(store.persistent).toBe(false);
        expect(store.read('a')).toBeNull();
        expect(store.write('a', 'one')).toBe(false);
        expect(() => store.remove('a')).not.toThrow();
      },
    );
  });

  // Quota is the case that passes the probe and fails on a real save.
  it('reports a write that failed after it looked fine', () => {
    let allow = true;
    withLocalStorage(
      {
        getItem: () => null,
        setItem: () => {
          if (!allow) throw new Error('quota');
        },
        removeItem: () => {},
      },
      () => {
        const store = browserStore();
        expect(store.persistent).toBe(true);
        allow = false;
        expect(store.write('a', 'one')).toBe(false);
      },
    );
  });
});

describe('choosing one', () => {
  it('hands the same store back until it is changed', () => {
    setStore(null);
    const first = getStore();
    expect(getStore()).toBe(first);
  });

  // The whole point of the seam: a desktop shell puts a file-backed store in
  // at startup, before anything has been read.
  it('lets a host put its own in', () => {
    const mine: Store = { persistent: true, read: () => 'x', write: () => true, remove: () => {} };
    setStore(mine);
    expect(getStore()).toBe(mine);
    expect(setStore(memoryStore())).toBe(mine);
  });

  it('falls back to memory where there is no storage at all', () => {
    setStore(null);
    expect(getStore().persistent).toBe(false);
  });
});
