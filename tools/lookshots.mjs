// Shared by looksheet and looktime (#579): the shots, and the one function that
// stands the car at each of them. `place` runs inside the page, so it must stay
// self-contained (no imports, no closures over this file).
export const SHOTS = [
  { name: 'downtown', ref: 'maxresdefault-400676361.jpg', place: 'downtown', hour: 13 },
  { name: 'woods', ref: 'maxresdefault-1603548640.jpg', place: 'woods', hour: 13 },
  { name: 'industrial', ref: 'maxresdefault-535176847.jpg', place: 'industrial', hour: 13 },
  { name: 'wall', ref: 'Screenshot_20261003_052037.png', place: 'wall', hour: 13 },
  { name: 'tunnel', ref: 'Screenshot_20261003_050209.png', place: 'tunnel', hour: 13 },
  { name: 'haze', ref: 'Screenshot_20261003_050141.png', place: 'haze', hour: 13 },
  // Bearing is the sun's at that hour: the 17:00 and 19:00 keys are -0.4 and
  // -1.2 (daylight.ts), so 18:00 is -0.8. Keep the two in step.
  { name: 'sunhaze', ref: 'Screenshot_20261003_050141.png', place: 'sunhaze', hour: 18, bearing: -0.8 },
  { name: 'terrace', ref: 'none', place: 'terrace', hour: 13 },
  { name: 'skyline', ref: 'none', place: 'skyline', hour: 13 },
  { name: 'dusk', ref: 'Need-for-Speed-Most-Wanted_11-624779118.jpg', place: 'downtown', hour: 19.5 },
];

