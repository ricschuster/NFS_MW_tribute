// Is this network buildable?
//
// The editor will let you draw anything: up a cliff, out to sea, ending in mid
// air. The generator will not - a road too steep is a road the car cannot climb,
// a water crossing longer than `CITY_MAX_BRIDGE` is not a bridge, and a road
// whose ends touch nothing is pruned the moment it is laid.
//
// So this is the gate between the drawing and the city. It asks four questions
// of a hand-edited network, all of them ones the generator will ask later and
// none of them visible on the map:
//
//   1. Where does it cross water, and can that crossing be built?
//   2. How steep does it get?
//   3. Do both ends join something?
//   4. Is the whole network still one piece, with every place on it?
//
// Usage:
//   npm run roadcheck <saved.json>            # the table
//   npm run roadcheck <saved.json> -- --draw  # and screenshots/roadcheck*.png
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const draw = argv.includes('--draw');
const savedPath = argv.find((a) => !a.startsWith('--'));
if (!savedPath) {
  console.error('usage: npm run roadcheck <saved.json>');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(savedPath, 'utf8'));
const saved = raw.roads ? raw : raw.data ?? raw;
const base = JSON.parse(readFileSync('screenshots/roads.json', 'utf8'));

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { makeTerrain, groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { shapeForPlaces } = await server.ssrLoadModule('/src/game/city/places.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const C = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_LAND_STREAM, CITY_WIDTH, CITY_DEPTH, UNITS_PER_METRE, CITY_MAX_BRIDGE, ROUTE_ARTERIAL, ROUTE_COUNTRY } = C;

const bounds = {
  minX: -CITY_WIDTH / 2,
  minZ: -CITY_DEPTH / 2,
  maxX: CITY_WIDTH / 2,
  maxZ: CITY_DEPTH / 2,
};
const water = makeWater(new Rng(CITY_LAND_STREAM), bounds);
const terrain = makeTerrain(CITY_LAND_STREAM, bounds, water);
// The places dig into the ground before any road is laid, so a road to the
// quarry has to be measured against the quarry rather than the hill it replaced.
shapeForPlaces(terrain, water);
await server.close();

const m = (v) => v * UNITS_PER_METRE;
const toM = (v) => v / UNITS_PER_METRE;
const maxBridge = toM(CITY_MAX_BRIDGE);
const STEP = 10; // metres between samples along a road
const JOIN = 45; // metres: how close an end has to be to count as joined

const wet = (x, z) => water.isWater(m(x), m(z));
const ground = (x, z) => toM(groundAt(terrain, m(x), m(z)));

/** Walk a road at a fixed step, so long segments are not skipped over. */
function* along(points) {
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const span = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(span / STEP));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      yield [ax + (bx - ax) * t, az + (bz - az) * t, span / steps];
    }
  }
  yield [...points[points.length - 1], 0];
}

function survey(points) {
  let length = 0;
  let overWater = 0;
  let steepest = 0;
  let steepAt = null;
  const crossings = [];
  let run = null;
  let previous = null;

  for (const [x, z, step] of along(points)) {
    const isWet = wet(x, z);
    length += step;
    if (isWet) {
      overWater += step;
      run = run ? { ...run, length: run.length + step } : { at: [Math.round(x), Math.round(z)], length: step };
    } else if (run) {
      crossings.push(run);
      run = null;
    }
    // Grade is meaningless across water - there is no ground under a bridge.
    if (!isWet && previous && !previous.wet && step > 0) {
      const rise = Math.abs(ground(x, z) - previous.h);
      const grade = rise / Math.max(1, previous.step);
      if (grade > steepest) {
        steepest = grade;
        steepAt = [Math.round(x), Math.round(z)];
      }
    }
    previous = { h: isWet ? 0 : ground(x, z), wet: isWet, step };
  }
  if (run) crossings.push(run);
  return { length, overWater, crossings, steepest, steepAt };
}

/** Closest approach from a point to any of these roads, in metres. */
function nearestRoad(at, roads, skipId) {
  let best = Infinity;
  let who = null;
  for (const r of roads) {
    if (r.id === skipId) continue;
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1];
      const [bx, bz] = r.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const span = dx * dx + dz * dz;
      const t = span < 1e-9 ? 0 : Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - az) * dz) / span));
      const d = Math.hypot(ax + dx * t - at[0], az + dz * t - at[1]);
      if (d < best) {
        best = d;
        who = r.id;
      }
    }
  }
  return { d: best, who };
}

