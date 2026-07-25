export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';

export interface GameModeDef {
  id: GameMode;
  name: string;
  description: string;
  canBreak: boolean;
  canPlace: boolean;
  canFly: boolean;
  canTakeDamage: boolean;
  infiniteBlocks: boolean;
  startingHealth: number;
  startingFood: number;
}

export const GAME_MODES: Record<GameMode, GameModeDef> = {
  survival: {
    id: 'survival',
    name: 'Survival',
    description: 'Mine blocks, manage health and hunger, survive the world.',
    canBreak: true,
    canPlace: true,
    canFly: false,
    canTakeDamage: true,
    infiniteBlocks: false,
    startingHealth: 20,
    startingFood: 20,
  },
  creative: {
    id: 'creative',
    name: 'Creative',
    description: 'Fly freely, break instantly, unlimited blocks.',
    canBreak: true,
    canPlace: true,
    canFly: true,
    canTakeDamage: false,
    infiniteBlocks: true,
    startingHealth: 20,
    startingFood: 20,
  },
  adventure: {
    id: 'adventure',
    name: 'Adventure',
    description: 'Explore without breaking or placing blocks.',
    canBreak: false,
    canPlace: false,
    canFly: false,
    canTakeDamage: true,
    infiniteBlocks: false,
    startingHealth: 20,
    startingFood: 20,
  },
  spectator: {
    id: 'spectator',
    name: 'Spectator',
    description: 'Fly through everything, no interaction.',
    canBreak: false,
    canPlace: false,
    canFly: true,
    canTakeDamage: false,
    infiniteBlocks: false,
    startingHealth: 20,
    startingFood: 20,
  },
};

export const GAME_MODE_LIST: GameMode[] = ['survival', 'creative', 'adventure', 'spectator'];
