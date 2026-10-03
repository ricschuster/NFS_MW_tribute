import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { insideOrNear } from './city/aprons';
import { distanceToSegment, inWater } from './city/grid';
import { PLAN_DISTRICTS, inArea } from './city/plan';

const M = UNITS_PER_METRE;
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
const ashford = PLAN_DISTRICTS.find((a) => a.name === 'Ashford Point')!;
const homes = city.setPieces.filter((p) => ['house', 'villa', 'manor'].includes(p.kind) && inArea(ashford.poly, p.at));
const surface = city.roads.filter((r) => r.class !== 'interstate' && r.class !== 'ramp' && city.nodes[r.a].level === 'surface');
const kerb = (at: { x: number; z: number }) =>
  Math.min(...surface.map((r) => {
    const a = city.nodes[r.a].pos, b = city.nodes[r.b].pos;
    return distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) - r.width / 2;
  })) / M;

describe('Ashford Point (#293)', () => {
  it('is estates: mostly villas, some houses, a few manors', () => {
    const count = (kind: string) => homes.filter((h) => h.kind === kind).length;
    expect(count('villa')).toBeGreaterThan(count('house'));
    expect(count('manor')).toBeGreaterThan(0);
    expect(count('manor')).toBeLessThan(count('house'));
  });

  // The issue itself: seven houses had no road within 250 m.
  it('puts every house on a road', () => {
    for (const home of homes) expect(kerb(home.at)).toBeLessThan(80);
  });

  it('gives every villa and manor a drive that reaches its lane', () => {
    for (const home of homes.filter((h) => h.kind !== 'house')) {
      const drive = city.drives.find((d) => insideOrNear(d.outline, home.at.x, home.at.z, 40 * M));
      expect(drive).toBeDefined();
    }
    // A villa's drive ends in the lane, not short of it; a manor has at least
    // one of its two that does (its forecourt is at the house).
    const reaches = (d: (typeof city.drives)[number]) => Math.min(...d.outline.map(kerb)) < 0.5;
    for (const drive of city.drives.filter((d) => d.look === 'cobbles')) expect(reaches(drive)).toBe(true);
    for (const manor of homes.filter((h) => h.kind === 'manor')) {
      expect(city.drives.some((d) => d.look === 'gravel' && reaches(d) && insideOrNear(d.outline, manor.at.x, manor.at.z, 60 * M))).toBe(true);
    }
  });

  it('has three ponds, and nothing standing in them', () => {
    const ponds = city.water.filter((w) => w.kind === 'pond' && inArea(ashford.poly, w.outline[0]));
    expect(ponds).toHaveLength(3);
    for (const piece of city.setPieces.filter((p) => inArea(ashford.poly, p.at))) expect(inWater(city, piece.at.x, piece.at.z)).toBe(false);
  });

  it('keeps lamps and trees off the drives', () => {
    // Ashford's own: Tidewater Park's promenade (2026-10-02) is a drive too, and the coast road's lamps stand on it.
    const drives = city.drives.filter((d) => inArea(ashford.poly, d.outline[0]));
    const onDrive = (at: { x: number; z: number }) => drives.some((d) => insideOrNear(d.outline, at.x, at.z, M));
    expect(city.furniture.filter((p) => p.kind === 'lamp' && onDrive(p.at))).toHaveLength(0);
    expect(city.setPieces.filter((p) => (p.kind === 'tree' || p.kind === 'street-tree') && onDrive(p.at))).toHaveLength(0);
  });

  it('runs a coast sprint and a circuit through the estates', () => {
    expect(city.routes.find((r) => r.name === 'Ashford Coast Sprint')?.kind).toBe('sprint');
    expect(city.routes.find((r) => r.name === 'Estates Circuit')?.kind).toBe('circuit');
  });
});
