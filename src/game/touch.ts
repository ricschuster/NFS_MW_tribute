import { WIDTH, HEIGHT } from './constants';

export type ControlId =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'nitro'
  | 'confirm'
  | 'wheel'
  | 'map'
  | 'look';

export interface TouchButton {
  id: ControlId;
  x: number;
  y: number;
  r: number;
  label: string;
  down: boolean;
}

/**
 * A rectangle a touch can land on, published by whatever drew it (#89).
 *
 * The buttons below are fixed and known here; the Quick Wheel's rows are not -
 * their number and their position depend on what is in the wheel this frame.
 * So the thing that draws them says where they are, and this only has to
 * answer whether a finger is on one.
 */
export interface TouchRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * On-screen touch controls drawn on the canvas. Buttons are laid out in logical
 * canvas coordinates and hit-tested against live touches (multi-touch, so you
 * can steer and accelerate at once). Inert until the first touch, so desktop is
 * unaffected. `onGesture` fires on the first touch (to start audio).
 *
 * The set of buttons is passed in rather than built here, because the thing
 * that knows what the game needs on screen is the caller (#89). Kestrel Bay's
 * set is `CITY_BUTTONS` below.
 */
export class TouchControls {
  active = false;
  readonly buttons: TouchButton[];
  /** Rectangles set per frame by whatever drew them. Cleared when nothing did. */
  regions: TouchRegion[] = [];
  /** Which of those a finger is on right now. */
  readonly touching = new Set<string>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onGesture: () => void,
    buttons: TouchButton[] = CITY_BUTTONS(),
  ) {
    this.buttons = buttons;
    const opts: AddEventListenerOptions = { passive: false };
    canvas.addEventListener('touchstart', this.handle, opts);
    canvas.addEventListener('touchmove', this.handle, opts);
    canvas.addEventListener('touchend', this.handle, opts);
    canvas.addEventListener('touchcancel', this.handle, opts);
  }

  get left() {
    return this.pressed('left');
  }
  get right() {
    return this.pressed('right');
  }
  get up() {
    return this.pressed('up');
  }
  get down() {
    return this.pressed('down');
  }
  get nitro() {
    return this.pressed('nitro');
  }
  get confirm() {
    return this.pressed('confirm');
  }

  /** Is a finger on the region with this id? */
  on(id: string): boolean {
    return this.touching.has(id);
  }

  pressed(id: ControlId): boolean {
    return this.buttons.find((b) => b.id === id)?.down ?? false;
  }

  private handle = (e: TouchEvent): void => {
    e.preventDefault();
    if (!this.active) this.active = true;
    if (e.type === 'touchstart') this.onGesture();

    for (const b of this.buttons) b.down = false;
    this.touching.clear();

    const rect = this.canvas.getBoundingClientRect();
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      const x = ((t.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((t.clientY - rect.top) / rect.height) * HEIGHT;

      let hit = false;
      for (const b of this.buttons) {
        const dx = x - b.x;
        const dy = y - b.y;
        if (dx * dx + dy * dy <= b.r * b.r) {
          b.down = true;
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // Regions are tested after the buttons, so a panel drawn over a control
      // never steals the control's touch.
      for (const region of this.regions) {
        if (x < region.x || x > region.x + region.w) continue;
        if (y < region.y || y > region.y + region.h) continue;
        this.touching.add(region.id);
        break;
      }
    }
  };
}

/**
 * Kestrel Bay's set (#89).
 *
 * The six a car needs - steering, throttle, brake, nitrous and confirm - plus
 * the three the city added: the Quick Wheel, the collection map and a glance
 * behind. They are held rather than tapped, like the keys they stand in for,
 * so nothing needs a second state to remember.
 *
 * Steering sits low and left, throttle low and right, and everything else runs
 * up the right edge - out of the way of a thumb that is busy.
 */
export const CITY_BUTTONS = (): TouchButton[] => [
  { id: 'left', x: 92, y: HEIGHT - 78, r: 54, label: '◀', down: false },
  { id: 'right', x: 216, y: HEIGHT - 78, r: 54, label: '▶', down: false },
  { id: 'up', x: WIDTH - 214, y: HEIGHT - 78, r: 60, label: '▲', down: false },
  { id: 'down', x: WIDTH - 88, y: HEIGHT - 78, r: 50, label: '▮', down: false },
  { id: 'nitro', x: WIDTH - 152, y: HEIGHT - 176, r: 42, label: 'N2O', down: false },
  { id: 'confirm', x: WIDTH / 2, y: HEIGHT - 78, r: 42, label: '⏎', down: false },
  { id: 'wheel', x: WIDTH - 52, y: HEIGHT - 268, r: 34, label: 'Q', down: false },
  { id: 'map', x: WIDTH - 52, y: HEIGHT - 196, r: 34, label: 'MAP', down: false },
  // Up the left edge, mirroring the wheel and the map on the right, and low
  // enough to still be a thumb's reach from the steering.
  { id: 'look', x: 52, y: HEIGHT - 268, r: 34, label: 'B', down: false },
];
