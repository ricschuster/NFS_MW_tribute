import { STORY_GAP, STORY_HOLD } from './constants';

/**
 * A light story, told in captions over live driving (#362).
 *
 * The reference tells its story as you drive - "you beat your first Most
 * Wanted driver, but this is just the start" - and nothing stops for it. This
 * is that: a line at a few key moments, one at a time, under the action and
 * never a cutscene. Seen lines are saved, so a moment is marked once for good
 * rather than once a session.
 *
 * Watched rather than told, like the radio and the banners: it is handed what
 * the world looks like each step and works out what changed, so there is one
 * place that can be wrong instead of a call at every place something happens.
 * The first look is only a baseline: a save that loads with three rivals
 * beaten has not just beaten three.
 *
 * The lines are a table because they are content. Original, and about Kestrel
 * Bay: nothing here is the reference's.
 */
export interface StorySnapshot {
  /** Cars owned, the starter included. */
  cars: number;
  /** "#10 VEX" once a rival will race you, else null. */
  ready: string | null;
  /** Rivals beaten and claimed. */
  beaten: number;
  /** How many there are. */
  rivals: number;
  /** The one just beaten, by name, for the line about them. */
  lastBeaten: string | null;
}

const LINES: Record<string, string> = {
  'first-find':
    'Somebody left that one sitting there with the keys in. In Kestrel Bay that is an invitation.',
  'first-rival':
    'Ten drivers run this town, and one of them has heard your name. Their line is on the map.',
  beaten: '{rival} is off the list. {left} to go, and every one of them knows it now.',
  'beaten-last-but-one': '{rival} is done. One name left above yours.',
  top: 'Nobody left above you. The whole bay is watching the mirror for your lights.',
};

export class Story {
  /** The line on screen, if any. */
  current: { text: string; left: number } | null = null;
  /** Which moments have been marked, for good. Saved. */
  readonly seen = new Set<string>();

  private readonly queue: string[] = [];
  private was: StorySnapshot | null = null;
  private sinceShown = STORY_GAP;

  update(dt: number, now: StorySnapshot): void {
    if (this.current) {
      this.current.left -= dt;
      if (this.current.left <= 0) this.current = null;
    }
    this.sinceShown += dt;

    const was = this.was;
    this.was = { ...now };
    if (was) this.watch(was, now);

    if (!this.current && this.queue.length > 0 && this.sinceShown >= STORY_GAP) {
      this.current = { text: this.queue.shift()!, left: STORY_HOLD };
      this.sinceShown = 0;
    }
  }

  private watch(was: StorySnapshot, now: StorySnapshot): void {
    if (now.cars > was.cars) this.tell('first-find', LINES['first-find']);
    if (now.ready && !was.ready) this.tell('first-rival', LINES['first-rival']);
    if (now.beaten > was.beaten && now.lastBeaten) {
      const left = now.rivals - now.beaten;
      const line =
        left === 0 ? LINES.top : left === 1 ? LINES['beaten-last-but-one'] : LINES.beaten;
      this.tell(
        left === 0 ? 'top' : `beaten-${now.beaten}`,
        line.replace('{rival}', now.lastBeaten).replace('{left}', String(left)),
      );
    }
  }

  /** Queue `text` for moment `key`, unless that moment has been marked already. */
  private tell(key: string, text: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.queue.push(text);
  }
}
