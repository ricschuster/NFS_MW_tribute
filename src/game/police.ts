import { increase, interpolate } from './math';
import {
  COP_MAX_SPEED_FRAC,
  COP_HEAT_SPEED_FRAC,
  COP_LANE_KP,
  COP_FIRST_SPAWN,
  COP_RESPAWN,
  COP_BUST_COOLDOWN,
  COP_SPAWN_INTERVAL,
  COP_SPAWN_DISTANCE,
  COP_OUTRUN_DISTANCE,
  COP_PIN_LEAD,
  COP_FAR_LEAD,
  PURSUIT_RANGE,
  BUST_DISTANCE,
  BUST_TIME,
  ESCAPE_TIME,
  MAX_COPS,
  MAX_HEAT_LEVEL,
  HEAT_RISE,
  HEAT_DECAY,
} from './constants';

export interface Cop {
  /** How far the cop trails the player, in world units (0 = on the bumper). */
  distance: number;
  /** Lateral position, -1..1 across the road. */
  offset: number;
  /** Render position: world-z ahead of the player (derived from distance). */
  z: number;
}

/** The player state the pursuit AI reacts to. */
export interface PlayerRef {
  /** Player car world-z (position + PLAYER_Z). */
  z: number;
  offset: number;
  speed: number;
}

const LANES = [-0.6, 0, 0.6];

/**
 * Runs the police pursuit and the heat / bust / escape state.
 *
 * Cops are tracked by how far they *trail* the player (a scalar `distance`), so
 * a slow player is caught and a fast one pulls away. For rendering, that trail
 * distance maps to a lead ahead of the player car (closer trail -> larger, nearer
 * sprite), which reads as the cop bearing down. Heat rises while a cop is close,
 * scales cop speed and spawn count, and cools when clear. A cop pinned within
 * BUST_DISTANCE for BUST_TIME busts you; staying clear for ESCAPE_TIME escapes.
 */
export class Police {
  cops: Cop[] = [];
  /** Pursuit heat, 0..1. */
  heat = 0;
  /** Advances while pursued; drives the lightbar flash. */
  lightPhase = 0;
  /** Set when a cop has pinned the player long enough; the game clears it via reset(). */
  busted = false;
  /** True for the single frame a pursuit ends by escaping (for a HUD flash). */
  justEscaped = false;

  private phase: 'clear' | 'pursuit' = 'clear';
  private nextPursuitTimer = COP_FIRST_SPAWN;
  private spawnCooldown = 0;
  private escapeTimer = 0;
  private bustTimer = 0;

  get pursuing(): boolean {
    return this.phase === 'pursuit';
  }

  /** Discrete heat level, 0 (clear) or 1..MAX_HEAT_LEVEL. */
  get level(): number {
    return this.heat <= 0 ? 0 : 1 + Math.floor(this.heat * (MAX_HEAT_LEVEL - 1) + 1e-9);
  }

  update(dt: number, player: PlayerRef, maxSpeed: number, trackLength: number): void {
    this.justEscaped = false;
    this.lightPhase += dt;

    if (this.phase === 'clear') {
      this.heat = Math.max(0, this.heat - dt * HEAT_DECAY);
      this.nextPursuitTimer -= dt;
      if (this.nextPursuitTimer <= 0) {
        this.phase = 'pursuit';
        this.escapeTimer = 0;
        this.bustTimer = 0;
        this.spawnCooldown = COP_SPAWN_INTERVAL;
        this.spawnCop(player, trackLength);
      }
      return;
    }

    const copSpeed = maxSpeed * (COP_MAX_SPEED_FRAC + this.heat * COP_HEAT_SPEED_FRAC);
    const laneRate = Math.min(1, COP_LANE_KP * (0.5 + this.heat) * dt);

    const surviving: Cop[] = [];
    for (const cop of this.cops) {
      // trail grows when the player is faster, shrinks when slower
      cop.distance = Math.max(0, cop.distance + (player.speed - copSpeed) * dt);
      cop.offset += (player.offset - cop.offset) * laneRate;
      if (cop.distance > COP_OUTRUN_DISTANCE) continue; // outrun -> lost

      const lead = interpolate(COP_PIN_LEAD, COP_FAR_LEAD, Math.min(1, cop.distance / COP_OUTRUN_DISTANCE));
      cop.z = increase(player.z + lead, 0, trackLength);
      surviving.push(cop);
    }
    this.cops = surviving;

    const nearest = this.cops.length ? Math.min(...this.cops.map((c) => c.distance)) : null;
    const engaged = nearest !== null && nearest <= PURSUIT_RANGE;

    if (engaged) {
      const closeness = 1 - Math.min(1, (nearest as number) / PURSUIT_RANGE);
      this.heat = Math.min(1, this.heat + dt * HEAT_RISE * (0.5 + closeness));
      this.escapeTimer = 0;
    } else {
      this.escapeTimer += dt;
      this.heat = Math.max(0, this.heat - dt * HEAT_DECAY * 0.5);
    }

    // more cops pile on as heat rises, but only while you're still engaged
    this.spawnCooldown -= dt;
    const desired = 1 + Math.floor(this.heat * (MAX_COPS - 1) + 1e-9);
    if (engaged && this.cops.length < desired && this.spawnCooldown <= 0) {
      this.spawnCop(player, trackLength);
      this.spawnCooldown = COP_SPAWN_INTERVAL;
    }

    if (nearest !== null && nearest <= BUST_DISTANCE) {
      this.bustTimer += dt;
      if (this.bustTimer >= BUST_TIME) this.busted = true;
    } else {
      this.bustTimer = 0;
    }

    if (this.escapeTimer >= ESCAPE_TIME) this.escape();
  }

  /** Clear the pursuit after the game has handled a bust. */
  reset(): void {
    this.cops = [];
    this.heat = 0;
    this.phase = 'clear';
    this.nextPursuitTimer = COP_BUST_COOLDOWN;
    this.escapeTimer = 0;
    this.bustTimer = 0;
    this.busted = false;
  }

  private escape(): void {
    this.cops = [];
    this.phase = 'clear';
    this.nextPursuitTimer = COP_RESPAWN;
    this.justEscaped = true;
  }

  private spawnCop(player: PlayerRef, trackLength: number): void {
    const distance = COP_SPAWN_DISTANCE;
    const lead = interpolate(COP_PIN_LEAD, COP_FAR_LEAD, Math.min(1, distance / COP_OUTRUN_DISTANCE));
    this.cops.push({
      distance,
      offset: LANES[Math.floor(Math.random() * LANES.length)],
      z: increase(player.z + lead, 0, trackLength),
    });
  }
}
