import './style.css';
import { WIDTH, HEIGHT } from './game/constants';

const found = document.getElementById('game');
if (!(found instanceof HTMLCanvasElement)) {
  throw new Error('#game canvas element not found');
}
// bind the narrowed type explicitly; the guard above does not narrow inside boot()
const canvas: HTMLCanvasElement = found;

canvas.width = WIDTH;
canvas.height = HEIGHT;

/**
 * Boot Kestrel Bay (ADR-0004, ADR-0006).
 *
 * There is one game now and it is the city, so `/` drives it and there is no
 * query string to know about. `?renderer=city` is the one thing that survives
 * the switch: it flies a free camera over the map with no car in it, which is
 * how the generator gets looked at rather than played. `&view=...` picks one
 * of the named viewpoints the screenshot tool uses.
 *
 * The WebGL canvas is inserted *behind* the 2D one, which stays as the HUD
 * layer and as the surface the touch controls are hit-tested against (#89).
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const free = params.get('renderer') === 'city';

  const stage = canvas.parentElement;
  if (!stage) throw new Error('#game has no stage to draw into');

  const [{ CityView }, { kestrelBay }] = await Promise.all([
    import('./game/scene/cityview'),
    import('./game/city/index'),
  ]);

  const gl = document.createElement('canvas');
  gl.id = 'game3d';
  stage.insertBefore(gl, canvas);
  canvas.style.background = 'transparent';

  const city = kestrelBay();
  const view = new CityView(gl, city);

  if (free) {
    canvas.style.display = 'none'; // nothing to overlay on the free camera
  } else {
    const [{ CityWorld }, { Hud }] = await Promise.all([
      import('./game/cityworld'),
      import('./game/scene/hud'),
    ]);
    const hud = new Hud(canvas.getContext('2d') as CanvasRenderingContext2D);
    const world = new CityWorld(city);
    // The HUD canvas doubles as the touch layer: it is where the on-screen
    // controls are drawn, and hit-testing has to happen in the same
    // coordinates as the drawing (#89).
    view.drive(world, hud, canvas);
    // A handle on the running sim, so the screenshot tools can set up a shot
    // that would otherwise have to be driven into by luck - a takedown, a
    // roadblock, a wreck. Dev only: this is scaffolding for looking at
    // things, not an API, and it is not in the built bundle.
    if (import.meta.env.DEV) {
      (globalThis as Record<string, unknown>).crosstown = { world, view, city };
    }
  }

  const named = params.get('view');
  const views = ['aerial', 'downtown', 'bridge', 'street', 'overpass'] as const;
  const picked = views.find((v) => v === named);
  if (picked) view.look(picked);

  /**
   * Match both canvases to whatever size the stage came out.
   *
   * The 3D renderer takes the size directly. The HUD is drawn in a fixed
   * 1024x640 space - every position in `hud.ts` and every touch region in
   * `touch.ts` is written in it - so rather than teach all of that about a
   * variable size, the *backing store* grows and a transform maps the fixed
   * space onto it. The drawing code does not know anything happened and the
   * HUD is crisp instead of a 1024-wide image stretched over a 2560-wide
   * monitor.
   *
   * `.stage` holds the aspect ratio at 1024/640, so the two scales are equal
   * and nothing is distorted. Setting `width` or `height` on a canvas resets
   * its 2D state, transform included, which is why the transform is applied
   * after and on every resize rather than once at boot.
   */
  const fit = () => {
    const width = stage.clientWidth || WIDTH;
    const height = stage.clientHeight || HEIGHT;
    view.resize(width, height);
    if (free) return;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  };
  fit();
  addEventListener('resize', fit);

  // F for fullscreen. Not routed through the game's own input handling: this
  // is the page, not the car, and `requestFullscreen` has to be called from a
  // user gesture or the browser refuses it.
  addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const host = stage.parentElement ?? stage;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.requestFullscreen?.().catch(() => {});
  });
  // Leaving fullscreen does not always fire `resize` on its own.
  document.addEventListener('fullscreenchange', fit);

  view.start();
}

/**
 * Register the service worker (#98).
 *
 * Production only: in dev the worker would sit in front of Vite's module
 * graph and serve yesterday's code back to you, which is a debugging session
 * nobody enjoys. It is deliberately fire-and-forget - a browser that refuses
 * it, or a page served over plain HTTP, gets the game without the offline part
 * rather than an error.
 */
function installWorker(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    // Relative, so it registers under whatever subpath the site is served
    // from and its scope covers the game rather than the whole origin.
    void navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline is a bonus, not a requirement.
    });
  });
}

installWorker();
void boot();
