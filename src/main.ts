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

  const fit = () => view.resize(stage.clientWidth || WIDTH, stage.clientHeight || HEIGHT);
  fit();
  addEventListener('resize', fit);
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
