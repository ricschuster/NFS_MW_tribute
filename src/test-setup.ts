import { beforeEach } from 'vitest';
import { memoryStore, setStore } from './game/storage';

/**
 * Every test is its own session (#101).
 *
 * The in-memory store keeps a save for as long as the process lives, which is
 * exactly right for a browser tab that has no `localStorage` and exactly wrong
 * for a test runner: without this, one test's Rep is the next test's starting
 * total and the failures land somewhere unrelated to the cause.
 */
beforeEach(() => {
  setStore(memoryStore());
});