export function place({ place, hour, bearing }) {
  const { world } = globalThis.crosstown;
  const M = 135;
  const none = { up: false, down: false, left: false, right: false, nitro: false, confirm: false };
  const city = world.city;
  const ends = (r) => [city.nodes[r.a].pos, city.nodes[r.b].pos];
  const longest = (pred) =>
    city.roads.filter((r) => !r.bridge && pred(r)).sort((a, b) => b.length - a.length)[0];
  let x, z, heading;
  // Stand on the road nearest `hub`, `back` metres short of it, facing it.
  const approach = (hub, back) => {
    let best = null;
    for (const r of city.roads) {
      if (r.bridge) continue;
      const [a, b] = ends(r);
      const len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      const t = Math.max(0, Math.min(1, ((hub.x - a.x) * (b.x - a.x) + (hub.z - a.z) * (b.z - a.z)) / len2));
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      const d = Math.hypot(hub.x - px, hub.z - pz);
      if (!best || d < best.d) best = { d, a, b, px, pz };
    }
    const dx = best.b.x - best.a.x;
    const dz = best.b.z - best.a.z;
    const sign = dx * (hub.x - best.px) + dz * (hub.z - best.pz) >= 0 ? 1 : -1;
    const len = Math.hypot(dx, dz);
    heading = Math.atan2(dx * sign, dz * sign);
    x = best.px - ((dx * sign) / len) * back * M;
    z = best.pz - ((dz * sign) / len) * back * M;
  };
  if (place === 'skyline') {
    // Towers from a distance, for crowns and mullions: the most towers within 80 m of one.
    const towers = city.setPieces.filter((p) => p.kind === 'tower');
    const near = (p) => towers.filter((q) => Math.hypot(q.at.x - p.at.x, q.at.z - p.at.z) < 80 * M).length;
    approach(towers.sort((a, b) => near(b) - near(a))[0].at, 110);
  } else if (place === 'terrace') {
    // The building kit (#583): the densest run of street-wall buildings
    // (shops, flats, townhouses, lofts), seen from the road in front of it.
    const wall = city.setPieces.filter((p) => ['shop', 'flat', 'townhouse', 'loft', 'midrise', 'apartment'].includes(p.kind));
    const near = (p) => wall.filter((q) => Math.hypot(q.at.x - p.at.x, q.at.z - p.at.z) < 50 * M).length;
    approach(wall.sort((a, b) => near(b) - near(a))[0].at, 45);
  } else if (place === 'industrial') {
    // The silo with the most silos around it, then the road nearest them.
    const silos = city.setPieces.filter((p) => p.kind === 'silo');
    const near = (p) => silos.filter((q) => Math.hypot(q.at.x - p.at.x, q.at.z - p.at.z) < 60 * M).length;
    approach(silos.sort((a, b) => near(b) - near(a))[0].at, 70);
  } else if (place === 'wall') {
    // A warehouse wall close to the road, for weathering: the one nearest any road.
    const gap = (p) =>
      Math.min(
        ...city.roads.filter((r) => !r.bridge).map((r) => {
          const [a, b] = ends(r);
          const len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1;
          const t = Math.max(0, Math.min(1, ((p.at.x - a.x) * (b.x - a.x) + (p.at.z - a.z) * (b.z - a.z)) / len2));
          return Math.hypot(p.at.x - (a.x + (b.x - a.x) * t), p.at.z - (a.z + (b.z - a.z) * t));
        }),
      );
    const wall = city.setPieces
      .filter((p) => p.kind === 'warehouse')
      .map((p) => ({ p, d: gap(p) }))
      .filter((w) => w.d > 12 * M)
      .sort((u, v) => u.d - v.d)[0];
    approach(wall.p.at, 40);
  } else if (place === 'tunnel') {
    const road = longest((r) => city.nodes[r.a].level === 'tunnel' && city.nodes[r.b].level === 'tunnel');
    const [a, b] = ends(road);
    x = a.x + (b.x - a.x) * 0.3;
    z = a.z + (b.z - a.z) * 0.3;
    heading = Math.atan2(b.x - a.x, b.z - a.z);
    world.y = city.nodes[road.a].y;
  } else if (place === 'sunhaze') {
    // Facing the sun with downtown's skyline between us and it: stand on the
    // road nearest a point 1.7 downtown-radii from its centre on the far side
    // from the sun (clear of the towers), then face the sun's bearing.
    const dt = city.roads.filter((r) => !r.bridge && r.district === 'downtown');
    const pts = dt.flatMap(ends);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    const reach = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.z - cz)));
    const hub = { x: cx - Math.sin(bearing) * reach * 1.7, z: cz - Math.cos(bearing) * reach * 1.7 };
    // Among the 25 roads nearest that point take the one running most nearly along
    // the sun's bearing, so the view down it is not a side wall.
    const sx = Math.sin(bearing);
    const sz = Math.cos(bearing);
    const near = city.roads
      .filter((r) => !r.bridge && r.length > 20 * M)
      .map((r) => {
        const [a, b] = ends(r);
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const align = Math.abs(((b.x - a.x) * sx + (b.z - a.z) * sz) / len);
        return { a, b, align, d: Math.hypot((a.x + b.x) / 2 - hub.x, (a.z + b.z) / 2 - hub.z) };
      })
      .sort((p, q) => p.d - q.d)
      .slice(0, 25)
      .sort((p, q) => q.align - p.align)[0];
    x = (near.a.x + near.b.x) / 2;
    z = (near.a.z + near.b.z) / 2;
    heading = bearing;
  } else if (place === 'haze') {
    // The middle of the longest bridge, looking along it: open water and the
    // longest view the city has at street level.
    const road = city.roads.filter((r) => r.bridge && city.nodes[r.a].level === 'surface').sort((p, q) => q.length - p.length)[0];
    const [a, b] = ends(road);
    x = (a.x + b.x) / 2;
    z = (a.z + b.z) / 2;
    heading = Math.atan2(b.x - a.x, b.z - a.z);
    world.y = (city.nodes[road.a].y + city.nodes[road.b].y) / 2;
  } else {
    let road;
    let at = 0.3;
    if (place === 'woods') {
      // The Highmoor Park street with the most trees around its middle.
      const trees = city.setPieces.filter((p) => p.kind === 'tree');
      const score = (r) => {
        const [a, b] = ends(r);
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        return trees.filter((t) => Math.hypot(t.at.x - mx, t.at.z - mz) < 40 * M).length;
      };
      road = city.roads
        .filter((r) => !r.bridge && r.district === 'park' && r.length > 120 * M)
        .sort((p, q) => score(q) - score(p))[0];
      at = 0.15;
    } else {
      road = longest((r) => r.district === 'downtown');
    }
    const [a, b] = ends(road);
    x = a.x + (b.x - a.x) * at;
    z = a.z + (b.z - a.z) * at;
    heading = Math.atan2(b.x - a.x, b.z - a.z);
  }
  world.x = x;
  world.z = z;
  world.heading = heading;
  world.recover();
  world.heading = heading;
  world.speed = 0;
  world.crashFlash = 0;
  globalThis.crosstown.view.director.started = false;
  for (let t = 0; t < 2; t += 1 / 60) world.step(1 / 60, none);
  world.hour = hour;
}
