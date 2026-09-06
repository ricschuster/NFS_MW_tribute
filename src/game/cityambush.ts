import { AMBUSH_RESULT_HOLD } from './constants';

/**
 * An ambush (#92).
 *
 * You are dropped stationary, already surrounded, with one job: get out. There
 * is no route, no rival and no finish line - success is simply reaching the
 * cleared state by the ordinary cooldown route, and failure is being busted.
 *
 * It is a scoreboard over the pursuit rather than a system of its own, which
 * is the whole reason it is worth having: the pursuit is the best thing the
 * city has, and every other event asks you to stop being chased in order to
 * play it.
 */
export type AmbushState = 'idle' | 'running' | 'escaped' | 'busted';

export class CityAmbush {
  state: AmbushState = 'idle';
  /** The heat it sprang at. What it pays scales off this. */
  level = 0;
  /** Seconds since it sprang, which is the score. */
  elapsed = 0;
  /** Seconds the result banner has left. */
  hold = 0;
  /** True on the step it ends, so the world pays for it once. */
  justEnded = false;

  begin(level: number): void {
    this.state = 'running';
    this.level = level;
    this.elapsed = 0;
    this.justEnded = false;
  }

  abandon(): void {
    this.state = 'idle';
    this.justEnded = false;
  }

  /**
   * Watch the pursuit and call it.
   *
   * `clear` and `busted` come straight off `CityPolice`: an ambush deliberately
   * has no idea how an escape works, it only knows one happened.
   */
  update(dt: number, clear: boolean, busted: boolean): void {
    this.justEnded = false;

    if (this.state === 'escaped' || this.state === 'busted') {
      this.hold -= dt;
      if (this.hold <= 0) this.state = 'idle';
      return;
    }
    if (this.state !== 'running') return;

    this.elapsed += dt;
    if (busted) this.end('busted');
    else if (clear) this.end('escaped');
  }

  private end(how: 'escaped' | 'busted'): void {
    this.state = how;
    this.hold = AMBUSH_RESULT_HOLD;
    this.justEnded = true;
  }
}