const wasThere = new Set(base.roads.map((r) => r.id));
const drawn = saved.roads.filter((r) => !wasThere.has(r.id));

console.log(`checking ${saved.roads.length} roads · ${drawn.length} drawn by hand\n`);
console.log(`  street grade cap ${Math.round(ROUTE_ARTERIAL.cap * 100)}%  ·  country ${Math.round(ROUTE_COUNTRY.cap * 100)}%  ·  longest bridge ${Math.round(maxBridge)} m\n`);

let problems = 0;
const marks = [];
for (const r of drawn) {
  const s = survey(r.points);
  const ends = [r.points[0], r.points[r.points.length - 1]].map((at) => nearestRoad(at, saved.roads, r.id));
  const notes = [];

  for (const crossing of s.crossings) {
    if (crossing.length > maxBridge) {
      notes.push(`✗ ${Math.round(crossing.length)} m of open water at (${crossing.at[0]}, ${crossing.at[1]}) - too long to bridge`);
      marks.push({ at: crossing.at, kind: 'bad', text: `${r.id}: ${Math.round(crossing.length)} m of water` });
      problems++;
    } else {
      notes.push(`· crosses ${Math.round(crossing.length)} m of water at (${crossing.at[0]}, ${crossing.at[1]}) - a bridge`);
    }
  }
  if (s.steepest > ROUTE_COUNTRY.cap) {
    notes.push(`✗ ${Math.round(s.steepest * 100)}% at (${s.steepAt[0]}, ${s.steepAt[1]}) - steeper than any road may be`);
    marks.push({ at: s.steepAt, kind: 'bad', text: `${r.id}: ${Math.round(s.steepest * 100)}%` });
    problems++;
  } else if (s.steepest > ROUTE_ARTERIAL.cap) {
    notes.push(`! ${Math.round(s.steepest * 100)}% at (${s.steepAt[0]}, ${s.steepAt[1]}) - a country road, not a street`);
  }
  // Both ends loose is a road that is not part of the network and gets pruned.
  // One end loose is a **dead end**, which is a different thing and often a
  // deliberate one - a pier is a dead end on purpose (ADR-0009 rule 6). Saying
  // "would be pruned" for either was wrong and worth not repeating: a road is
  // connected if it touches the network anywhere along it, not at its tips.
  const loose = ends.filter((e) => e.d > JOIN).length;
  if (loose === 2) {
    notes.push(`✗ neither end joins a road - nearest is ${Math.round(Math.min(...ends.map((e) => e.d)))} m away, so this would be pruned`);
    problems++;
  } else if (loose === 1) {
    const which = ends[0].d > JOIN ? 'start' : 'end';
    const gap = Math.round(Math.max(...ends.map((e) => e.d)));
    notes.push(`! its ${which} is a dead end - ${gap} m of open ground to the nearest road`);
    const at = ends[0].d > JOIN ? r.points[0] : r.points[r.points.length - 1];
    marks.push({ at: [Math.round(at[0]), Math.round(at[1])], kind: 'warn', text: `${r.id}: ${gap} m dead end` });
  }

  console.log(
    `${r.id}  ${(s.length / 1000).toFixed(2)} km` +
      (s.overWater > 0 ? `  ${Math.round((s.overWater / s.length) * 100)}% over water` : '') +
      `  max ${Math.round(s.steepest * 100)}%`,
  );
  for (const note of notes) console.log(`    ${note}`);
  if (!notes.length) console.log('    ✓ on land, drivable, joined at both ends');
}

