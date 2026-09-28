import { describe, it, expect } from 'vitest';
import { Radio, type PursuitReport } from './radio';
import { RADIO_GAP, RADIO_HOLD, RADIO_LINES, RADIO_QUEUE } from './constants';

const STEP = 1 / 60;

const quiet = (): PursuitReport => ({
  level: 1,
  cops: 0,
  roadblocks: 0,
  spikes: 0,
  enforcers: 0,
  state: 'clear',
  busted: false,
  takedowns: 0,
  broken: 0,
  reason: null,
  car: 'Kestrel',
  colour: 'red',
  event: null,
});

/** Hold a state for a while, so anything queued gets a chance to be said. */
function hold(radio: Radio, report: PursuitReport, seconds = RADIO_GAP + 0.2): void {
  for (let t = 0; t < seconds; t += STEP) radio.update(STEP, report);
}

describe('the police radio', () => {
  it('says nothing about a pursuit that never starts', () => {
    const radio = new Radio();
    hold(radio, quiet(), 20);
    expect(radio.recent.length).toBe(0);
  });

  // It works by watching rather than by being told, so the very first step has
  // nothing to compare against and must not read as everything happening at
  // once.
  it('does not treat the first step as news', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 3, level: 4 };
    radio.update(STEP, running);
    expect(radio.recent.length).toBe(0);
  });

  it('opens the pursuit when the pursuit opens', () => {
    const radio = new Radio();
    hold(radio, quiet(), 0.1);
    hold(radio, { ...quiet(), state: 'pursuit', cops: 1 });
    // The opener, then the description of the car (#339).
    expect(radio.recent.length).toBe(2);
    expect(radio.recent[0].from).toBe('dispatch');
    expect(radio.recent[1].text).toContain('red Kestrel');
  });

  // The point of it: the hazards are called before they can be seen.
  it('calls a roadblock, spikes and an Enforcer', () => {
    const said = (change: Partial<PursuitReport>) => {
      const radio = new Radio();
      const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 2 };
      hold(radio, running, 0.1);
      hold(radio, { ...running, ...change });
      return radio.recent.map((line) => line.text).join(' ');
    };

    expect(said({ roadblocks: 1 }).toLowerCase()).toMatch(/block/);
    expect(said({ spikes: 1 }).toLowerCase()).toMatch(/spike|strip/);
    expect(said({ enforcers: 1 }).toLowerCase()).toMatch(/enforcer|heavy/);
  });

  it('says when they have lost you, and when they give up', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 2 };
    hold(radio, running, 0.1);
    hold(radio, { ...running, state: 'cooldown' });
    expect(radio.recent[radio.recent.length - 1].text.toLowerCase()).toMatch(/visual|sight|contain/);

    hold(radio, { ...running, state: 'clear', cops: 0 });
    expect(radio.recent[radio.recent.length - 1].from).toBe('command');
  });

  it('reacts to a unit being wrecked and to something coming down', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 3 };
    hold(radio, running, 0.1);
    hold(radio, { ...running, takedowns: 1 });
    expect(radio.recent.map((l) => l.text).join(' ').toLowerCase()).toMatch(/unit|officer/);
  });

  // A burst of events is a conversation, not a wall of text.
  it('spaces the callouts out', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 1 };
    hold(radio, running, 0.1);
    // Four things at once (the helicopter used to be the fourth; #183).
    radio.update(STEP, { ...running, roadblocks: 1, spikes: 1, enforcers: 1, takedowns: 1 });
    for (let t = 0; t < RADIO_GAP * 0.5; t += STEP) {
      radio.update(STEP, { ...running, roadblocks: 1, spikes: 1, enforcers: 1, takedowns: 1 });
    }
    expect(radio.recent.length).toBeLessThanOrEqual(1);
  });

  it('drops news that has gone stale rather than queueing for ever', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 1 };
    hold(radio, running, 0.1);

    // Twenty things happen inside one gap.
    let cops = 1;
    for (let i = 0; i < 20; i++) {
      cops++;
      radio.update(STEP, { ...running, cops });
    }
    // Then let it talk for a long time: it must run out, not read a backlog.
    hold(radio, { ...running, cops }, RADIO_GAP * (RADIO_QUEUE + 3));
    expect(radio.recent.length).toBeLessThanOrEqual(RADIO_LINES);
  });

  it('never shows more lines than fit, and lets them go', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 1 };
    hold(radio, running, 0.1);
    for (let i = 0; i < 6; i++) {
      hold(radio, { ...running, cops: 1 + i, roadblocks: i });
    }
    expect(radio.recent.length).toBeLessThanOrEqual(RADIO_LINES);

    // Long enough for the queue to drain *and* for what it said to expire:
    // waiting only for the hold leaves whatever was still queued arriving.
    hold(radio, { ...running, cops: 6, roadblocks: 5 }, RADIO_GAP * RADIO_QUEUE + RADIO_HOLD + 1);
    expect(radio.recent.length).toBe(0);
  });

  // A repeat that is the same words twice reads as a bug rather than as a
  // radio.
  it('does not say the same thing the same way twice running', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 1 };
    hold(radio, running, 0.1);
    hold(radio, { ...running, roadblocks: 1 });
    hold(radio, { ...running, roadblocks: 2 });
    const said = radio.recent.filter((l) => l.text.toLowerCase().includes('block'));
    expect(said.length).toBe(2);
    expect(said[0].text).not.toBe(said[1].text);
  });

  it('forgets the last pursuit when it is reset', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 1 };
    hold(radio, running, 0.1);
    hold(radio, { ...running, roadblocks: 1 });
    expect(radio.recent.length).toBeGreaterThan(0);

    radio.reset();
    expect(radio.recent.length).toBe(0);
  });

  // #339: the radio is about you. The opener is followed by a description of
  // the car, from the report rather than a fixed line.
  it('names the car it is chasing when a pursuit opens', () => {
    const radio = new Radio();
    hold(radio, { ...quiet(), car: 'Ridgeback', colour: 'purple' }, 0.1);
    hold(radio, { ...quiet(), state: 'pursuit', cops: 1, car: 'Ridgeback', colour: 'purple' }, RADIO_GAP * 3);
    const said = radio.recent.map((line) => line.text).join(' ');
    expect(said).toContain('purple Ridgeback');
  });

  // #338: dispatch described the car, so dispatch updates the description.
  it('calls in a respray during a pursuit, and not a car swap', () => {
    const radio = new Radio();
    const searching: PursuitReport = { ...quiet(), state: 'cooldown', cops: 1, car: 'Kestrel', colour: 'red' };
    hold(radio, searching, 0.1);
    hold(radio, { ...searching, state: 'clear', colour: 'blue' }, RADIO_GAP * 3);
    expect(radio.recent.map((line) => line.text).join(' ')).toMatch(/now blue|blue now|Now blue/);

    const swapped = new Radio();
    hold(swapped, searching, 0.1);
    hold(swapped, { ...searching, car: 'Verso', colour: 'blue' }, RADIO_GAP * 3);
    expect(swapped.recent.map((line) => line.text).join(' ')).not.toMatch(/blue/);

    const idle = new Radio();
    hold(idle, quiet(), 0.1);
    hold(idle, { ...quiet(), colour: 'blue' }, RADIO_GAP * 3);
    expect(idle.recent.length).toBe(0);
  });

  it('says an orange car, not a orange one', () => {
    const radio = new Radio();
    hold(radio, { ...quiet(), car: 'Emberline', colour: 'orange' }, 0.1);
    hold(radio, { ...quiet(), state: 'pursuit', cops: 1, car: 'Emberline', colour: 'orange' }, RADIO_GAP * 3);
    const said = radio.recent.map((line) => line.text).join(' ');
    expect(said).toContain('orange Emberline');
    expect(said).not.toMatch(/\ba orange/);
  });

  it('does not describe the car again when a search finds it', () => {
    const radio = new Radio();
    const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 1, car: 'Kite', colour: 'yellow' };
    hold(radio, quiet(), 0.1);
    hold(radio, running, RADIO_HOLD + RADIO_GAP * 3);
    hold(radio, { ...running, state: 'cooldown' }, RADIO_HOLD + RADIO_GAP * 3);
    hold(radio, running, RADIO_GAP * 3);
    expect(radio.recent.map((line) => line.text).join(' ')).not.toContain('Kite');
  });

  // A pursuit through a race sounds like the police know it is a race.
  it('draws from the race lines when a race is running', () => {
    const race = (change: Partial<PursuitReport>, from: Partial<PursuitReport> = {}) => {
      const radio = new Radio();
      const running: PursuitReport = { ...quiet(), state: 'pursuit', cops: 2, event: 'race', ...from };
      hold(radio, { ...quiet(), event: 'race' }, 0.1);
      hold(radio, running, RADIO_GAP * 3);
      radio.recent.length = 0;
      hold(radio, { ...running, ...change }, RADIO_GAP * 2);
      return radio.recent.map((line) => line.text).join(' ').toLowerCase();
    };
    const opened = (() => {
      const radio = new Radio();
      hold(radio, { ...quiet(), event: 'race' }, 0.1);
      hold(radio, { ...quiet(), state: 'pursuit', cops: 1, event: 'race' });
      return radio.recent[0].text.toLowerCase();
    })();
    expect(opened).toMatch(/rac/);
    expect(race({ state: 'cooldown' })).toMatch(/race|route|finish|round/);
    expect(race({ level: 2 })).toMatch(/route|race|good/);
  });
});
