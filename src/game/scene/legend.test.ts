import { describe, it, expect } from 'vitest';
import { MAP_LEGEND } from './legend';

/**
 * The rule #181 set, checked rather than remembered (#215).
 *
 * It was set, written down, and then broken four times over by one colour -
 * and the way it broke is instructive: every addition was individually fine,
 * because each new thing did pick a shape nothing else had. Nothing was looking
 * at the colour column.
 */
describe('the map legend', () => {
  it('never gives two things the same colour and the same shape', () => {
    const seen = new Map<string, string>();
    for (const [label, colour, shape] of MAP_LEGEND) {
      const key = `${colour}|${shape}`;
      const clash = seen.get(key);
      expect(
        clash,
        `"${label}" and "${clash}" are both a ${colour} ${shape}: one of them has to change`,
      ).toBeUndefined();
      seen.set(key, label);
    }
  });

  it('does not let one colour carry more than three meanings', () => {
    // Three is already generous and is only tolerable because cyan's three are
    // one idea - where the events are, and where you said you were going. Four
    // was the state a playtester could not read.
    const uses = new Map<string, string[]>();
    for (const [label, colour] of MAP_LEGEND) {
      uses.set(colour, [...(uses.get(colour) ?? []), label]);
    }
    for (const [colour, labels] of uses) {
      expect(labels.length, `${colour} means ${labels.length} things: ${labels.join(', ')}`)
        .toBeLessThanOrEqual(3);
    }
  });

  it('says something about everything it lists', () => {
    for (const [label, colour, shape] of MAP_LEGEND) {
      expect(label.length).toBeGreaterThan(2);
      expect(colour).toMatch(/^(#[0-9a-f]{6}|rgba\()/i);
      expect(['dot', 'line', 'cross', 'ring', 'target']).toContain(shape);
    }
  });

  it('stays short enough to fit its panel', () => {
    // The panel is 208 px wide and the text starts 34 px in at 12 px, so about
    // 27 characters. A label that overflows draws over the map it explains.
    for (const [label] of MAP_LEGEND) {
      expect(label.length, `"${label}" is too long for the legend panel`).toBeLessThanOrEqual(28);
    }
  });
});