// Is it still one network, and is every place on it? Roads are joined where
// they pass within `JOIN` of each other, which is what the generator's junction
// splitting does with a tolerance.
const ids = saved.roads.map((r) => r.id);
const parent = new Map(ids.map((id) => [id, id]));
const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
const union = (a, b) => parent.set(find(a), find(b));
for (let i = 0; i < saved.roads.length; i++) {
  for (let j = i + 1; j < saved.roads.length; j++) {
    const a = saved.roads[i];
    const b = saved.roads[j];
    if (find(a.id) === find(b.id)) continue;
    const near = a.points.some((p) => nearestRoad(p, [b]).d <= JOIN);
    if (near) union(a.id, b.id);
  }
}
const parts = new Map();
for (const id of ids) {
  const root = find(id);
  parts.set(root, (parts.get(root) ?? 0) + 1);
}
const ranked = [...parts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nnetwork: ${ranked.length} piece${ranked.length === 1 ? '' : 's'}`);
if (ranked.length > 1) {
  console.log(`  largest holds ${ranked[0][1]} roads; the rest would be pruned:`);
  for (const [root, n] of ranked.slice(1)) {
    const members = ids.filter((id) => find(id) === root);
    console.log(`    ${n} road${n === 1 ? '' : 's'}: ${members.join(', ')}`);
  }
}

const main = ranked[0]?.[0];
console.log('\nplaces:');
for (const place of base.places) {
  const near = nearestRoad(place.at, saved.roads);
  const on = near.who && find(near.who) === main;
  console.log(
    `  ${place.name.padEnd(16)} nearest road ${near.who ?? '-'} at ${Math.round(near.d)} m  ` +
      `${on ? '✓ on the main network' : '✗ NOT on the main network'}`,
  );
}
console.log(`\n${problems === 0 ? 'no blocking problems' : `${problems} blocking problem${problems === 1 ? '' : 's'}`}`);

// And the same question of the roads the *generator* made, because a cap
// nothing already obeys is not a standard a hand-drawn road should be held to.
// The channels are cut with deliberately steep sides - "coast gentle and
// riverbanks steep" (#269), a 140 m bank against a 1400 m shore ramp - so every
// crossing on the map lands on one.
{
  const generated = saved.roads.filter((r) => wasThere.has(r.id));
  let over = 0;
  let worstGrade = 0;
  let worstId = null;
  const grades = [];
  for (const r of generated) {
    const g = survey(r.points).steepest;
    grades.push(g);
    if (g > ROUTE_COUNTRY.cap) over++;
    if (g > worstGrade) {
      worstGrade = g;
      worstId = r.id;
    }
  }
  grades.sort((a, b) => a - b);
  const median = grades[Math.floor(grades.length / 2)] ?? 0;
  console.log(
    `\nfor comparison, the ${generated.length} generated roads: median ${Math.round(median * 100)}%, ` +
      `worst ${Math.round(worstGrade * 100)}% (${worstId}), ` +
      `${over} over the ${Math.round(ROUTE_COUNTRY.cap * 100)}% cap`,
  );
}

// ---------------------------------------------------------------------------
// Draw what the check found.
//
// A table says a road is 44% at a point; a picture says it comes ashore straight
// up the bank. Every real defect in this map so far has been found by looking at
// it, so a checker that can only print numbers is half a tool.
if (draw) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const kept = new Set(saved.roads.map((r) => r.id));
  const gone = base.roads.filter((r) => !kept.has(r.id));

  /** One picture, over a window of the world given in metres. */
  function render(win, width, title) {
    const scale = width / (win.maxX - win.minX);
    const heightPx = Math.round((win.maxZ - win.minZ) * scale);
    // -x to the right, +z up: the repo's own convention (scene/mapping.ts).
    const sx = (x) => ((win.maxX - x) * scale).toFixed(1);
    const sy = (z) => ((win.maxZ - z) * scale).toFixed(1);
    const parts = [`<rect width="${width}" height="${heightPx}" fill="#14414f"/>`];

    // The ground, at the sample spacing the terrain is worth drawing at here.
    const step = Math.max(12, Math.round((win.maxX - win.minX) / width * 3));
    for (let z = win.minZ; z < win.maxZ; z += step) {
      for (let x = win.minX; x < win.maxX; x += step) {
        if (wet(x, z)) continue;
        const h = ground(x, z);
        const t = Math.max(0, Math.min(1, h / 120));
        const west = wet(x - step, z) ? h : ground(x - step, z);
        const east = wet(x + step, z) ? h : ground(x + step, z);
        const lit = Math.max(-34, Math.min(34, ((west - east) / (step * 2)) * 190));
        const r = Math.round(Math.max(0, Math.min(255, 88 + t * 140 + lit)));
        const g = Math.round(Math.max(0, Math.min(255, 124 + t * 90 + lit)));
        const b = Math.round(Math.max(0, Math.min(255, 86 + t * 58 + lit)));
        parts.push(
          `<rect x="${sx(x + step)}" y="${sy(z + step)}" width="${(step * scale + 1).toFixed(1)}" ` +
            `height="${(step * scale + 1).toFixed(1)}" fill="rgb(${r},${g},${b})"/>`,
        );
      }
    }

    const path = (points) => points.map(([x, z], i) => `${i ? 'L' : 'M'}${sx(x)},${sy(z)}`).join(' ');
    const wide = Math.max(1.6, scale * 26);
    // Deleted first and faintest: they are context for what was taken out, not
    // part of the network any more.
    for (const r of gone) {
      parts.push(`<path d="${path(r.points)}" fill="none" stroke="#e9615a" stroke-opacity="0.5" stroke-width="${wide}" stroke-dasharray="${wide * 2} ${wide * 1.6}"/>`);
    }
    for (const r of saved.roads) {
      const isNew = !wasThere.has(r.id);
      parts.push(
        `<path d="${path(r.points)}" fill="none" stroke="${isNew ? '#7fd6a2' : '#e07a3f'}" ` +
          `stroke-width="${isNew ? wide * 1.15 : wide}" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }
    for (const place of base.places) {
      parts.push(`<circle cx="${sx(place.at[0])}" cy="${sy(place.at[1])}" r="5" fill="#ffd54f" stroke="#1b1b1b" stroke-width="1.5"/>`);
      parts.push(
        `<text x="${sx(place.at[0])}" y="${(Number(sy(place.at[1])) - 11).toFixed(1)}" fill="#ffd54f" stroke="#101a1e" ` +
          `stroke-width="3" paint-order="stroke" font-family="system-ui, sans-serif" font-size="14" font-weight="600" ` +
          `text-anchor="middle">${place.name}</text>`,
      );
    }
    for (const mark of marks) {
      const colour = mark.kind === 'bad' ? '#ff4d4d' : '#ffc247';
      parts.push(`<circle cx="${sx(mark.at[0])}" cy="${sy(mark.at[1])}" r="13" fill="none" stroke="${colour}" stroke-width="3"/>`);
      parts.push(
        `<text x="${sx(mark.at[0])}" y="${(Number(sy(mark.at[1])) + 30).toFixed(1)}" fill="${colour}" stroke="#101a1e" ` +
          `stroke-width="3.5" paint-order="stroke" font-family="ui-monospace, monospace" font-size="13" font-weight="600" ` +
          `text-anchor="middle">${mark.text}</text>`,
      );
    }
    parts.push(
      `<text x="14" y="${heightPx - 14}" fill="#dae8ec" stroke="#101a1e" stroke-width="3.5" paint-order="stroke" ` +
        `font-family="ui-monospace, monospace" font-size="15">${title}</text>`,
    );
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${heightPx}" viewBox="0 0 ${width} ${heightPx}">${parts.join('')}</svg>`, width, height: heightPx };
  }

  const world = {
    minX: toM(bounds.minX), maxX: toM(bounds.maxX),
    minZ: toM(bounds.minZ), maxZ: toM(bounds.maxZ),
  };
  const shots = [
    { name: 'roadcheck', ...render(world, 1400, `${saved.roads.length} roads · ${drawn.length} drawn (green) · ${gone.length} deleted (dashed red)`) },
  ];
  // A close-up on the first thing that will not build, because the reason a
  // road fails is always local.
  const worst = marks.find((mk) => mk.kind === 'bad');
  if (worst) {
    const reach = 700;
    shots.push({
      name: 'roadcheck-detail',
      ...render(
        { minX: worst.at[0] - reach, maxX: worst.at[0] + reach, minZ: worst.at[1] - reach, maxZ: worst.at[1] + reach },
        900,
        `${worst.text} — 1.4 km across`,
      ),
    });
  }

  mkdirSync('screenshots', { recursive: true });
  for (const shot of shots) writeFileSync(`screenshots/${shot.name}.svg`, shot.svg);
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
      await page.setContent(`<body style="margin:0">${shot.svg}</body>`);
      await page.screenshot({ path: `screenshots/${shot.name}.png` });
      await page.close();
      console.log(`wrote screenshots/${shot.name}.png`);
    }
    await browser.close();
  } catch {
    console.log('wrote SVGs only (no Chromium for a PNG)');
  }
}
