import { describe, it, expect } from 'vitest';
import { DEFAULT_LOOK, LOOK_SWITCHES, NO_LOOK, parseLook } from './look';

describe('look switches (#579)', () => {
  it('are all on by default, off for ?look=none', () => {
    expect(parseLook(null)).toBe(DEFAULT_LOOK);
    expect(parseLook('')).toBe(DEFAULT_LOOK);
    expect(parseLook(null).size).toBe(LOOK_SWITCHES.length);
    expect(parseLook('none')).toBe(NO_LOOK);
  });

  it('turn on by name, in any order', () => {
    expect([...parseLook('pbr,env')].sort()).toEqual(['env', 'pbr']);
  });

  it('ignore a name they do not know, rather than losing the rest', () => {
    expect([...parseLook('pbr,nonsense, env ')].sort()).toEqual(['env', 'pbr']);
  });

  it('all turns on every switch', () => {
    expect(parseLook('all').size).toBe(LOOK_SWITCHES.length);
  });
});
