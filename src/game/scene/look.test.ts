import { describe, it, expect } from 'vitest';
import { LOOK_SWITCHES, NO_LOOK, parseLook } from './look';

describe('look switches (#579)', () => {
  it('are all off unless asked for', () => {
    expect(parseLook(null).size).toBe(0);
    expect(parseLook('').size).toBe(0);
    expect(parseLook(null)).toBe(NO_LOOK);
  });

  it('turn on by name, in any order', () => {
    expect([...parseLook('ao,grade')].sort()).toEqual(['ao', 'grade']);
  });

  it('ignore a name they do not know, rather than losing the rest', () => {
    expect([...parseLook('grade,nonsense, env ')].sort()).toEqual(['env', 'grade']);
  });

  it('all turns on every switch', () => {
    expect(parseLook('all').size).toBe(LOOK_SWITCHES.length);
  });
});
