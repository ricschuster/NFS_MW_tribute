import {
  WIDTH,
  HEIGHT,
  MINIMAP_RANGE,
  MINIMAP_SIZE,
  ROADBLOCK_GAP,
  ROADBLOCK_MAX_LEAD,
  SHRED_TIME,
  REP_POPUP_TIME,
  COLLECTIBLE_HINT_RANGE,
  REFERENCE_TOP_SPEED,
  FIND_FLASH,
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
  /** Held while the collection map is open (#93). Set by whoever reads input. */
  showMap = false;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(world: CityWorld): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();

    // The collection map takes the whole screen. Drawing the driving HUD under
    // it leaves the speedo and the minimap ghosting through the panel, which
    // reads as a rendering fault rather than as a map.
    if (this.showMap) {
      this.map(world);
      ctx.restore();
      return;
    }

    this.speed(world);
    this.nitrous(world);
    this.heat(world);
    this.minimap(world);
    this.rep(world);
    this.streetFind(world);
    this.takedowns(world);
    this.roadblock(world);
    this.shredded(world);
    this.overhead(world);
    this.cooldown(world);
    this.collection(world);
    this.banners(world);

    ctx.restore();
  }

  private speed(world: CityWorld): void {
    const { ctx } = this;
    // Against the reference car, not this one (#67). Dividing by the car's own
    // top speed makes every car read 320 km/h flat out, which is the one thing
    // a speedometer must not do.
    const kmh = Math.max(
      0,
      Math.round((Math.abs(world.speed) / REFERENCE_TOP_SPEED) * DISPLAY_MAX_KMH),
    );

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
   * Rep: the running total, and what just paid into it (#64).
   *
   * The popups are most of how the genre communicates. A total that silently
   * goes up teaches nobody what is worth doing; a line saying NEAR MISS +25
   * teaches it once and for good.
   */
  private rep(world: CityWorld): void {
    const { ctx } = this;

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('REP', 34, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillText(world.rep.total.toLocaleString('en-US'), 34, 76);

    // Newest at the top of the stack, fading and drifting up as they age.
    const awards = world.rep.recent;
    for (let i = 0; i < awards.length; i++) {
      const award = awards[awards.length - 1 - i];
      const fade = Math.min(1, (REP_POPUP_TIME - award.age) / 0.6);
      ctx.globalAlpha = Math.max(0, fade);
      const y = 108 + i * 26 - Math.min(8, award.age * 12);

      ctx.fillStyle = '#ffd166';
      ctx.font = '700 18px ui-monospace, "SF Mono", Menlo, monospace';
      const amount = `+${award.amount}`;
      // Measured in the font it is drawn in, before switching to the small
      // one. Measuring afterwards gives the label's width and puts the two on
      // top of each other, which is the same trap the speed readout has.
      const width = ctx.measureText(amount).width;
      ctx.fillText(amount, 34, y);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(award.label, 34 + width + 14, y);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The car you are in, and the one you have just found (#67).
   *
   * The name is always on screen because the handling changed when you picked
   * it up, and a car that drives differently with nothing saying why is a bug
   * report waiting to happen.
   */
  private streetFind(world: CityWorld): void {
    const { ctx } = this;

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '600 12px system-ui, sans-serif';
    // Clear of the speed readout above it: a 62px number has more cap height
    // than the gap it looks like it has.
    ctx.fillText(world.car.name.toUpperCase(), 34, HEIGHT - 114);

    const found = world.finds.flash;
    if (!found) return;
    ctx.globalAlpha = Math.min(1, world.finds.flashLeft / (FIND_FLASH * 0.4));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7fe3ff';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText(found.name.toUpperCase(), WIDTH / 2, HEIGHT / 2 - 70);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText(found.blurb, WIDTH / 2, HEIGHT / 2 - 42);
    ctx.globalAlpha = 1;
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

    // What is nearby and not yet found. Without this you can drive past a
    // billboard on the other side of a block and never know it was there.
    for (const item of world.collectibles.near(world.x, world.z)) {
      const done =
        item.kind === 'billboard'
          ? world.collectibles.smashed.has(item.id)
          : world.collectibles.clocked.has(item.id);
      if (done) continue;
      const ix = (item.at.x - world.x) * scale;
      const iz = -(item.at.z - world.z) * scale;
      if (Math.hypot(item.at.x - world.x, item.at.z - world.z) > COLLECTIBLE_HINT_RANGE) continue;
      if (Math.hypot(ix, iz) > radius) continue;
      ctx.fillStyle = item.kind === 'billboard' ? '#ff9f45' : '#ffd166';
      ctx.fillRect(ix - 2, iz - 2, 4, 4);
    }

    for (const find of world.finds.waiting) {
      const fx = (find.at.x - world.x) * scale;
      const fz = -(find.at.z - world.z) * scale;
      if (Math.hypot(fx, fz) > radius) continue;
      ctx.beginPath();
      ctx.arc(fx, fz, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#7fe3ff';
      ctx.fill();
    }

    for (const strip of world.police.spikes) {
      const sx = (strip.x - world.x) * scale;
      const sz = -(strip.z - world.z) * scale;
      if (Math.hypot(sx, sz) > radius + Math.abs(strip.to) * scale) continue;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx + strip.ax * scale * strip.from, sz - strip.az * scale * strip.from);
      ctx.lineTo(sx + strip.ax * scale * strip.to, sz - strip.az * scale * strip.to);
      ctx.stroke();
    }

    for (const wreck of world.wrecks) {
      const dx = (wreck.x - world.x) * scale;
      const dz = -(wreck.z - world.z) * scale;
      if (Math.hypot(dx, dz) > radius) continue;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(dx - 2, dz - 2, 4, 4);
    }

    const heli = world.police.helicopter;
    if (heli) {
      const hx = (heli.x - world.x) * scale;
      const hz = -(heli.z - world.z) * scale;
      if (Math.hypot(hx, hz) <= radius) {
        ctx.strokeStyle = heli.spotting ? '#ffd166' : 'rgba(255, 209, 102, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hz, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
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

  /**
   * The shredded-tyre clock (#60).
   *
   * A bar rather than a flash: what matters is how much longer it lasts, and
   * a setback you can see the end of is something to drive out rather than
   * something that has already happened to you.
   */
  private shredded(world: CityWorld): void {
    const { ctx } = this;
    if (world.shredded <= 0) return;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffa23a';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText('TYRES SHREDDED', WIDTH / 2, HEIGHT - 96);

    const width = 220;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(WIDTH / 2 - width / 2, HEIGHT - 86, width, 6);
    ctx.fillStyle = '#ffa23a';
    ctx.fillRect(WIDTH / 2 - width / 2, HEIGHT - 86, width * (world.shredded / SHRED_TIME), 6);
  }

  /**
   * The helicopter warning (#62).
   *
   * What the helicopter does is invisible - it stops the cooldown starting -
   * so it has to be said. Without this the player experiences a search that
   * never begins and no reason for it.
   */
  private overhead(world: CityWorld): void {
    const { ctx } = this;
    if (!world.police.helicopter?.spotting) return;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText('HELICOPTER OVERHEAD - FIND COVER', WIDTH / 2, 68);
  }

  /**
   * What is left to find, and what the last camera saw (#93).
   *
   * The count is the whole mechanic on a single line: a city with ninety
   * billboards in it and no count is a city with no billboards in it, because
   * nobody knows there is anything to look for.
   */
  private collection(world: CityWorld): void {
    const { ctx } = this;
    const found = world.collectibles;

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(
      `BILLBOARDS ${found.smashed.size}/${found.billboards.length}   ` +
        `CAMERAS ${found.clockedCount}/${found.cameras.length}   ` +
        `CARS ${world.finds.owned.size}/${world.city.finds.length + 1}   TAB MAP`,
      WIDTH - 26,
      MINIMAP_SIZE + 48,
    );

    const flash = found.flash;
    if (!flash) return;
    const kmh = Math.round(flash.speed * DISPLAY_MAX_KMH);
    ctx.textAlign = 'center';
    ctx.fillStyle = flash.best ? '#ffd166' : 'rgba(255, 255, 255, 0.7)';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(
      flash.best ? `CLOCKED ${kmh} km/h - BEST` : `CLOCKED ${kmh} km/h`,
      WIDTH / 2,
      HEIGHT - 130,
    );
  }

  /**
   * The collection map (#93): the whole city, and everything still out there.
   *
   * The minimap answers "what is the next corner"; this answers "where have I
   * not been". They are different questions and a 280 m circle cannot answer
   * the second one.
   */
  private map(world: CityWorld): void {
    const { ctx } = this;
    const bounds = world.city.bounds;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;

    const inset = 40;
    const scale = Math.min((WIDTH - inset * 2) / width, (HEIGHT - inset * 2) / depth);
    const originX = WIDTH / 2 - (width * scale) / 2;
    const originY = HEIGHT / 2 - (depth * scale) / 2;
    // North up, and the same way round as `npm run city` draws it: two maps of
    // one city that disagree about which way is up are worth less than either.
    const px = (x: number) => originX + (x - bounds.minX) * scale;
    const py = (z: number) => originY + (bounds.maxZ - z) * scale;

    ctx.fillStyle = 'rgba(6, 10, 16, 0.88)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The bay and the river first. Without them the map is a grid of lines
    // that could be any city; with them it is Kestrel Bay, and the bridges are
    // where the lines cross the water.
    for (const body of world.city.water) {
      if (body.outline.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(px(body.outline[0].x), py(body.outline[0].z));
      for (const point of body.outline.slice(1)) ctx.lineTo(px(point.x), py(point.z));
      ctx.closePath();
      ctx.fillStyle = 'rgba(24, 58, 88, 0.85)';
      ctx.fill();
    }

    // Only the roads that give the city a shape. Three thousand street pieces
    // at this scale is a grey rectangle.
    ctx.lineWidth = 1;
    for (const road of world.city.roads) {
      if (road.class === 'street' || road.class === 'ramp') continue;
      const a = world.city.nodes[road.a].pos;
      const b = world.city.nodes[road.b].pos;
      ctx.strokeStyle =
        road.class === 'interstate' ? 'rgba(200, 135, 214, 0.75)' : 'rgba(150, 160, 170, 0.5)';
      ctx.beginPath();
      ctx.moveTo(px(a.x), py(a.z));
      ctx.lineTo(px(b.x), py(b.z));
      ctx.stroke();
    }

    for (const item of world.city.collectibles) {
      const done =
        item.kind === 'billboard'
          ? world.collectibles.smashed.has(item.id)
          : world.collectibles.clocked.has(item.id);
      ctx.fillStyle = done
        ? 'rgba(255, 255, 255, 0.22)'
        : item.kind === 'billboard'
          ? '#ff9f45'
          : '#ffd166';
      const size = item.kind === 'billboard' ? 4 : 3;
      ctx.fillRect(px(item.at.x) - size / 2, py(item.at.z) - size / 2, size, size);
    }

    // Cars still parked out there. Drawn bigger and brighter than a billboard
    // because they are worth crossing the map for and a billboard is not.
    for (const find of world.finds.waiting) {
      ctx.beginPath();
      ctx.arc(px(find.at.x), py(find.at.z), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#7fe3ff';
      ctx.fill();
    }

    // The car, so the map is a place you are in rather than a diagram.
    ctx.beginPath();
    ctx.arc(px(world.x), py(world.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#7fe3ff';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('KESTREL BAY', WIDTH / 2, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(
      `${world.collectibles.remaining} billboards left  ·  ` +
        `${world.collectibles.cameras.length - world.collectibles.clockedCount} cameras unclocked` +
        `  ·  ${world.finds.waiting.length} cars still parked`,
      WIDTH / 2,
      HEIGHT - 20,
    );
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
