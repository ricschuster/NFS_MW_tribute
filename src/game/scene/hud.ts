import {
  WIDTH,
  HEIGHT,
  MINIMAP_RANGE,
  MINIMAP_SIZE,
  ROADBLOCK_GAP,
  ROADBLOCK_MAX_LEAD,
  HEAT_LEVEL_COUNT,
  SEARCH_TIME,
  SEARCH_TIME_PER_LEVEL,
} from '../constants';
import { DISPLAY_MAX_KMH } from '../hudscale';
import type { CityWorld } from '../cityworld';

/**
 * The HUD over the 3D city (#89).
 *
 * Drawn on its own 2D canvas above the WebGL one, which is the layering the
 * stage already had. That separation is the point of the issue as much as the
 * minimap is: HUD work stops being entangled with rendering the world, and
 * neither can break the other by accident.
 *
 * The minimap is not decoration here. On a single track you always knew where
 * you were, because there was one road and you were on it. In a 5 x 4 km city
 * a player without a map is lost, and being lost is not the same as exploring.
 */
export class Hud {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(world: CityWorld): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();

    this.speed(world);
    this.nitrous(world);
    this.heat(world);
    this.minimap(world);
    this.takedowns(world);
    this.roadblock(world);
    this.cooldown(world);
    this.banners(world);

