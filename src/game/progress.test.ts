import { describe, it, expect } from 'vitest';
import {
  SAVE_VERSION,
  clearProgress,
  decodeProgress,
  encodeProgress,
  freshProgress,
  loadProgress,
  progressSurvives,
  saveProgress,
  type Progress,
} from './progress';
import { memoryStore, setStore, type Store } from './storage';

const filled = (): Progress => ({
  version: SAVE_VERSION,
  beaten: 4,
  rep: 18400,
  smashed: [3, 7, 11],
  clocked: [[2, 0.81]],
  cars: ['kestrel', 'kite'],
  car: 'kite',
  parts: [['kite', ['block', 'track-tyres']]],
  fitted: [['kite', ['block']]],
});

describe('the save format', () => {
  it('round-trips everything a player has', () => {
    expect(decodeProgress(encodeProgress(filled()))).toEqual(filled());
  });

  it('stamps whatever it writes with the current version', () => {
    const old = { ...filled(), version: 1 };
    expect(JSON.parse(encodeProgress(old)).version).toBe(SAVE_VERSION);
  });

  it('reads a fresh start out of nothing', () => {
    expect(decodeProgress(null)).toEqual(freshProgress());
    expect(decodeProgress('')).toEqual(freshProgress());
  });

  it('reads a fresh start out of nonsense rather than throwing', () => {
    expect(decodeProgress('{')).toEqual(freshProgress());
    expect(decodeProgress('null')).toEqual(freshProgress());
    expect(decodeProgress('"a string"')).toEqual(freshProgress());
    expect(decodeProgress('{"beaten":"lots"}')).toEqual(freshProgress());
  });

  // The reason the version is in the record and not in the key: a save written
  // before Rep existed is a save with no `rep` in it, not a corrupt one.
  it('brings a save from before any of this forward', () => {
    const ancient = decodeProgress(JSON.stringify({ beaten: 6 }));
    expect(ancient.beaten).toBe(6);
    expect(ancient.rep).toBe(0);
    expect(ancient.cars).toEqual([]);
    // No version field at all is version one, by definition.
    expect(ancient.version).toBe(1);
  });

  it('throws away a field that is the wrong shape without losing the rest', () => {
    const bent = decodeProgress(
      JSON.stringify({ ...filled(), smashed: 'all of them', clocked: [['two', 0.5]] }),
    );
    expect(bent.beaten).toBe(4);
    expect(bent.rep).toBe(18400);
    expect(bent.smashed).toEqual([]);
    expect(bent.clocked).toEqual([]);
  });
});

describe('where the save lives', () => {
  /**
   * A stand-in for the file-backed store a desktop shell would supply: it
   * holds one string and knows nothing else about the game. If a save written
   * through this reads back through the in-memory one, the format is the
   * contract and not the transport (#101).
   */
  function fakeFileStore(): Store & { contents: string | null } {
    const state = { contents: null as string | null };
    return {
      persistent: true,
      read: () => state.contents,
      write: (_key, value) => {
        state.contents = value;
        return true;
      },
      remove: () => {
        state.contents = null;
      },
      get contents() {
        return state.contents;
      },
    };
  }

  it('keeps a save through whatever store it is given', () => {
    setStore(memoryStore());
    expect(saveProgress(filled())).toBe(true);
    expect(loadProgress()).toEqual(filled());
  });

  // The test the issue asks for: the two implementations cannot drift, because
  // one reads what the other wrote.
  it('reads back a save written by a different implementation', () => {
    const file = fakeFileStore();
    setStore(file);
    saveProgress(filled());
    expect(file.contents).not.toBeNull();

    setStore(memoryStore({ 'crosstown.progress.v1': file.contents as string }));
    expect(loadProgress()).toEqual(filled());
  });

  it('says whether what it writes will survive', () => {
    setStore(memoryStore());
    expect(progressSurvives()).toBe(false);
    setStore(fakeFileStore());
    expect(progressSurvives()).toBe(true);
  });

  // A save that failed used to be indistinguishable from a fresh start, which
  // is the one thing a player needs to know before spending an evening on it.
  it('says so when it could not keep one', () => {
    setStore({
      persistent: false,
      read: () => null,
      write: () => false,
      remove: () => {},
    });
    expect(saveProgress(filled())).toBe(false);
  });

  it('can be thrown away', () => {
    setStore(memoryStore());
    saveProgress(filled());
    clearProgress();
    expect(loadProgress()).toEqual(freshProgress());
  });
});
