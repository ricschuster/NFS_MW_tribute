/** One Ladder rival. Ranks run 15 (first challenge) down to 1 (the boss). */
export interface Rival {
  rank: number;
  name: string;
  car: string;
  /** Body colour for the rival's sprite. */
  color: string;
  /** 0..1; scales the rival's race speed. */
  difficulty: number;
}

/**
 * The 15-strong Ladder, ordered as you face them (rank 15 first). Names and
 * cars are original to keep this an unencumbered fan tribute.
 */
export const RIVALS: Rival[] = [
  { rank: 15, name: 'Vex', car: 'Tuned Hatch', color: '#4b7bc9', difficulty: 0.15 },
  { rank: 14, name: 'Cinder', car: 'Hot Coupe', color: '#d8663a', difficulty: 0.21 },
  { rank: 13, name: 'Halo', car: 'Street GT', color: '#d8b23a', difficulty: 0.27 },
  { rank: 12, name: 'Torque', car: 'Muscle', color: '#8a3ad8', difficulty: 0.33 },
  { rank: 11, name: 'Nyx', car: 'Widebody', color: '#3ac9a0', difficulty: 0.4 },
  { rank: 10, name: 'Rook', car: 'Sport Sedan', color: '#c93a5a', difficulty: 0.47 },
  { rank: 9, name: 'Blitz', car: 'Turbo Coupe', color: '#3a9ec9', difficulty: 0.54 },
  { rank: 8, name: 'Mirage', car: 'Exotic', color: '#c9c33a', difficulty: 0.61 },
  { rank: 7, name: 'Volt', car: 'Prototype', color: '#5ad86a', difficulty: 0.68 },
  { rank: 6, name: 'Ember', car: 'GT Racer', color: '#d84b3a', difficulty: 0.74 },
  { rank: 5, name: 'Onyx', car: 'Blacked Coupe', color: '#6a6f7a', difficulty: 0.8 },
  { rank: 4, name: 'Saber', car: 'Track Weapon', color: '#3a6bd8', difficulty: 0.86 },
  { rank: 3, name: 'Venom', car: 'Hypercar', color: '#7ad83a', difficulty: 0.91 },
  { rank: 2, name: 'Ghost', car: 'Phantom GT', color: '#dcdfe6', difficulty: 0.96 },
  { rank: 1, name: 'Reaper', car: 'The the ladder', color: '#e8462b', difficulty: 1.0 },
];
