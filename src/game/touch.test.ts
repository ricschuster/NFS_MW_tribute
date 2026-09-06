import { describe, it, expect, vi } from 'vitest';
import { TouchControls, CITY_BUTTONS, type TouchButton } from './touch';
import { WIDTH, HEIGHT } from './constants';

/**
 * A stand-in canvas. `TouchControls` only ever asks it for its rectangle and
 * for a place to hang listeners, so a whole DOM is not needed to test that a
 * finger in a spot presses the thing drawn in that spot.
 */
function fakeCanvas() {
  const listeners = new Map<string, (e: TouchEvent) => void>();
  const canvas = {
    addEventListener: (type: string, fn: (e: TouchEvent) => void) => listeners.set(type, fn),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }),
  } as unknown as HTMLCanvasElement;
  /** Put fingers at logical canvas coordinates. */
  const touch = (...points: { x: number; y: number }[]) => {
    listeners.get('touchstart')?.({
      type: 'touchstart',
      preventDefault: () => {},
      touches: points.map((p) => ({ clientX: p.x, clientY: p.y })),
    } as unknown as TouchEvent);
  };
  return { canvas, touch };
}

describe('on-screen controls', () => {
  it('stays out of the way until a finger arrives', () => {
    const { canvas } = fakeCanvas();
    const controls = new TouchControls(canvas, () => {});
    expect(controls.active).toBe(false);
  });

  it('presses the button under the finger', () => {
    const { canvas, touch } = fakeCanvas();
    const controls = new TouchControls(canvas, () => {}, CITY_BUTTONS());
    const up = controls.buttons.find((b) => b.id === 'up')!;

    touch({ x: up.x, y: up.y });
    expect(controls.active).toBe(true);
    expect(controls.up).toBe(true);
    expect(controls.left).toBe(false);
  });

  // Steering and accelerating at once is the whole reason it is multi-touch.
  it('takes two fingers at once', () => {
    const { canvas, touch } = fakeCanvas();
    const controls = new TouchControls(canvas, () => {}, CITY_BUTTONS());
    const up = controls.buttons.find((b) => b.id === 'up')!;
    const left = controls.buttons.find((b) => b.id === 'left')!;

    touch({ x: up.x, y: up.y }, { x: left.x, y: left.y });
    expect(controls.up).toBe(true);
    expect(controls.left).toBe(true);
  });

  it('lets the caller choose the set of buttons', () => {
    const { canvas } = fakeCanvas();
    const chosen: TouchButton[] = [
      { id: 'up', x: 200, y: 200, r: 40, label: '▲', down: false },
    ];
    expect(new TouchControls(canvas, () => {}, chosen).buttons).toHaveLength(1);
    // The set the game actually ships needs a way to open the map and the
    // Quick Wheel without a keyboard (#89).
    const ids = new TouchControls(canvas, () => {}, CITY_BUTTONS()).buttons.map((b) => b.id);
    expect(ids).toContain('wheel');
    expect(ids).toContain('map');
  });

  it('keeps every button clear of every other', () => {
    const buttons = CITY_BUTTONS();
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        const gap = Math.hypot(buttons[i].x - buttons[j].x, buttons[i].y - buttons[j].y);
        expect(gap).toBeGreaterThan(buttons[i].r + buttons[j].r - 1);
      }
    }
  });

  it('keeps every button on the screen', () => {
    for (const button of CITY_BUTTONS()) {
      expect(button.x - button.r).toBeGreaterThanOrEqual(0);
      expect(button.x + button.r).toBeLessThanOrEqual(WIDTH);
      expect(button.y - button.r).toBeGreaterThanOrEqual(0);
      expect(button.y + button.r).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it('answers a touch on a region something published', () => {
    const { canvas, touch } = fakeCanvas();
    const controls = new TouchControls(canvas, () => {}, CITY_BUTTONS());
    controls.regions = [{ id: 'wheel:2', x: 300, y: 200, w: 400, h: 30 }];

    touch({ x: 400, y: 210 });
    expect(controls.on('wheel:2')).toBe(true);
    touch({ x: 400, y: 260 });
    expect(controls.on('wheel:2')).toBe(false);
  });

  // A panel drawn over a control must never steal the control's touch.
  it('lets a button win over a region under it', () => {
    const { canvas, touch } = fakeCanvas();
    const controls = new TouchControls(canvas, () => {}, CITY_BUTTONS());
    const up = controls.buttons.find((b) => b.id === 'up')!;
    controls.regions = [{ id: 'wheel:0', x: 0, y: 0, w: WIDTH, h: HEIGHT }];

    touch({ x: up.x, y: up.y });
    expect(controls.up).toBe(true);
    expect(controls.on('wheel:0')).toBe(false);
  });

  it('tells whoever is listening that a gesture happened', () => {
    const { canvas, touch } = fakeCanvas();
    const started = vi.fn();
    new TouchControls(canvas, started, CITY_BUTTONS());
    touch({ x: 10, y: 10 });
    expect(started).toHaveBeenCalled();
  });
});
