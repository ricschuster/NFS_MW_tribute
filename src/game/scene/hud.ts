import {
  WIDTH,
  HEIGHT,
  MINIMAP_RANGE,
  MINIMAP_SIZE,
  ROADBLOCK_GAP,
  ROADBLOCK_MAX_LEAD,
  SHRED_TIME,
  RADIO_HOLD,
  DAMAGE_FREE,
  CLAIM_LOSE_RANGE,
  UNITS_PER_METRE,
  REP_POPUP_TIME,
  COLLECTIBLE_HINT_RANGE,
  REFERENCE_TOP_SPEED,
  FIND_FLASH,
  ROUTE_START_RANGE,
  HEAT_LEVEL_COUNT,
  SEARCH_TIME,
  SEARCH_TIME_PER_LEVEL,
} from '../constants';
import { DISPLAY_MAX_KMH } from '../hudscale';
import type { CityWorld } from '../cityworld';
import type { QuickWheel } from '../quickwheel';
import type { TouchControls } from '../touch';

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
/** Who is talking, in a colour, so a glance says which without reading. */
const VOICES: Record<string, string> = {
  dispatch: '#7fb0d6',
  unit: '#9fb4c4',
  air: '#c887d6',
  command: '#ffa23a',
};

/**
 * 1st, 2nd, 3rd. Seven of them: a field is six cars and you are the seventh,
 * so last place is 7th and an array of six prints a bare number for it.
 */
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

export class Hud {
  /** Held while the collection map is open (#93). Set by whoever reads input. */
  showMap = false;
  /** The Quick Wheel while it is held open (#90), or null. */
  wheel: QuickWheel | null = null;
  /** On-screen controls, when there are any (#89). */
  touch: TouchControls | null = null;

