import './style.css';
import { Game } from './game/game';
import type { Scene3D } from './game/scene/scene3d';
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
 * `?renderer=3d` draws the world with three.js instead of the projected-segment
 * renderer, on a second canvas behind this one (ADR-0004, issue #81). Both run
 * against the same `World`, so the game stays playable either way while the
 * renderer is rebuilt.
 *
 * `?renderer=city` is neither: it flies a camera around generated Kestrel Bay
 * with no game in it at all (#84). The car cannot be driven there until #86
 * gives it a place in the world, so this is how the city gets looked at in the
 * meantime. `&view=aerial|downtown|bridge|street` picks a named viewpoint.
 *
 * three.js is imported dynamically so it stays out of the bundle everyone else
 * downloads: a static import puts 500 kB in front of players who never ask for
 * the 3D renderer.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const renderer = params.get('renderer');

  if (renderer === 'city' || renderer === 'drive') {
    const stage = canvas.parentElement;
    if (!stage) throw new Error('#game has no stage to draw into');

    const [{ CityView }, { kestrelBay }] = await Promise.all([
      import('./game/scene/cityview'),
      import('./game/city/index'),
    ]);

    const gl = document.createElement('canvas');
    gl.id = 'game3d';
    stage.insertBefore(gl, canvas);
    // The 2D canvas stays, as the HUD layer over the world - which is the
    // layering the stage was already built for.
    canvas.style.background = 'transparent';

    const city = kestrelBay();
    const view = new CityView(gl, city);

    if (renderer === 'drive') {
      const [{ CityWorld }, { Hud }] = await Promise.all([
        import('./game/cityworld'),
        import('./game/scene/hud'),
      ]);
      const hud = new Hud(canvas.getContext('2d') as CanvasRenderingContext2D);
      const world = new CityWorld(city);
      view.drive(world, hud);
      // A handle on the running sim, so the screenshot tools can set up a shot
      // that would otherwise have to be driven into by luck - a takedown, a
      // roadblock, a wreck. Dev only: this is scaffolding for looking at
      // things, not an API, and it is not in the built bundle.
      if (import.meta.env.DEV) {
        (globalThis as Record<string, unknown>).crosstown = { world, view, city };
      }
    } else {
      canvas.style.display = 'none'; // nothing to overlay on the free camera
    }

    const named = params.get('view');
    const views = ['aerial', 'downtown', 'bridge', 'street', 'overpass'] as const;
    const picked = views.find((v) => v === named);
    if (picked) view.look(picked);

    const fit = () => view.resize(stage.clientWidth || WIDTH, stage.clientHeight || HEIGHT);
    fit();
    addEventListener('resize', fit);
    view.start();
    return;
  }

  const use3d = renderer === '3d';
  let scene3d: Scene3D | null = null;

  if (use3d) {
    const stage = canvas.parentElement;
    if (!stage) throw new Error('#game has no stage to draw into');

    const { Scene3D } = await import('./game/scene/scene3d');
    const gl = document.createElement('canvas');
    gl.id = 'game3d';
    stage.insertBefore(gl, canvas);

    scene3d = new Scene3D(gl);
    canvas.style.background = 'transparent'; // the HUD layer must not hide the world

    const fit = () => scene3d?.resize(stage.clientWidth || WIDTH, stage.clientHeight || HEIGHT);
    fit();
    addEventListener('resize', fit);
  }

  new Game(canvas, scene3d).start();
}

void boot();
