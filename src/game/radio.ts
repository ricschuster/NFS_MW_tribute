import { RADIO_GAP, RADIO_HOLD, RADIO_LINES, RADIO_QUEUE } from './constants';

/**
 * The police radio (#76).
 *
 * Most of why a pursuit feels alive, and deliberately not decoration: dispatch
 * calls a roadblock before you can see it and air support before you can hear
 * it, so the radio is a *tell* for hazards rather than atmosphere over the top
 * of them.
 *
 * It works by watching the pursuit rather than by being told. Every system
 * that could raise a callout - the roadblocks, the spikes, the helicopter, the
 * Enforcers - already exposes what it is doing, and asking them each step is
 * one place that can be wrong instead of eight places that can forget to
 * speak.
 *
 * Subtitles, not speech: voice assets are a whole production this project does
 * not have and would not be original if it did.
 */
export type RadioVoice = 'dispatch' | 'unit' | 'air' | 'command';

export interface RadioMessage {
  from: RadioVoice;
  text: string;
  /** Seconds since it was said. Dropped past `RADIO_HOLD`. */
  age: number;
}

/** What the radio can react to. Everything here is read off the pursuit. */
export interface PursuitReport {
  /** 1..6. */
  level: number;
  cops: number;
  roadblocks: number;
  spikes: number;
  enforcers: number;
  helicopter: boolean;
  /** 'clear' | 'pursuit' | 'cooldown'. */
  state: string;
  busted: boolean;
  /** How many police cars the player has wrecked, in total. */
  takedowns: number;
  /** How many things the player has brought down, in total. */
  broken: number;
}

type Callout = { from: RadioVoice; lines: string[] };

/**
 * What gets said, and who says it.
 *
 * Written as a table because it is content: the tone of a pursuit is in these
 * lines as much as it is in the heat curve, and both should be editable
 * without reading any code.
 */
const CALLOUTS: Record<string, Callout> = {
  opened: {
    from: 'dispatch',
    lines: [
      'All units, we have a street racer running. Engage.',
      'Dispatch to all units - pursuit is active.',
      'We have a runner. All available units respond.',
    ],
  },
  joined: {
    from: 'unit',
    lines: ['Unit joining the pursuit.', 'I have visual, joining.', 'Falling in behind.'],
  },
  escalated: {
    from: 'command',
    lines: [
      'Escalating the response. Bring more units in.',
      'This one is not stopping. Step it up.',
      'Command: raise the response level.',
    ],
  },
  roadblock: {
    from: 'dispatch',
    lines: [
      'Roadblock going up on their route. Push them into it.',
      'Units setting up a block ahead of the suspect.',
      'Block is in place. Do not let them round it.',
    ],
  },
  spikes: {
    from: 'unit',
    lines: [
      'Spike strip deploying ahead of the suspect.',
      'Strips are down. Back off the bumper.',
      'Laying strips - watch your own tyres.',
    ],
  },
  air: {
    from: 'air',
    lines: [
      'Air support is up. We have them from here.',
      'Helicopter on station, eyes on the suspect.',
      'Air unit overhead. They are not losing us now.',
    ],
  },
  enforcer: {
    from: 'command',
    lines: [
      'Enforcer inbound, head on. End it.',
      'Heavy unit going in from the front.',
      'Enforcer is committed. Brace.',
    ],
  },
  unitDown: {
    from: 'unit',
    lines: [
      'Unit down! They put a car out.',
      'We have lost a unit. Suspect is ramming.',
      'Officer needs assistance - unit is off the road.',
    ],
  },
  debris: {
    from: 'dispatch',
    lines: [
      'They have brought something down on us. Units blocked.',
      'Debris across the road, units are stuck.',
      'Route is blocked. Find a way round.',
    ],
  },
  lost: {
    from: 'dispatch',
    lines: [
      'Lost visual. Setting up a search of the area.',
      'No eyes on the suspect. Sweep the sector.',
      'They are out of sight. Contain the area.',
    ],
  },
  clear: {
    from: 'command',
    lines: [
      'We have lost them. All units stand down.',
      'Search is called off. Return to patrol.',
      'Suspect is gone. Stand down.',
    ],
  },
  busted: {
    from: 'dispatch',
    lines: ['Suspect is stopped. Good work.', 'We have them. Pursuit over.'],
  },
};

export class Radio {
  /** What is on screen, oldest first. */
  readonly recent: RadioMessage[] = [];
  /** True on the step a line is said, so the renderer can key a squelch off it. */
  justSpoke = false;

  private readonly queue: { key: string; index: number }[] = [];
  private sinceSpoke = RADIO_GAP;
  /** Which line of each callout comes next, so a repeat is not the same words. */
  private readonly rotation = new Map<string, number>();
  private was: PursuitReport | null = null;

  /** Clear everything: a new pursuit does not carry the last one's traffic. */
  reset(): void {
    this.recent.length = 0;
    this.queue.length = 0;
    this.was = null;
  }

  update(dt: number, now: PursuitReport): void {
    this.justSpoke = false;
    this.sinceSpoke += dt;

    for (let i = this.recent.length - 1; i >= 0; i--) {
      this.recent[i].age += dt;
      if (this.recent[i].age > RADIO_HOLD) this.recent.splice(i, 1);
    }

    this.watch(now);
    this.was = { ...now };

    if (this.queue.length === 0 || this.sinceSpoke < RADIO_GAP) return;
    const next = this.queue.shift();
    if (!next) return;
    this.say(next.key, next.index);
  }

  /** Compare against the last step and queue whatever changed. */
  private watch(now: PursuitReport): void {
    const was = this.was;
    if (!was) return;

    if (was.state !== 'pursuit' && now.state === 'pursuit') this.call('opened');
    else if (now.cops > was.cops && now.state === 'pursuit') this.call('joined');

    if (now.level > was.level && now.state === 'pursuit') this.call('escalated');
    if (now.roadblocks > was.roadblocks) this.call('roadblock');
    if (now.spikes > was.spikes) this.call('spikes');
    if (now.enforcers > was.enforcers) this.call('enforcer');
    if (now.helicopter && !was.helicopter) this.call('air');
    if (now.takedowns > was.takedowns) this.call('unitDown');
    if (now.broken > was.broken && now.state === 'pursuit') this.call('debris');

    if (was.state === 'pursuit' && now.state === 'cooldown') this.call('lost');
    if (was.state !== 'clear' && now.state === 'clear') this.call('clear');
    if (!was.busted && now.busted) this.call('busted');
  }

  /** Queue a line, and drop the back of the queue rather than let it grow. */
  private call(key: string): void {
    const index = this.rotation.get(key) ?? 0;
    this.rotation.set(key, index + 1);
    this.queue.push({ key, index });
    // Anything still waiting behind four other callouts is stale news by the
    // time it would be read, and a radio that is always a sentence behind is
    // worse than one that skipped a line.
    while (this.queue.length > RADIO_QUEUE) this.queue.shift();
  }

  private say(key: string, index: number): void {
    const callout = CALLOUTS[key];
    if (!callout) return;

    this.recent.push({
      from: callout.from,
      text: callout.lines[index % callout.lines.length],
      age: 0,
    });
    while (this.recent.length > RADIO_LINES) this.recent.shift();
    this.sinceSpoke = 0;
    this.justSpoke = true;
  }
}
