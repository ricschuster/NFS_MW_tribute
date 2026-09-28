import { BANNER_QUEUE, BANNER_TIME } from './constants';
import type { PursuitState } from './citypolice';

export type BannerKind = 'pursuit' | 'cooldown' | 'heatUp' | 'heatDown' | 'escaped' | 'busted';

export interface Banner {
  kind: BannerKind;
  text: string;
  /** Seconds it has left on screen. */
  left: number;
}

/** What the banners watch, once a step. */
export interface PursuitSnapshot {
  state: PursuitState;
  level: number;
  busted: boolean;
  /** True on the step the pursuit is shaken off, which `state` alone cannot tell from a reset. */
  escaped: boolean;
}

/**
 * A short line at the top of the screen when the pursuit changes (#356).
 *
 * The reference game says every change out loud - LOSE THE COPS, ENTERED
 * COOLDOWN, HEAT LEVEL DECREASED, PURSUIT EVADED - and Crosstown said almost
 * none of them: the state was on the minimap for anyone looking at it, which
 * at 250 km/h is nobody.
 *
 * Watched rather than told, the way `radio.ts` is: the pursuit already says
 * what it is doing, and comparing one step's snapshot with the last is one
 * place that can be wrong instead of six call sites that can forget. One at a
 * time, because two banners at once is neither read; queued rather than
 * dropped, because heat going up the step after the pursuit opens is two
 * things that both happened. The queue is short and a newer banner of a kind
 * already waiting replaces it, so a burst of heat changes ends on the level it
 * got to rather than reciting every one.
 */
export class Banners {
  current: Banner | null = null;
  private readonly queue: Banner[] = [];
  private last: PursuitSnapshot | null = null;

  update(dt: number, now: PursuitSnapshot): void {
    if (this.current) {
      this.current.left -= dt;
      if (this.current.left <= 0) this.current = null;
    }

    const was = this.last;
    this.last = { ...now };
    if (was) this.watch(was, now);

    if (!this.current && this.queue.length > 0) this.current = this.queue.shift() ?? null;
  }

  /** Drop everything, for a world that has just been put somewhere else. */
  clear(): void {
    this.current = null;
    this.queue.length = 0;
  }

  private watch(was: PursuitSnapshot, now: PursuitSnapshot): void {
    if (now.busted && !was.busted) {
      // A bust ends every other conversation.
      this.queue.length = 0;
      this.current = null;
      this.raise('busted', 'BUSTED');
      return;
    }
    if (now.escaped) {
      // What was waiting is about a pursuit that is over.
      this.queue.length = 0;
      this.current = null;
      this.raise('escaped', 'PURSUIT EVADED');
      return;
    }
    if (was.state === 'clear' && now.state !== 'clear') this.raise('pursuit', 'LOSE THE COPS');
    if (was.state === 'pursuit' && now.state === 'cooldown') this.raise('cooldown', 'ENTERED COOLDOWN');

    // Only inside a pursuit: heat bleeding away in free roam is not news.
    if (now.state === 'clear' || was.state === 'clear') return;
    if (now.level > was.level) this.raise('heatUp', `HEAT LEVEL ${now.level}`);
    if (now.level < was.level) this.raise('heatDown', 'HEAT LEVEL DECREASED');
  }

  private raise(kind: BannerKind, text: string): void {
    const banner = { kind, text, left: BANNER_TIME };
    // Heat moving one way replaces heat moving the other: up-then-down in one
    // burst is a level that did not change, and saying both is noise.
    const same = (k: BannerKind) => k === kind || (kind.startsWith('heat') && k.startsWith('heat'));
    const waiting = this.queue.findIndex((b) => same(b.kind));
    if (waiting >= 0) {
      this.queue[waiting] = banner;
      return;
    }
    if (this.current && same(this.current.kind)) {
      this.current = banner;
      return;
    }
    this.queue.push(banner);
    if (this.queue.length > BANNER_QUEUE) this.queue.shift();
  }
}