  /**
   * How far the bottom-left readouts move up once there are thumbpads.
   *
   * The speed, the nitrous bar and the damage bar all live where the steering
   * buttons go, and a speedometer with a thumb over it is not a speedometer.
   * Zero on a desktop, so nothing moves for anyone who is not on a phone.
   */
  private get lift(): number {
    return this.touch?.active ? 150 : 0;
  }

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
    this.damage(world);
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
    this.radio(world);
    this.event(world);
    this.stuck(world);
    this.banners(world);
    this.quickWheel(world);
    this.buttons();

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
    ctx.fillText(String(kmh), 34, HEIGHT - 52 - this.lift);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText('km/h', 34 + width + 12, HEIGHT - 52 - this.lift);
  }

  private nitrous(world: CityWorld): void {
    const { ctx } = this;
    const x = 34;
    const y = HEIGHT - 38 - this.lift;
    const width = 190;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x, y, width, 9);
    // Bright while it is lighting, dimmer while it refills, so the bar says
    // whether the boost is available rather than only how full it is.
    ctx.fillStyle = world.boosting ? '#7fe3ff' : '#3f7f97';
    ctx.fillRect(x, y, width * world.nitro, 9);
  }

  /**
   * How beaten up the car is (#95).
   *
   * Shown only once it is costing you something. A bar that creeps up from the
   * first scrape teaches the player to fear a graze, which is not the game:
   * the first fifth of the damage is cosmetic and the bar says so by not
   * being there.
   */
  private damage(world: CityWorld): void {
    const { ctx } = this;
    if (world.damage <= DAMAGE_FREE) return;

    const x = 34;
    const y = HEIGHT - 24 - this.lift;
    const width = 190;
    const hurt = (world.damage - DAMAGE_FREE) / (1 - DAMAGE_FREE);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x, y, width, 7);
    ctx.fillStyle = hurt > 0.6 ? '#ff5a45' : '#ffa23a';
    ctx.fillRect(x, y, width * hurt, 7);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('DAMAGE', x + width + 10, y + 7);
  }

  private heat(world: CityWorld): void {
    const { ctx } = this;
    const heat = world.police.heat;
    if (heat <= 0.01 && world.police.cops.length === 0) return;

    const x = WIDTH - 210;
    const y = HEIGHT - 46 - this.lift;

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
    // Indented past the look-back button once there is one there. Moving the
    // button instead would put it out of a thumb's reach of the steering.
    ctx.fillText(world.car.name.toUpperCase(), 34 + (this.lift ? 66 : 0), HEIGHT - 114 - this.lift);

    // Not while the wheel is open: it is already listing the part, and a
    // banner across the panel is two things saying one thing over each other.
    const part = this.wheel ? null : world.finds.earned;
    if (part) {
      ctx.globalAlpha = Math.min(1, world.finds.earnedLeft / (FIND_FLASH * 0.4));
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.fillText(`${part.name.toUpperCase()} UNLOCKED`, WIDTH / 2, HEIGHT / 2 - 100);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '500 14px system-ui, sans-serif';
      ctx.fillText(`${part.detail}  ·  Q to fit it`, WIDTH / 2, HEIGHT / 2 - 76);
      ctx.globalAlpha = 1;
    }

    const found = this.wheel ? null : world.finds.flash;
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
    ctx.fillText('TAKEDOWNS', WIDTH - 34, HEIGHT - 68 - this.lift);
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 22px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillText(String(world.takedowns), WIDTH - 34, HEIGHT - 88 - this.lift);
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
    // Rotate the world under the car, not the car on the map - and rotate it by
    // *minus* the heading, which is the whole of this fix.
    //
    // Work it through for a point directly ahead at distance d. Before the
    // rotation it plots at `(d sin h, -d cos h)`, because the map negates z to
    // put north up. Canvas `rotate(t)` sends `(x, y)` to
    // `(x cos t - y sin t, x sin t + y cos t)`, so at `t = -h` that lands on
    // `(0, -d)`: straight up the screen, which is what heading-up means. At
    // `t = +h` it lands on `(d sin 2h, ...)`, and at a heading of 90 degrees
    // that is `(0, +d)` - the road in front of you drawn behind you.
    //
    // It read as "the minimap is not aligned with what the driver sees", which
    // is exactly what it was.
    ctx.rotate(-world.heading);

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

    // The lap you are on, so the next few corners are visible before they are
    // the corner you are in.
    const route = world.race.route;
    if (route) {
      ctx.beginPath();
      ctx.moveTo((route.points[0].x - world.x) * scale, -(route.points[0].z - world.z) * scale);
      for (const point of route.points.slice(1)) {
        ctx.lineTo((point.x - world.x) * scale, -(point.z - world.z) * scale);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(127, 227, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Things worth aiming at while being chased (#57).
    for (const thing of world.city.breakables) {
      if (world.broken.has(thing.id)) continue;
      const bx = (thing.at.x - world.x) * scale;
      const bz = -(thing.at.z - world.z) * scale;
      if (Math.hypot(bx, bz) > radius) continue;
      ctx.fillStyle = 'rgba(176, 118, 58, 0.9)';
      ctx.fillRect(bx - 2, bz - 2, 4, 4);
    }

    for (const shop of world.city.repairs) {
      const rx = (shop.at.x - world.x) * scale;
      const rz = -(shop.at.z - world.z) * scale;
      if (Math.hypot(rx, rz) > radius) continue;
      ctx.strokeStyle = '#5adc82';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx - 5, rz);
      ctx.lineTo(rx + 5, rz);
      ctx.moveTo(rx, rz - 5);
      ctx.lineTo(rx, rz + 5);
      ctx.stroke();
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

    this.marker(world, cx, cy, radius);
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
   * Everything about a race: the offer, the lights, the lap, and the result (#70).
   *
   * The one that matters most is the arrow. A circuit through a city is not a
   * road you can see the end of, and a lap you have to guess your way round is
   * a lap spent looking at the minimap instead of the street.
   */
  private event(world: CityWorld): void {
    const { ctx } = this;
    const race = world.race;
    ctx.textAlign = 'center';

    if (world.claim.state !== 'idle') {
      this.claim(world);
      return;
    }

    if (race.state === 'idle' && world.ambush.state !== 'idle') {
      this.ambush(world);
      return;
    }

    if (race.state === 'idle') {
      const spot = world.atAmbush;
      if (spot) {
        ctx.fillStyle = '#ff5a45';
        ctx.font = '700 22px system-ui, sans-serif';
        ctx.fillText(`AMBUSH  ·  HEAT ${spot.level}`, WIDTH / 2, HEIGHT - 150);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '600 15px system-ui, sans-serif';
        ctx.fillText('ENTER  -  surrounded, engine off, get out', WIDTH / 2, HEIGHT - 126);
        return;
      }

      const route = world.atStartLine;
      if (!route) return;
      const rival = world.currentRival;

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillText(
        `${route.name.toUpperCase()}   ${route.kind === 'speedrun' ? 'SPEED RUN' : 'CIRCUIT'}`,
        WIDTH / 2,
        HEIGHT - 150,
      );
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = !rival
        ? '#5adc82'
        : world.challengeReady
          ? 'rgba(255, 255, 255, 0.8)'
          : '#ffd166';
      const invite =
        route.kind === 'speedrun'
          ? `ENTER  -  one lap, on average speed, for #${rival?.rank} ${rival?.name}`
          : `ENTER  -  ${route.laps} laps against #${rival?.rank} ${rival?.name}`;
      ctx.fillText(
        !rival
          ? 'RIVALS CLEARED'
          : world.challengeReady
            ? invite
            : `#${rival.rank} ${rival.name} - ${world.repToNext.toLocaleString('en-US')} REP to go`,
        WIDTH / 2,
        HEIGHT - 126,
      );
      return;
    }

    if (race.state === 'countdown') {
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 120px system-ui, sans-serif';
      ctx.fillText(String(Math.max(1, Math.ceil(race.countdown))), WIDTH / 2, HEIGHT / 2 + 40);
      const challenger = race.challenger;
      if (challenger) {
        ctx.fillStyle = challenger.color;
        ctx.font = '700 20px system-ui, sans-serif';
        ctx.fillText(
          `#${challenger.rank}  ${challenger.name.toUpperCase()}`,
          WIDTH / 2,
          HEIGHT / 2 - 90,
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = '500 14px system-ui, sans-serif';
        ctx.fillText(`a field of ${race.runners}`, WIDTH / 2, HEIGHT / 2 - 66);
      }
      return;
    }

    if (race.state === 'finished') {
      ctx.fillStyle = race.won ? 'rgba(0, 50, 20, 0.5)' : 'rgba(50, 0, 0, 0.5)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = race.won ? '#5adc82' : '#ff5a5a';
      ctx.font = '800 68px system-ui, sans-serif';
      ctx.fillText(race.won ? 'YOU WIN' : 'YOU LOSE', WIDTH / 2, HEIGHT / 2);
      if (race.isSpeedRun) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '500 20px system-ui, sans-serif';
        ctx.fillText(
          `${Math.round(race.average * DISPLAY_MAX_KMH)} km/h average, ` +
            `target ${Math.round(race.targetAverage * DISPLAY_MAX_KMH)}`,
          WIDTH / 2,
          HEIGHT / 2 + 36,
        );
      }
      return;
    }

    // Racing. A speed run is scored on one number, so it gets the whole
    // middle of the screen: it is the game in that mode, not a readout.
    const route = race.route;
    if (!route) return;

    if (race.isSpeedRun) {
      this.speedRun(world);
      this.arrow(world);
      return;
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('LAP', WIDTH / 2 - 90, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillText(`${Math.min(route.laps, race.lap + 1)}/${route.laps}`, WIDTH / 2 - 50, 42);

    const place = race.position;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('POS', WIDTH / 2 + 30, 40);
    ctx.fillStyle = place === 1 ? '#5adc82' : '#ff9f45';
    ctx.font = '700 26px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillText(`${ORDINALS[place] ?? place}/${race.runners}`, WIDTH / 2 + 70, 42);

    this.arrow(world);
  }

  /**
   * Running a rival down for their car (#66).
   *
   * Two numbers and a bar: how long you have, how far off they are, and how
   * close the car is to giving up. The bar is the one that matters - the whole
   * second half is "hit them again", and a fight with no visible progress is a
   * fight nobody believes is going anywhere.
   */
  private claim(world: CityWorld): void {
    const { ctx } = this;
    const claim = world.claim;
    ctx.textAlign = 'center';

    if (claim.state !== 'running') {
      const took = claim.state === 'won';
      ctx.fillStyle = took ? '#5adc82' : '#ff5a5a';
      ctx.font = '800 60px system-ui, sans-serif';
      ctx.fillText(took ? 'CAR CLAIMED' : 'THEY GOT AWAY', WIDTH / 2, HEIGHT / 2 - 40);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '500 20px system-ui, sans-serif';
      ctx.fillText(
        took
          ? `${claim.rival?.car ?? 'their car'} is yours`
          : `beat ${claim.rival?.name ?? 'them'} again`,
        WIDTH / 2,
        HEIGHT / 2 - 6,
      );
      return;
    }

    const runner = claim.runner;
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(
      `WRECK ${claim.rival?.name.toUpperCase() ?? 'THEM'}`,
      WIDTH / 2,
      36,
    );

    const width = 260;
    const x = WIDTH / 2 - width / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x, 48, width, 8);
    ctx.fillStyle = '#ff5a45';
    ctx.fillRect(x, 48, width * claim.damage, 8);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '600 13px system-ui, sans-serif';
    const gap = runner ? Math.hypot(runner.x - world.x, runner.z - world.z) : 0;
    const losing = gap > CLAIM_LOSE_RANGE;
    ctx.fillText(
      `${Math.round(claim.left)}s   ·   ${Math.round(gap / UNITS_PER_METRE)} m` +
        `${losing ? '   ·   LOSING THEM' : ''}`,
      WIDTH / 2,
      74,
    );
  }

  /**
   * The ambush clock, and how it ended (#92).
   *
   * A clock and not a bar: there is no target to be measured against, only
   * how long they had you, which is the number worth remembering.
   */
  private ambush(world: CityWorld): void {
    const { ctx } = this;
    const run = world.ambush;
    ctx.textAlign = 'center';

    if (run.state === 'running') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('AMBUSH', WIDTH / 2, 34);
      ctx.fillStyle = '#ff5a45';
      ctx.font = '700 44px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.fillText(run.elapsed.toFixed(1), WIDTH / 2, 76);
      return;
    }

    const escaped = run.state === 'escaped';
    ctx.fillStyle = escaped ? '#5adc82' : '#ff5a5a';
    ctx.font = '800 60px system-ui, sans-serif';
    ctx.fillText(escaped ? 'CLEAR' : 'CAUGHT', WIDTH / 2, HEIGHT / 2 - 40);
    if (!escaped) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '500 20px system-ui, sans-serif';
    ctx.fillText(`out in ${run.elapsed.toFixed(1)}s at heat ${run.level}`, WIDTH / 2, HEIGHT / 2 - 6);
  }

  /**
   * The running average, and the one it has to beat (#72).
   *
   * Big, because it is the whole game in this mode. A speed run scored on a
   * number the player cannot see is a race with the result hidden until the
   * end, and the tension of it is watching a bad corner cost you.
   */
  private speedRun(world: CityWorld): void {
    const { ctx } = this;
    const race = world.race;
    const average = Math.round(race.average * DISPLAY_MAX_KMH);
    const target = Math.round(race.targetAverage * DISPLAY_MAX_KMH);
    const beating = race.average >= race.targetAverage;

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('AVERAGE', WIDTH / 2, 34);

    ctx.fillStyle = beating ? '#5adc82' : '#ff9f45';
    ctx.font = '700 54px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillText(String(average), WIDTH / 2, 82);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(`target ${target} km/h`, WIDTH / 2, 104);

    // A bar, so how far off it you are is readable without doing arithmetic
    // at two hundred kilometres an hour.
    const width = 260;
    const x = WIDTH / 2 - width / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x, 114, width, 6);
    ctx.fillStyle = beating ? '#5adc82' : '#ff9f45';
    const filled = Math.max(0, Math.min(1.3, race.average / Math.max(0.01, race.targetAverage)));
    ctx.fillRect(x, 114, (width * filled) / 1.3, 6);
    // Where the target sits on it.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + width / 1.3 - 1, 111, 2, 12);
  }

  /**
   * An arrow at the top of the screen pointing at the next gate.
   *
   * Relative to where the car is pointing, not to north: the question it
   * answers is "which way now", and a compass makes the driver do the
   * subtraction at the moment they are busiest.
   */
  private arrow(world: CityWorld): void {
    const { ctx } = this;
    const gate = world.race.target;
    if (!gate) return;

    const dx = gate.x - world.x;
    const dz = gate.z - world.z;
    const bearing = Math.atan2(dx, dz) - world.heading;
    const gap = Math.hypot(dx, dz);

    ctx.save();
    ctx.translate(WIDTH / 2, world.race.isSpeedRun ? 158 : 100);
    ctx.rotate(-bearing);
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(15, 14);
    ctx.lineTo(0, 6);
    ctx.lineTo(-15, 14);
    ctx.closePath();
    // Brighter the closer the gate is, so it reads as an approach.
    ctx.fillStyle = gap < ROUTE_START_RANGE * 4 ? '#5adc82' : '#7fe3ff';
    ctx.fill();
    ctx.restore();
  }

  /**
   * The Quick Wheel, drawn over the running game (#90).
   *
   * Over and not instead of: the world keeps moving underneath, which is the
   * entire point of it. A panel down one side rather than an actual wheel,
   * because what is being read is nine lines of text and a wheel is a worse
   * shape for that than a list.
   */
  private quickWheel(world: CityWorld): void {
    const { ctx } = this;
    const wheel = this.wheel;
    if (!wheel) {
      // Cleared, or the rows keep answering touches after the panel has gone.
      if (this.touch) this.touch.regions = [];
      return;
    }

    const entries = wheel.entries(world);
    const width = 470;
    const height = 54 + entries.length * 30;
    const x = WIDTH / 2 - width / 2;
    const y = HEIGHT / 2 - height / 2;

    // Published for touch (#89): this is the only place that knows how many
    // rows there are and where they ended up, and the wheel's length changes
    // with what is in it.
    if (this.touch) {
      this.touch.regions = [
        { id: 'wheel:branch', x, y, w: width, h: 44 },
        ...entries.map((_, i) => ({ id: `wheel:${i}`, x, y: y + 42 + i * 30, w: width, h: 30 })),
      ];
    }

    ctx.fillStyle = 'rgba(8, 12, 18, 0.82)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(127, 227, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#7fe3ff';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(wheel.title, x + 16, y + 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText('E to switch  ·  1-9 to pick', x + width - 16, y + 30);

    ctx.textAlign = 'left';
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const line = y + 56 + i * 30;
      ctx.globalAlpha = entry.available ? 1 : 0.4;

      ctx.fillStyle = '#ffd166';
      ctx.font = '700 15px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.fillText(String(i + 1), x + 16, line);

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(entry.label, x + 40, line);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '500 12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(entry.detail, x + width - 16, line);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }

  /**
   * What the police are saying (#76).
   *
   * Down the left, above the speed, styled as radio traffic. It is a tell and
   * not decoration: a roadblock is called before it is in sight and air
   * support before it can be heard, so this is where the player finds out what
   * is about to happen to them.
   */
  private radio(world: CityWorld): void {
    const { ctx } = this;
    const lines = world.radio.recent;
    if (lines.length === 0) return;

    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[lines.length - 1 - i];
      // Newest at the bottom of the stack and brightest; the older ones fade
      // up and out, which is how a scrolling log reads without a box round it.
      const y = HEIGHT - 190 - this.lift - i * 20;
      ctx.globalAlpha = Math.max(0, Math.min(1, (RADIO_HOLD - line.age) / 1.2)) * (1 - i * 0.25);

      ctx.fillStyle = VOICES[line.from] ?? '#9fb4c4';
      ctx.font = '700 11px ui-monospace, "SF Mono", Menlo, monospace';
      const tag = line.from.toUpperCase();
      ctx.fillText(tag, 34, y);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillText(line.text, 34 + 72, y);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The on-screen controls (#89).
   *
   * Drawn last so nothing covers them, and only once a finger has actually
   * touched the screen - a desktop player should never see a thumbpad.
   */
  private buttons(): void {
    const { ctx } = this;
    const touch = this.touch;
    if (!touch?.active) return;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const button of touch.buttons) {
      ctx.beginPath();
      ctx.arc(button.x, button.y, button.r, 0, Math.PI * 2);
      ctx.fillStyle = button.down ? 'rgba(127, 227, 255, 0.35)' : 'rgba(8, 12, 18, 0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = `600 ${button.label.length > 1 ? 15 : 24}px system-ui, sans-serif`;
      ctx.fillText(button.label, button.x, button.y);
    }
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Where you asked to be pointed (#90).
   *
   * A chevron on the rim of the minimap and a distance under it, so a
   * destination two kilometres away is still a direction rather than a dot off
   * the edge of a 280 m circle.
   */
  private marker(world: CityWorld, cx: number, cy: number, radius: number): void {
    const { ctx } = this;
    const marker = world.marker;
    if (!marker) return;

    const dx = marker.x - world.x;
    const dz = marker.z - world.z;
    const gap = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz) - world.heading;
    const at = Math.min(radius - 12, gap * (radius / MINIMAP_RANGE));

    ctx.save();
    ctx.translate(cx + Math.sin(bearing) * at, cy - Math.cos(bearing) * at);
    ctx.rotate(bearing);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fillStyle = '#7fe3ff';
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(127, 227, 255, 0.85)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(
      `${(Math.round(gap / UNITS_PER_METRE / 100) / 10).toFixed(1)} km  ${marker.label}`,
      cx,
      cy + radius + 18,
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

    // Where the events are. A circuit you have to stumble across is a circuit
    // nobody runs.
    for (const route of world.city.routes) {
      ctx.strokeStyle =
        route.kind === 'speedrun' ? 'rgba(255, 159, 69, 0.4)' : 'rgba(127, 227, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(route.points[0].x), py(route.points[0].z));
      for (const point of route.points.slice(1)) ctx.lineTo(px(point.x), py(point.z));
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px(route.start.x), py(route.start.z), 4, 0, Math.PI * 2);
      ctx.fillStyle = route.kind === 'speedrun' ? '#ff9f45' : '#7fe3ff';
      ctx.fill();
    }

    // Where the traps are, with the heat they spring at.
    for (const spot of world.city.ambushes) {
      ctx.fillStyle = '#ff5a45';
      ctx.beginPath();
      ctx.arc(px(spot.at.x), py(spot.at.z), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(spot.level), px(spot.at.x) + 6, py(spot.at.z) + 3);
    }
    ctx.textAlign = 'center';
    // The repair shops, which is where a pursuit gets taken when the car has
    // had enough.
    for (const shop of world.city.repairs) {
      ctx.strokeStyle = '#5adc82';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(shop.at.x) - 4, py(shop.at.z));
      ctx.lineTo(px(shop.at.x) + 4, py(shop.at.z));
      ctx.moveTo(px(shop.at.x), py(shop.at.z) - 4);
      ctx.lineTo(px(shop.at.x), py(shop.at.z) + 4);
      ctx.stroke();
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

  /**
   * The way out of a car that has stopped going anywhere (#179).
   *
   * Drawn in the middle of the screen rather than down with the event prompts,
   * because it has to be read by somebody who has just concluded the game is
   * broken - and because it must not take the place of the lap counter or the
   * start-line offer, either of which can be on screen while the car is
   * wedged.
   */
  private stuck(world: CityWorld): void {
    if (!world.canRecover) return;
    const { ctx } = this;

    // On a plate, because what is behind it is the car: a stuck car is always
    // in the middle of the screen, and amber text over an orange bonnet is a
    // prompt nobody reads.
    const width = 380;
    const x = WIDTH / 2 - width / 2;
    const y = HEIGHT / 2 + 72;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.82)';
    ctx.fillRect(x, y, width, 68);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, 68);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText('STUCK', WIDTH / 2, y + 30);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('ENTER  -  back onto the road, heat and all', WIDTH / 2, y + 54);
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

    if (world.repairFlash > 0) {
      ctx.globalAlpha = Math.min(1, world.repairFlash);
      ctx.fillStyle = '#5adc82';
      ctx.font = '800 46px system-ui, sans-serif';
      ctx.fillText('REPAIRED', WIDTH / 2, HEIGHT / 2 - 110);
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
