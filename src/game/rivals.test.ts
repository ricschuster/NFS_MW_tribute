import { describe, it, expect } from 'vitest';
import { RIVALS, difficultyLabel, nextRival, unlocked } from './rivals';
import { RIVAL_BASE_SPEED_FRAC, RIVAL_DIFF_SPEED_FRAC } from './constants';

describe('the ladder of ten', () => {
  it('has ten rivals ranked 10 down to 1', () => {
    expect(RIVALS.length).toBe(10);
    expect(RIVALS.map((r) => r.rank)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('grows harder toward the boss', () => {
    for (let i = 1; i < RIVALS.length; i++) {
      expect(RIVALS[i].difficulty).toBeGreaterThan(RIVALS[i - 1].difficulty);
    }
  });

  it('keeps every rival beatable (race speed below the player max)', () => {
    for (const rival of RIVALS) {
      const speedFrac = RIVAL_BASE_SPEED_FRAC + rival.difficulty * RIVAL_DIFF_SPEED_FRAC;
      expect(speedFrac).toBeLessThan(1);
    }
  });

  it('gives every rival a car, a colour and something to be', () => {
    for (const rival of RIVALS) {
      expect(rival.car.length).toBeGreaterThan(0);
      expect(rival.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(rival.character.length).toBeGreaterThan(0);
    }
  });

  // Not at the start (#419): the ordinary races are what a new game starts
  // with, and the first rival is earned - but by about one of them, not a grind.
  it('asks for a little Rep to face the first one', () => {
    expect(RIVALS[0].rep).toBeGreaterThan(0);
    expect(RIVALS[0].rep).toBeLessThanOrEqual(2000);
  });

  it('asks for more Rep the further up it goes', () => {
    for (let i = 1; i < RIVALS.length; i++) {
      expect(RIVALS[i].rep).toBeGreaterThan(RIVALS[i - 1].rep);
    }
  });

  it('hands back the next challenge, and nothing once it is cleared', () => {
    expect(nextRival(0)?.rank).toBe(10);
    expect(nextRival(9)?.rank).toBe(1);
    expect(nextRival(10)).toBeNull();
  });

  it('opens a challenge only once the Rep is there', () => {
    const cinder = RIVALS[1];
    expect(unlocked(cinder, cinder.rep - 1)).toBe(false);
    expect(unlocked(cinder, cinder.rep)).toBe(true);
    expect(unlocked(null, Infinity)).toBe(false);
  });
});

describe('what an event card calls a rival (#357)', () => {
  it('starts the ladder easy and ends it hard, never going back down', () => {
    const labels = RIVALS.map((rival) => difficultyLabel(rival.difficulty));
    expect(labels[0]).toBe('EASY');
    expect(labels[labels.length - 1]).toBe('HARD');
    const order = ['EASY', 'MEDIUM', 'HARD'];
    for (let i = 1; i < labels.length; i++) {
      expect(order.indexOf(labels[i])).toBeGreaterThanOrEqual(order.indexOf(labels[i - 1]));
    }
  });
});
