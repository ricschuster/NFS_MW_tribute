import { describe, it, expect } from 'vitest';
import { Story, type StorySnapshot } from './story';
import { STORY_GAP, STORY_HOLD } from './constants';

const start: StorySnapshot = { cars: 1, ready: null, beaten: 0, rivals: 10, lastBeaten: null };
const step = (story: Story, now: StorySnapshot, seconds = 0.1) => story.update(seconds, now);

// The story, in captions over live driving (#362).
describe('the story', () => {
  it('says nothing on the first look, whatever it sees', () => {
    const story = new Story();
    step(story, { cars: 4, ready: '#7 NYX', beaten: 3, rivals: 10, lastBeaten: 'Halo' });
    expect(story.current).toBeNull();
  });

  it('marks the first car found, once', () => {
    const story = new Story();
    step(story, start);
    step(story, { ...start, cars: 2 });
    expect(story.current?.text).toContain('keys');
    story.current = null;
    step(story, { ...start, cars: 3 }, STORY_GAP + 0.1);
    expect(story.current).toBeNull();
  });

  it('names the rival beaten and how many are left, one line at a time', () => {
    const story = new Story();
    step(story, start);
    step(story, { ...start, ready: '#10 VEX' });
    step(story, { ...start, ready: '#9 CINDER', beaten: 1, lastBeaten: 'Vex' });
    expect(story.current?.text).toContain('map');
    // The second waits for the first to go, and a gap.
    step(story, { ...start, ready: '#9 CINDER', beaten: 1, lastBeaten: 'Vex' }, STORY_HOLD + STORY_GAP);
    step(story, { ...start, ready: '#9 CINDER', beaten: 1, lastBeaten: 'Vex' }, 0.1);
    expect(story.current?.text).toContain('Vex');
    expect(story.current?.text).toContain('9 to go');
  });

  it('ends the ladder on its own line', () => {
    const story = new Story();
    step(story, { ...start, beaten: 9 });
    step(story, { ...start, beaten: 10, lastBeaten: 'Reaper' });
    expect(story.current?.text).toContain('Nobody left above you');
  });

  it('does not tell a moment it has already told', () => {
    const story = new Story();
    story.seen.add('first-find');
    step(story, start);
    step(story, { ...start, cars: 2 });
    expect(story.current).toBeNull();
  });
});
