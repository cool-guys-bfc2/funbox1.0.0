import type { World } from './world';
import type { BlockType } from './blocks';

export interface StructureContext {
  world: World;
  x: number;
  y: number;
  z: number;
}

type StructureFn = (ctx: StructureContext) => void;

function setIfAir(world: World, x: number, y: number, z: number, b: BlockType) {
  if (world.get(x, y, z) === 'air') world.set(x, y, z, b);
}

function safeSet(world: World, x: number, y: number, z: number, b: BlockType) {
  world.set(x, y, z, b);
}

// ---- House ----
const house: StructureFn = ({ world, x, y, z }) => {
  const w = 6;
  const d = 7;
  const h = 4;
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      safeSet(world, x + dx, y, z + dz, 'planks');
    }
  }
  for (let dy = 1; dy <= h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      safeSet(world, x + dx, y + dy, z, 'planks');
      safeSet(world, x + dx, y + dy, z + d - 1, 'planks');
    }
    for (let dz = 0; dz < d; dz++) {
      safeSet(world, x, y + dy, z + dz, 'planks');
      safeSet(world, x + w - 1, y + dy, z + dz, 'planks');
    }
  }
  safeSet(world, x + Math.floor(w / 2), y + 1, z, 'air');
  safeSet(world, x + Math.floor(w / 2), y + 2, z, 'air');
  safeSet(world, x + 1, y + 2, z + 2, 'glass');
  safeSet(world, x + 1, y + 2, z + 4, 'glass');
  safeSet(world, x + w - 2, y + 2, z + 2, 'glass');
  safeSet(world, x + w - 2, y + 2, z + 4, 'glass');
  for (let dx = -1; dx <= w; dx++) {
    safeSet(world, x + dx, y + h + 1, z - 1, 'cobblestone');
    safeSet(world, x + dx, y + h + 1, z + d, 'cobblestone');
  }
  for (let dz = -1; dz <= d; dz++) {
    safeSet(world, x - 1, y + h + 1, z + dz, 'cobblestone');
    safeSet(world, x + w, y + h + 1, z + dz, 'cobblestone');
  }
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      safeSet(world, x + dx, y + h + 2, z + dz, 'wood');
    }
  }
  safeSet(world, x + Math.floor(w / 2), y + h, z + Math.floor(d / 2), 'glowstone');
};

// ---- Pyramid ----
const pyramid: StructureFn = ({ world, x, y, z }) => {
  const size = 9;
  for (let layer = 0; layer < 5; layer++) {
    const s = size - layer * 2;
    if (s < 1) break;
    for (let dx = 0; dx < s; dx++) {
      for (let dz = 0; dz < s; dz++) {
        safeSet(world, x + layer + dx, y + layer, z + layer + dz, 'sand');
      }
    }
  }
  safeSet(world, x + 4, y + 1, z + 4, 'air');
  safeSet(world, x + 4, y + 2, z + 4, 'air');
  safeSet(world, x + 4, y + 1, z + 5, 'air');
  safeSet(world, x + 4, y + 2, z + 5, 'air');
  safeSet(world, x + 4, y + 3, z + 5, 'gold');
  safeSet(world, x + 4, y + 3, z + 6, 'gold');
};

// ---- Village well ----
const well: StructureFn = ({ world, x, y, z }) => {
  for (let dx = 0; dx < 3; dx++) {
    for (let dz = 0; dz < 3; dz++) {
      safeSet(world, x + dx, y, z + dz, 'cobblestone');
    }
  }
  safeSet(world, x + 1, y, z + 1, 'water');
  safeSet(world, x, y + 1, z, 'wood');
  safeSet(world, x + 2, y + 1, z, 'wood');
  safeSet(world, x, y + 1, z + 2, 'wood');
  safeSet(world, x + 2, y + 1, z + 2, 'wood');
  safeSet(world, x, y + 2, z, 'wood');
  safeSet(world, x + 2, y + 2, z, 'wood');
  safeSet(world, x, y + 2, z + 2, 'wood');
  safeSet(world, x + 2, y + 2, z + 2, 'wood');
  for (let dx = -1; dx <= 3; dx++) {
    for (let dz = -1; dz <= 3; dz++) {
      safeSet(world, x + dx, y + 3, z + dz, 'planks');
    }
  }
};

// ---- Tall tree ----
const tallTree: StructureFn = ({ world, x, y, z }) => {
  const trunk = 6;
  for (let i = 0; i < trunk; i++) safeSet(world, x, y + i, z, 'wood');
  const top = y + trunk;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -2; dy <= 1; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 4) continue;
        if (dx === 0 && dz === 0 && dy < 1) continue;
        setIfAir(world, x + dx, top + dy, z + dz, 'leaves');
      }
    }
  }
  safeSet(world, x, top + 2, z, 'leaves');
};

export type StructureType = 'house' | 'pyramid' | 'well' | 'tallTree';

export const STRUCTURES: Record<StructureType, StructureFn> = {
  house,
  pyramid,
  well,
  tallTree,
};

export function placeStructure(world: World, type: StructureType, x: number, y: number, z: number) {
  STRUCTURES[type]({ world, x, y, z });
}
