import type { CityWorld } from './cityworld';
import type { CityView } from './scene/cityview';
import { Telemetry } from './telemetry';

/**
 * F9 starts and stops a telemetry recording (#347); stopping saves it as a
 * JSON file. `main.ts` loads it in dev, or behind `?debug` in a built game. It
 * is the page's business rather than the car's, like F for fullscreen, so it
 * is not routed through the game's input.
 *
 * A red REC badge sits over the stage while it runs, because a recording you
 * forgot you had started, or thought you had, is an hour of driving lost.
 * Sampled on a wall-clock second rather than a sim step: a sample is what the
 * player saw at that moment, and the sim runs in steps the player never sees.
 */
export function recordOnF9(world: CityWorld, view: CityView, stage: HTMLElement): void {
  const badge = document.createElement('div');
  badge.textContent = 'REC';
  badge.style.cssText =
    'position:absolute;top:8px;right:8px;padding:2px 8px;font:bold 14px sans-serif;' +
    'color:#fff;background:#c0392b;border-radius:3px;display:none;z-index:10;pointer-events:none';
  stage.appendChild(badge);

  let recording: Telemetry | null = null;
  let timer = 0;
  let began = 0;

  const stop = () => {
    if (!recording) return;
    clearInterval(timer);
    badge.style.display = 'none';
    const file = recording.file();
    recording = null;
    if (file.samples.length === 0) return;
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `crosstown-telemetry-${file.started.replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  addEventListener('keydown', (e) => {
    if (e.key !== 'F9') return;
    e.preventDefault();
    if (recording) {
      stop();
      return;
    }
    const current = new Telemetry();
    recording = current;
    began = performance.now();
    badge.style.display = 'block';
    timer = window.setInterval(() => {
      current.sample(world, (performance.now() - began) / 1000, (...box) => view.screenHeight(...box));
      badge.textContent = `REC ${Math.floor(current.length / 60)}:${String(current.length % 60).padStart(2, '0')}`;
    }, 1000);
  });

  // A tab closed mid-recording loses it: ask first.
  addEventListener('beforeunload', (e) => {
    if (recording && recording.length > 0) e.preventDefault();
  });
}
