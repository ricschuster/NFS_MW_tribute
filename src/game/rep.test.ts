import { describe, it, expect } from 'vitest';
import { RepLedger } from './rep';
import {
  REP_TAKEDOWN,
  REP_ESCAPE,
  REP_NEAR_MISS,
  REP_HEAT_BONUS,
  REP_POPUP_TIME,
  REP_POPUPS,
} from './constants';

describe('the Rep ledger', () => {
  it('pays the table value at heat one', () => {
    const rep = new RepLedger();
    expect(rep.award('takedown')).toBe(REP_TAKEDOWN);
    expect(rep.total).toBe(REP_TAKEDOWN);
  });

  // The shape of the whole economy: running is the multiplier, so the same
  // thing done under pressure is worth more than the thing done at leisure.
  it('pays more the hotter it is', () => {
    const calm = new RepLedger().award('takedown', 1);
    const hot = new RepLedger().award('takedown', 6);
    expect(hot).toBeGreaterThan(calm);
    expect(hot).toBe(Math.round(REP_TAKEDOWN * (1 + REP_HEAT_BONUS * 5)));
  });

  it('scales an award by how much of it there was', () => {
    const rep = new RepLedger();
    // `pursuit` has no table value: it is priced by the second by the caller.
    expect(rep.award('pursuit', 1, 50)).toBe(50);
  });

  it('says what each award was for', () => {
    const rep = new RepLedger();
    rep.award('escape', 4);
    expect(rep.recent[0].label).toBe('ESCAPED');
    expect(rep.recent[0].amount).toBe(Math.round(REP_ESCAPE * (1 + REP_HEAT_BONUS * 3)));
  });

  // Ploughing through traffic should read as one thing going well, not as a
  // wall of identical lines.
  it('folds a repeat of the same award into one line', () => {
    const rep = new RepLedger();
    rep.award('nearMiss');
    rep.step(0.1);
    rep.award('nearMiss');

    expect(rep.recent.length).toBe(1);
    expect(rep.recent[0].amount).toBe(REP_NEAR_MISS * 2);
    expect(rep.total).toBe(REP_NEAR_MISS * 2);
  });

  it('starts a new line once the last one has had a moment', () => {
    const rep = new RepLedger();
    rep.award('nearMiss');
    rep.step(1);
    rep.award('nearMiss');
    expect(rep.recent.length).toBe(2);
  });

  it('drops popups once they have had their time', () => {
    const rep = new RepLedger();
    rep.award('takedown');
    rep.step(REP_POPUP_TIME + 0.1);
    expect(rep.recent.length).toBe(0);
    // The popup goes; the Rep does not.
    expect(rep.total).toBe(REP_TAKEDOWN);
  });

  it('never stacks more popups than fit on screen', () => {
    const rep = new RepLedger();
    const kinds = ['takedown', 'roadblock', 'wreck', 'nearMiss', 'escape'] as const;
    for (let i = 0; i < 20; i++) {
      rep.award(kinds[i % kinds.length]);
      rep.step(0.7);
    }
    expect(rep.recent.length).toBeLessThanOrEqual(REP_POPUPS);
  });

  it('reports what the last step paid, for whoever wants to save it', () => {
    const rep = new RepLedger();
    rep.step(0.016);
    expect(rep.earnedThisStep).toBe(0);
    rep.award('takedown');
    expect(rep.earnedThisStep).toBe(REP_TAKEDOWN);
  });
});
