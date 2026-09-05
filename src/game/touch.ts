import { WIDTH, HEIGHT } from './constants';

export type ControlId = 'left' | 'right' | 'up' | 'down' | 'nitro' | 'confirm';

export interface TouchButton {
  id: ControlId;
  x: number;
  y: number;
  r: number;
  label: string;
  down: boolean;
}

/**
 * On-screen touch controls drawn on the canvas. Buttons are laid out in logical
 * canvas coordinates and hit-tested against live touches (multi-touch, so you
 * can steer and accelerate at once). Inert until the first touch, so desktop is
 * unaffected. `onGesture` fires on the first touch (to start audio).
 */
export class TouchControls {
  active = false;
  readonly buttons: TouchButton[] = [
    { id: 'left', x: 100, y: HEIGHT - 84, r: 56, label: '◀', down: false },
    { id: 'right', x: 232, y: HEIGHT - 84, r: 56, label: '▶', down: false },
    { id: 'up', x: WIDTH - 236, y: HEIGHT - 84, r: 64, label: '▲', down: false },
    { id: 'down', x: WIDTH - 96, y: HEIGHT - 84, r: 52, label: '▮', down: false },
    { id: 'nitro', x: WIDTH - 168, y: HEIGHT - 188, r: 44, label: 'N2O', down: false },
    { id: 'confirm', x: WIDTH / 2, y: HEIGHT - 150, r: 40, label: '⏎', down: false },
  ];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onGesture: () => void,
  ) {
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

  private pressed(id: ControlId): boolean {
    return this.buttons.find((b) => b.id === id)?.down ?? false;
  }

  private handle = (e: TouchEvent): void => {
    e.preventDefault();
    if (!this.active) this.active = true;
    if (e.type === 'touchstart') this.onGesture();

    for (const b of this.buttons) b.down = false;

    const rect = this.canvas.getBoundingClientRect();
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      const x = ((t.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((t.clientY - rect.top) / rect.height) * HEIGHT;
      for (const b of this.buttons) {
        const dx = x - b.x;
        const dy = y - b.y;
        if (dx * dx + dy * dy <= b.r * b.r) {
          b.down = true;
          break;
        }
      }
    }
  };
}
