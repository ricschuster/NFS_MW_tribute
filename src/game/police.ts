import { increase, limit } from './math';
import {
  PLAYER_Z,
  COP_TARGET_LEAD,
  COP_SPAWN_LEAD,
  COP_MAX_SPEED_FRAC,
  COP_HEAT_SPEED_FRAC,
  COP_LEAD_KP,
  COP_LANE_KP,
  COP_FIRST_SPAWN,
  COP_RESPAWN,
  HEAT_RISE,
  HEAT_DECAY,
} from './constants';

export interface Cop {
  /** World-z along the track (wrapped). */
  z: number;
  /** Lateral position, -1..1 across the road. */
  offset: number;
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
 * Runs the police pursuit: spawns a single chasing cop, drives its AI (hold
 * station just ahead, slide into the player's lane, get more aggressive as heat
 * rises), and despawns it once the player has outrun it.
 *
 * The heat *meter* and bust/escape states are issue #7; this exposes `heat` as
 * the internal aggression scalar the cop already reacts to.
 */
export class Police {
  cop: Cop | null = null;
  /** Pursuit heat, 0..1, scaling cop aggression. */
  heat = 0;
  /** Advances while a cop is active; drives the lightbar flash. */
  lightPhase = 0;

  /** How far ahead of the player car the cop currently is. */
  private lead = 0;
  private spawnTimer = COP_FIRST_SPAWN;

  update(dt: number, player: PlayerRef, maxSpeed: number, trackLength: number): void {
    if (!this.cop) {
      this.heat = Math.max(0, this.heat - dt * HEAT_DECAY);
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) this.spawn(player, trackLength);
      return;
    }

    this.lightPhase += dt;
    this.heat = Math.min(1, this.heat + dt * HEAT_RISE);

    // Station-keeping: aim to hold COP_TARGET_LEAD ahead, but the cop can only
    // ever travel up to its heat-scaled top speed. Since that stays below the
    // player's max, a full-throttle player can always eventually pull away.
    const copMaxSpeed = maxSpeed * (COP_MAX_SPEED_FRAC + this.heat * COP_HEAT_SPEED_FRAC);
    const wanted = player.speed + (COP_TARGET_LEAD - this.lead) * COP_LEAD_KP;
    const effective = limit(wanted, 0, copMaxSpeed);
    this.lead += (effective - player.speed) * dt;

    // Slide toward the player's lane, faster at higher heat.
    const laneRate = Math.min(1, COP_LANE_KP * (0.5 + this.heat) * dt);
    this.cop.offset += (player.offset - this.cop.offset) * laneRate;

    // Outrun: the cop has dropped behind the camera and is lost.
    if (this.lead < -PLAYER_Z) {
      this.cop = null;
      this.spawnTimer = COP_RESPAWN;
      return;
    }

    this.cop.z = increase(player.z + this.lead, 0, trackLength);
  }

  private spawn(player: PlayerRef, trackLength: number): void {
    this.lead = COP_SPAWN_LEAD;
    this.cop = {
      offset: LANES[Math.floor(Math.random() * LANES.length)],
      z: increase(player.z + this.lead, 0, trackLength),
    };
  }
}
