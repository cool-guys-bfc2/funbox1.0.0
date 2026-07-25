import { registerBlock, allBlocks, type BlockDef, type BlockType } from './blocks';

export interface AddonBlockDef {
  id: string;
  name: string;
  top: string;
  bottom?: string;
  side?: string;
  transparent?: boolean;
  solid?: boolean;
  liquid?: boolean;
  drop?: BlockType | 'none';
  hardness?: number;
  light?: number;
  pattern?: 'speckle' | 'stripes' | 'bricks' | 'glass' | 'ore' | 'plain';
  accent?: string;
}

export interface AddonManifest {
  id: string;
  name: string;
  author?: string;
  description?: string;
  blocks: AddonBlockDef[];
}

const loadedAddons = new Map<string, AddonManifest>();

export function loadAddon(manifest: AddonManifest): { ok: boolean; error?: string; added: number } {
  if (loadedAddons.has(manifest.id)) {
    return { ok: false, error: `Addon '${manifest.id}' already loaded`, added: 0 };
  }
  let added = 0;
  for (const b of manifest.blocks) {
    if (allBlocks().some((bb) => bb.id === b.id)) {
      // skip if a core block already has this id
      continue;
    }
    registerBlock({
      id: b.id,
      name: b.name,
      faces: {
        top: b.top,
        bottom: b.bottom ?? b.top,
        side: b.side ?? b.top,
      },
      transparent: b.transparent,
      solid: b.solid ?? true,
      liquid: b.liquid,
      drop: b.drop,
      hardness: b.hardness,
      light: b.light,
      pattern: b.pattern,
      accent: b.accent,
      addon: manifest.id,
    });
    added++;
  }
  loadedAddons.set(manifest.id, manifest);
  return { ok: true, added };
}

export function listAddons(): AddonManifest[] {
  return Array.from(loadedAddons.values());
}

export function isAddonLoaded(id: string): boolean {
  return loadedAddons.has(id);
}

// A couple of built-in sample addons that ship with the game.
export const BUILTIN_ADDONS: AddonManifest[] = [
  {
    id: 'nether',
    name: 'Nether Pack',
    author: 'MiniCraft',
    description: 'Netherrack, glowstone, obsidian, lava, and soul sand blocks.',
    blocks: [
      {
        id: 'netherrack',
        name: 'Netherrack',
        top: '#6e2a2a',
        side: '#6e2a2a',
        solid: true,
        hardness: 0.4,
        pattern: 'speckle',
      },
      {
        id: 'soul_sand',
        name: 'Soul Sand',
        top: '#3a342a',
        side: '#3a342a',
        solid: true,
        hardness: 0.5,
        pattern: 'speckle',
      },
    ],
  },
  {
    id: 'tech',
    name: 'Tech Pack',
    author: 'MiniCraft',
    description: 'Iron block, lamp, and chrome blocks for futuristic builds.',
    blocks: [
      {
        id: 'iron_block',
        name: 'Iron Block',
        top: '#d8d8d8',
        side: '#d8d8d8',
        solid: true,
        hardness: 2,
        pattern: 'plain',
      },
      {
        id: 'lamp',
        name: 'Lamp',
        top: '#fff4c2',
        side: '#fff4c2',
        solid: true,
        light: 1,
        hardness: 0.3,
        pattern: 'speckle',
      },
      {
        id: 'chrome',
        name: 'Chrome',
        top: '#cfd4da',
        side: '#cfd4da',
        solid: true,
        hardness: 3,
        pattern: 'plain',
      },
    ],
  },
];

import { rebuildIndex } from './blocks';

// Load built-in addons on import
for (const a of BUILTIN_ADDONS) loadAddon(a);
// Rebuild the dynamic block index now that core + addon blocks are registered.
rebuildIndex();
