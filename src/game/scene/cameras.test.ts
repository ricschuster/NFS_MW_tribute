import { describe, it, expect } from 'vitest';
import { CameraDirector } from './cameras';
import {
  CHASE_FOV,
  CHASE_FOV_FAST,
  CRASH_HOLD,
  FLYOVER_SETTLE,
  FLYOVER_TIME,
  INTRO_HOLD,
  TAKEDOWN_HOLD,
  TAKEDOWN_SLOWMO,
} from '../constants';
import type { CityWorld } from '../cityworld';

/**
 * The director only reads a handful of fields off the world, so it can be
 * driven with a stand-in. That is worth keeping true: a camera that needed a
 * whole city to decide where to point could not be tested at all.
 */
function fakeWorld(over: Partial<CityWorld> = {}): CityWorld {
  return {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    speed: 0,
    maxSpeed: 12000,
    crashFlash: 0,
    takedownFlash: 0,
    lastTakedown: null,
    ...over,
  } as CityWorld;
}

const run = (director: CameraDirector, seconds: number, world: CityWorld, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) director.update(step, world);
};

describe('the camera director', () => {
  it('opens on the intro and hands over to the chase camera', () => {
    const director = new CameraDirector();
    expect(director.mode).toBe('intro');
    run(director, INTRO_HOLD + 0.2, fakeWorld());
    expect(director.mode).toBe('chase');
  });

  it('cuts to the crash camera on an impact, then comes back', () => {
    const director = new CameraDirector();
    run(director, INTRO_HOLD + 0.2, fakeWorld());

    director.update(1 / 60, fakeWorld({ crashFlash: 1 }));
    expect(director.mode).toBe('crash');

    run(director, CRASH_HOLD + 0.2, fakeWorld({ crashFlash: 0 }));
    expect(director.mode).toBe('chase');
  });

  // crashFlash decays rather than being a pulse, so a director watching its
  // level instead of its edge re-cuts on every frame of a single crash and the
  // camera never recovers.
  it('treats a crash as one event, not one per frame', () => {
    const director = new CameraDirector();
    run(director, INTRO_HOLD + 0.2, fakeWorld());

    const crashing = fakeWorld({ crashFlash: 1 });
    for (let i = 0; i < 200; i++) director.update(1 / 60, crashing);
    expect(director.mode).toBe('chase');
  });

  it('glances behind, then looks forward again', () => {
    const director = new CameraDirector();
    run(director, INTRO_HOLD + 0.2, fakeWorld());

    director.glanceBack();
    director.update(1 / 60, fakeWorld());
    expect(director.mode).toBe('lookBack');

    run(director, 1.5, fakeWorld());
    expect(director.mode).toBe('chase');
  });

  it('widens the field of view with speed', () => {
    const slow = new CameraDirector();
    run(slow, INTRO_HOLD + 1, fakeWorld({ speed: 0 }));
    const parked = slow.update(1 / 60, fakeWorld({ speed: 0 })).fov;

    const quick = new CameraDirector();
    run(quick, INTRO_HOLD + 3, fakeWorld({ speed: 12000 }));
    const flat = quick.update(1 / 60, fakeWorld({ speed: 12000 })).fov;

    expect(parked).toBeCloseTo(CHASE_FOV, 0);
    expect(flat).toBeGreaterThan(parked);
    expect(flat).toBeLessThanOrEqual(CHASE_FOV_FAST);
  });

  it('sits behind the car, whichever way it is pointing', () => {
    const director = new CameraDirector(true);
    const world = fakeWorld({ heading: Math.PI / 2 }); // facing +x
    run(director, 2, world);
    const shot = director.update(1 / 60, world);
    // Behind a car facing +x is -x.
    expect(shot.position.x).toBeLessThan(0);
    expect(shot.position.y).toBeGreaterThan(0);
  });

  // Reduced motion is a preference, not a lesser mode: it gets the plain chase
  // camera, which is exactly what the projected renderer always had.
  // A camera that only knows where it wants to be will want to be inside a
  // wall, and the moments it leaves the car are crashes - which happen against
  // things.
  it('will not sit inside a building', () => {
    const building = {
      footprint: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
      height: 5000,
    };
    const world = fakeWorld({
      grid: { buildingsNear: () => [building] },
    } as unknown as Partial<CityWorld>);

    const director = new CameraDirector(true);
    for (let i = 0; i < 120; i++) director.update(1 / 60, world);
    const shot = director.update(1 / 60, world);

    const inside =
      shot.position.x > -1000 &&
      shot.position.x < 1000 &&
      shot.position.z > -1000 &&
      shot.position.z < 1000 &&
      shot.position.y < 5000;
    expect(inside).toBe(false);
  });

  it('holds still for anyone who asked it to', () => {
    const director = new CameraDirector(true);
    expect(director.mode).toBe('chase');

    director.glanceBack();
    director.update(1 / 60, fakeWorld({ crashFlash: 1 }));
    expect(director.mode).toBe('chase');
  });

  describe('takedowns (#94)', () => {
    const wrecked = () =>
      fakeWorld({ takedownFlash: 2, lastTakedown: { x: 100, y: 0, z: 100 } });

    it('cuts to the wreck, runs slow, then comes back at normal speed', () => {
      const director = new CameraDirector();
      run(director, INTRO_HOLD + 0.2, fakeWorld());
      expect(director.timeScale).toBe(1);

      director.update(1 / 60, wrecked());
      expect(director.mode).toBe('takedown');
      expect(director.timeScale).toBe(TAKEDOWN_SLOWMO);

      run(director, TAKEDOWN_HOLD + 0.2, wrecked());
      expect(director.mode).toBe('chase');
      expect(director.timeScale).toBe(1);
    });

    // The flash decays like crashFlash does, so a director watching its level
    // rather than its edge would re-cut every frame and never let go.
    it('treats a takedown as one event, not one per frame', () => {
      const director = new CameraDirector();
      run(director, INTRO_HOLD + 0.2, fakeWorld());
      const held = wrecked();
      for (let i = 0; i < 300; i++) director.update(1 / 60, held);
      expect(director.mode).toBe('chase');
    });

    // A takedown sets crashFlash too, since it is a crash. The wreck is the
    // shot worth having, so it has to win.
    it('outranks the crash camera it arrives with', () => {
      const director = new CameraDirector();
      run(director, INTRO_HOLD + 0.2, fakeWorld());
      director.update(
        1 / 60,
        fakeWorld({ crashFlash: 1, takedownFlash: 2, lastTakedown: { x: 0, y: 0, z: 0 } }),
      );
      expect(director.mode).toBe('takedown');
    });

    it('honours reduced motion: no cut, and no slow motion', () => {
      const calm = new CameraDirector(true);
      calm.update(1 / 60, wrecked());
      expect(calm.mode).toBe('chase');
      expect(calm.timeScale).toBe(1);
    });
  });

  describe('the flyover before a circuit (#359)', () => {
    const square = [
      { x: 0, z: 0 },
      { x: 4000, z: 0 },
      { x: 4000, z: 4000 },
      { x: 0, z: 4000 },
    ];
    const racing = (state: string, kind = 'circuit') =>
      fakeWorld({ race: { state, route: { kind, points: square } } } as unknown as Partial<CityWorld>);
    const settled = () => {
      const director = new CameraDirector();
      run(director, INTRO_HOLD + 0.2, racing('idle'));
      return director;
    };

    it('flies the course on the lights, holding the world still, then hands back', () => {
      const director = settled();
      director.update(1 / 60, racing('countdown'));
      expect(director.mode).toBe('flyover');
      expect(director.timeScale).toBe(0);

      run(director, FLYOVER_TIME + FLYOVER_SETTLE + 0.2, racing('countdown'));
      expect(director.mode).toBe('chase');
      expect(director.timeScale).toBe(1);
    });

    it('goes over the course, not round the car', () => {
      const director = settled();
      director.update(1 / 60, racing('countdown'));
      run(director, FLYOVER_TIME / 2, racing('countdown'));
      const shot = director.update(1 / 60, racing('countdown'));
      // Halfway round a square lap from the origin is its far corner.
      expect(Math.hypot(shot.position.x, shot.position.z)).toBeGreaterThan(3000);
      expect(shot.position.y).toBeGreaterThan(0);
    });

    it('skips straight to the chase camera', () => {
      const director = settled();
      director.update(1 / 60, racing('countdown'));
      director.skipFlyover();
      director.update(1 / 60, racing('countdown'));
      expect(director.mode).toBe('chase');
      expect(director.timeScale).toBe(1);
    });

    it('plays once per start, not again for the same countdown', () => {
      const director = settled();
      director.update(1 / 60, racing('countdown'));
      director.skipFlyover();
      run(director, 1, racing('countdown'));
      expect(director.mode).toBe('chase');
    });

    it('is not flown before a speed run, or with reduced motion', () => {
      const director = settled();
      director.update(1 / 60, racing('countdown', 'speedrun'));
      expect(director.mode).toBe('chase');

      const calm = new CameraDirector(true);
      calm.update(1 / 60, racing('countdown'));
      expect(calm.mode).toBe('chase');
      expect(calm.timeScale).toBe(1);
    });
  });
});
