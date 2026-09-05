/** Tracks the current pressed state of the four drive keys (arrows + WASD). */
export class Input {
  left = false;
  right = false;
  up = false;
  down = false;
  confirm = false;
  nitro = false;
  pause = false; // P / Esc (game-level, not part of InputState)
  restart = false; // R (game-level)

  constructor() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
  }

  private onKey(e: KeyboardEvent, pressed: boolean): void {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.left = pressed;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.right = pressed;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.up = pressed;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.down = pressed;
        break;
      case 'Enter':
      case ' ':
        this.confirm = pressed;
        break;
      case 'Shift':
        this.nitro = pressed;
        break;
      case 'p':
      case 'P':
      case 'Escape':
        this.pause = pressed;
        break;
      case 'r':
      case 'R':
        this.restart = pressed;
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