    ctx.restore();
  }

  private speed(world: CityWorld): void {
    const { ctx } = this;
    const kmh = Math.max(0, Math.round((Math.abs(world.speed) / world.maxSpeed) * DISPLAY_MAX_KMH));

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 62px ui-monospace, "SF Mono", Menlo, monospace';
    // Measured in the font it is drawn in, before switching to the small one:
    // measuring afterwards gives the label's own width and puts it on top of
    // the number.
    const width = ctx.measureText(String(kmh)).width;
    ctx.fillText(String(kmh), 34, HEIGHT - 52);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText('km/h', 34 + width + 12, HEIGHT - 52);
  }

  private nitrous(world: CityWorld): void {
    const { ctx } = this;
    const x = 34;
    const y = HEIGHT - 38;
    const width = 190;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x, y, width, 9);
    // Bright while it is lighting, dimmer while it refills, so the bar says
    // whether the boost is available rather than only how full it is.
    ctx.fillStyle = world.boosting ? '#7fe3ff' : '#3f7f97';
    ctx.fillRect(x, y, width * world.nitro, 9);
  }

  private heat(world: CityWorld): void {
    const { ctx } = this;
    const heat = world.police.heat;
    if (heat <= 0.01 && world.police.cops.length === 0) return;

    const x = WIDTH - 210;
    const y = HEIGHT - 46;

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('HEAT', x, y - 8);

    // Six pips rather than one bar: the level is what decides what turns up
    // next, so it is the number worth being able to read at a glance.
    const level = world.police.level;
    const pip = 176 / HEAT_LEVEL_COUNT;
    for (let i = 0; i < HEAT_LEVEL_COUNT; i++) {
      const lit = i < level;
      ctx.fillStyle = !lit
        ? 'rgba(255, 255, 255, 0.16)'
        : level >= 5
          ? '#ff5a45'
          : level >= 3
            ? '#ffa23a'
            : '#ffd166';
      ctx.fillRect(x + i * pip, y, pip - 4, 9);
    }
    // A sliver of the bar showing progress toward the next level.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(x, y + 11, 176 * heat, 2);
  }

  /**
   * The takedown tally (#94), under the heat pips.
   *
   * Shown only once you have one. A counter reading zero all game is a promise
   * the HUD is making on behalf of a mechanic the player has not met yet.
   */
  private takedowns(world: CityWorld): void {
    const { ctx } = this;
    if (world.takedowns === 0) return;

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('TAKEDOWNS', WIDTH - 34, HEIGHT - 68);
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 22px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillText(String(world.takedowns), WIDTH - 34, HEIGHT - 88);
  }

  /**
   * Streets around the car, turned so the way you are facing is up.
   *
   * North-up is easier to draw and worse to drive with: it makes you rotate
   * the map in your head at exactly the moment you are busy.
   */
  private minimap(world: CityWorld): void {
    const { ctx } = this;
    const radius = MINIMAP_SIZE / 2;
    const cx = WIDTH - radius - 26;
    const cy = radius + 26;
    const scale = radius / MINIMAP_RANGE;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.62)';
    ctx.fill();
    ctx.clip();

    ctx.translate(cx, cy);
    // Rotate the world under the car, not the car on the map.
    ctx.rotate(world.heading);

    const near = this.roadsAround(world);
    for (const road of near) {
      const a = world.city.nodes[road.a].pos;
      const b = world.city.nodes[road.b].pos;
      ctx.beginPath();
      ctx.moveTo((a.x - world.x) * scale, -(a.z - world.z) * scale);
      ctx.lineTo((b.x - world.x) * scale, -(b.z - world.z) * scale);
      ctx.lineWidth = road.class === 'street' ? 1.4 : road.class === 'interstate' ? 3.4 : 2.4;
      ctx.strokeStyle =
        road.class === 'interstate' || road.class === 'ramp'
          ? '#c887d6'
          : road.class === 'boulevard'
            ? '#e0a070'
            : road.class === 'arterial'
              ? '#d8cfa8'
              : '#7f8a92';
      ctx.stroke();
    }

    // The search area, which is the whole point of a cooldown being visible:
    // you cannot decide to leave a circle you cannot see.
    const area = world.police.search;
    if (area) {
      ctx.beginPath();
      ctx.arc((area.x - world.x) * scale, -(area.z - world.z) * scale, area.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 210, 90, 0.13)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 210, 90, 0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Roadblocks, gap and all. Drawing the hole matters as much as drawing the
    // wall: the decision is which one you are looking at.
    for (const block of world.police.roadblocks) {
      const bx = (block.x - world.x) * scale;
      const bz = -(block.z - world.z) * scale;
      if (Math.hypot(bx, bz) > radius + block.half * scale) continue;
      const ax = block.ax * scale;
      const az = -block.az * scale;
      ctx.strokeStyle = '#ff5a45';
      ctx.lineWidth = 3;
      const ends: [number, number][] =
        block.gap === null
          ? [[-block.half, block.half]]
          : [
              [-block.half, block.gap - ROADBLOCK_GAP],
              [block.gap + ROADBLOCK_GAP, block.half],
            ];
      for (const [from, to] of ends) {
        if (to <= from) continue;
        ctx.beginPath();
        ctx.moveTo(bx + ax * from, bz + az * from);
        ctx.lineTo(bx + ax * to, bz + az * to);
        ctx.stroke();
      }
    }

    for (const wreck of world.wrecks) {
      const dx = (wreck.x - world.x) * scale;
      const dz = -(wreck.z - world.z) * scale;
      if (Math.hypot(dx, dz) > radius) continue;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(dx - 2, dz - 2, 4, 4);
    }

    for (const cop of world.police.cops) {
      const dx = (cop.x - world.x) * scale;
      const dz = -(cop.z - world.z) * scale;
      if (Math.hypot(dx, dz) > radius) continue;
      const enforcer = cop.role === 'enforcer';
      ctx.beginPath();
      ctx.arc(dx, dz, enforcer ? 5 : 3.5, 0, Math.PI * 2);
      // Enforcers in red and bigger: the one coming the other way is the one
      // you need to have seen before you meet it (#61).
      ctx.fillStyle = enforcer ? '#ff5a45' : '#4d8bff';
      ctx.fill();
    }

    ctx.restore();

    // The car, drawn after the rotation so it always points up.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** Roads within the minimap's reach, via the spatial index rather than all of them. */
  private roadsAround(world: CityWorld) {
    const found = new Set<number>();
    const roads = [];
    const step = MINIMAP_RANGE / 2;
    for (let dx = -MINIMAP_RANGE; dx <= MINIMAP_RANGE; dx += step) {
      for (let dz = -MINIMAP_RANGE; dz <= MINIMAP_RANGE; dz += step) {
        for (const road of world.grid.roadsNear(world.x + dx, world.z + dz)) {
          if (found.has(road.id)) continue;
          found.add(road.id);
          roads.push(road);
        }
      }
    }
    return roads;
  }

  /**
   * A warning for a roadblock you are actually driving at (#59).
   *
   * Distance alone is not the test: one on the road behind you is not a thing
   * to warn about, and one on a street you are crossing is not either. It has
   * to be in front and roughly on your line.
   */
  private roadblock(world: CityWorld): void {
    const { ctx } = this;
    let closest = Infinity;
    for (const block of world.police.roadblocks) {
      const dx = block.x - world.x;
      const dz = block.z - world.z;
      const ahead = dx * Math.sin(world.heading) + dz * Math.cos(world.heading);
      if (ahead <= 0 || ahead > ROADBLOCK_MAX_LEAD) continue;
      const across = Math.abs(dx * Math.cos(world.heading) - dz * Math.sin(world.heading));
      if (across > block.half) continue;
      closest = Math.min(closest, ahead);
    }
    if (closest === Infinity) return;

    // Brighter the closer it is, so the warning says how much time is left as
    // well as that there is something there.
    ctx.globalAlpha = 0.45 + 0.55 * (1 - closest / ROADBLOCK_MAX_LEAD);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a45';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText('ROADBLOCK AHEAD', WIDTH / 2, 92);
    ctx.globalAlpha = 1;
  }

  /** The cooldown clock, and what it is waiting for. */
  private cooldown(world: CityWorld): void {
    const { ctx } = this;
    if (world.police.state !== 'cooldown') return;

    const area = world.police.search;
    const inside =
      area !== null && Math.hypot(world.x - area.x, world.z - area.z) < area.radius;

    ctx.textAlign = 'center';
    ctx.fillStyle = inside ? '#ffd166' : '#7fe3ff';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(inside ? 'SEARCH AREA - GET OUT' : 'COOLING DOWN', WIDTH / 2, 46);

    if (inside) return; // no bar while the clock is not running

    const full = SEARCH_TIME + SEARCH_TIME_PER_LEVEL * (world.police.level - 1);
    const width = 220;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(WIDTH / 2 - width / 2, 56, width, 6);
    ctx.fillStyle = '#7fe3ff';
    ctx.fillRect(
      WIDTH / 2 - width / 2,
      56,
      width * Math.max(0, 1 - world.police.searchLeft / full),
      6,
    );
  }

  private banners(world: CityWorld): void {
    const { ctx } = this;
    ctx.textAlign = 'center';

    if (world.busted) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#ff5a45';
      ctx.font = '800 78px system-ui, sans-serif';
      ctx.fillText('BUSTED', WIDTH / 2, HEIGHT / 2);
      return;
    }

    if (world.takedownFlash > 0) {
      ctx.globalAlpha = Math.min(1, world.takedownFlash);
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 56px system-ui, sans-serif';
      ctx.fillText('TAKEDOWN', WIDTH / 2, HEIGHT / 2 - 60);
      ctx.globalAlpha = 1;
    }

    if (world.escapedFlash > 0) {
      ctx.globalAlpha = Math.min(1, world.escapedFlash);
      ctx.fillStyle = '#7fe3ff';
      ctx.font = '800 60px system-ui, sans-serif';
      ctx.fillText('ESCAPED', WIDTH / 2, HEIGHT / 2 - 40);
      ctx.globalAlpha = 1;
    }
  }
}
