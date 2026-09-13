// Can every road actually be climbed? (#252)
//
// `cutAndFill` cuts and fills the ground under the authored network so a
// road's grade never exceeds `ROUTE_COUNTRY.cap` - the loosest of the three
// caps in `constants.ts`, and the one it is actually called with in
// `generate.ts` today, so it is the invariant cut-and-fill promises for every
// surface road regardless of class. This is the probe the issue asked for,
// in the manner of `npm run ramps`: a gate on that promise, not an
// instrument, because a grade nothing checks is a grade nobody notices break.
//
// Ramps and the interstate are excluded on purpose. They are not graded by
// `cutAndFill` at all - a ramp's climb is built directly at a designed grade
// (`GRADE_RUN`) and checked for climbability by `npm run ramps`, which is a
// different question (can a car get up it) from this one (does the ground
// meet the cap cut-and-fill is supposed to hold everywhere else).
//
// So are `street`-class roads. `cutAndFill` runs once, on `AUTHORED_ROADS`,
// before `localStreetsFor` (#287) ever lays a driveway - the private streets
// it grows at Ashford Point are never passed to it, so holding them to its
// cap tests a promise that was never made for them. Measured instead of
// asserted on: five, all under 10 m, at 10.5-16%, which is what a driveway
// following real terrain down a slope looks like, not necessarily a bug.
//
// Arterials are routed under the tighter `ROUTE_ARTERIAL.cap` (10%), but nothing
// after routing re-grades them the way `cutAndFill` does the authored network,
// so a routed connector can in principle come out steeper than the cap it was
// costed against - the router prices grade, it does not enforce it. That
// number is reported, not gated on, until it has actually been seen to fail:
// see CLAUDE.md's "the probe is wrong more often than the code" and this
// project's own habit of reporting a suspicious number before asserting on it.
//
// Usage:
//   npm run grades
//   npm run grades -- --trace 4    # print the worst 4 roads' own profile
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');
const M = K.UNITS_PER_METRE;

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const traceN = flag('--trace') === null ? 0 : Number(flag('--trace'));

const city = new CityWorld(undefined, { traffic: false, police: false }).city;

// The cap cut-and-fill is actually run with, plus the margin it aims inside of
// (`ROAD_CUT_MARGIN`) - so the gate matches what the code claims to guarantee,
// not a number invented for this probe.
const GATE_CAP = K.ROUTE_COUNTRY.cap * K.ROAD_CUT_MARGIN;
const ARTERIAL_CAP = K.ROUTE_ARTERIAL.cap;

const gradeOf = (road) => {
  const a = city.nodes[road.a];
  const b = city.nodes[road.b];
  return Math.abs(b.y - a.y) / road.length;
};

// The network `cutAndFill` actually touches: everything but ramps, the
// interstate, and the local streets it runs before (see above).
const graded = city.roads.filter((r) => r.class === 'arterial' || r.class === 'boulevard');
const driveways = city.roads.filter((r) => r.class === 'street');

const rows = graded.map((road) => ({ road, grade: gradeOf(road) })).sort((x, y) => y.grade - x.grade);

console.log('GRADE PROBE (#252)');
console.log(`  ${graded.length} graded roads (ramps, the interstate and ${driveways.length} driveways excluded)\n`);

const failed = rows.filter((r) => r.grade > GATE_CAP);
const overArterial = rows.filter((r) => r.road.class === 'arterial' && r.grade > ARTERIAL_CAP);

const worst = rows.slice(0, Math.max(traceN, Math.min(10, rows.length)));
const table = [['road', 'class', 'length', 'grade', 'over 13%?', 'over 10% (arterial)?']];
for (const { road, grade } of worst) {
  table.push([
    `#${road.id}`,
    road.class,
    `${Math.round(road.length / M)} m`,
    `${(grade * 100).toFixed(1)}%`,
    grade > GATE_CAP ? 'FAIL' : 'ok',
    road.class === 'arterial' ? (grade > ARTERIAL_CAP ? 'yes' : 'no') : '-',
  ]);
}
const w = table[0].map((_, i) => Math.max(...table.map((r) => r[i].length)));
for (const row of table) {
  console.log('  ' + row.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('   '));
}

console.log(
  `\n  ${graded.length - failed.length} of ${graded.length} roads are within the ${(GATE_CAP * 100).toFixed(1)}%` +
    ` cut-and-fill actually cuts and fills to.` +
    (failed.length ? `\n  ${failed.length} exceed it, which makes them roads on paper only.` : ''),
);
if (overArterial.length) {
  console.log(
    `  ${overArterial.length} arterial road(s) exceed the ${(ARTERIAL_CAP * 100).toFixed(0)}% they were routed` +
      ` under (reported, not gated - the router prices grade rather than enforcing it).`,
  );
}

if (driveways.length) {
  const worstDriveway = driveways.map(gradeOf).reduce((a, b) => Math.max(a, b), 0);
  const overCap = driveways.filter((r) => gradeOf(r) > GATE_CAP).length;
  console.log(
    `  ${driveways.length} driveways (not gated): worst is ${(worstDriveway * 100).toFixed(1)}%, ` +
      `${overCap} above the ${(GATE_CAP * 100).toFixed(1)}% surface-street cap.`,
  );
}

await server.close();
if (failed.length) process.exit(1);
