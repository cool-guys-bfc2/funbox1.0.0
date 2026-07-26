import { registerBlock, allBlocks, type BlockDef, type BlockType, rebuildIndex } from './blocks';
import { ENTITY_DEFS, type EntityDef, type EntityType } from './entities';
import { loadAddonScript, createGameAPI, type GameAPI, type AddonScript } from './scriptApi';
import type { Engine } from './engine';

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

export interface AddonItemDef {
  id: string;
  name: string;
  /** block this item places, if any */
  block?: BlockType;
  /** food value restored when eaten (0 = not edible) */
  food?: number;
  /** stack size */
  stack?: number;
}

export interface AddonEntityDef {
  id: string;
  name: string;
  hostile: boolean;
  health: number;
  speed: number;
  width: number;
  height: number;
  colors: [string, string, string];
  drops: { block: string; count: number }[];
}

export interface AddonRecipeDef {
  /** result item/block */
  result: string;
  count: number;
  /** shape: array of strings, each char a key. ' ' = empty */
  shape: string[];
  /** key map: char -> block id */
  keys: Record<string, string>;
}

export interface AddonCommandDef {
  name: string;
  help: string;
  /** JS/TS function body as string: (args, api) => message string */
  script: string;
}

export interface AddonScriptDef {
  /** JS/TS function body as string: (api, ctx) => { ... } */
  code: string;
}

export interface AddonManifest {
  id: string;
  name: string;
  author?: string;
  description?: string;
  blocks?: AddonBlockDef[];
  items?: AddonItemDef[];
  entities?: AddonEntityDef[];
  recipes?: AddonRecipeDef[];
  commands?: AddonCommandDef[];
  script?: AddonScriptDef;
}

const loadedAddons = new Map<string, AddonManifest>();
let boundEngine: Engine | null = null;
let boundAPI: GameAPI | null = null;

/** Bind an engine so addon scripts and commands can act on it. Called once at startup. */
export function bindEngine(engine: Engine) {
  boundEngine = engine;
  boundAPI = createGameAPI(engine);
}

export function getBoundAPI(): GameAPI | null {
  return boundAPI;
}

export function loadAddon(manifest: AddonManifest): { ok: boolean; error?: string; added: number } {
  if (loadedAddons.has(manifest.id)) {
    return { ok: false, error: `Addon '${manifest.id}' already loaded`, added: 0 };
  }
  let added = 0;

  // Blocks
  if (manifest.blocks) {
    for (const b of manifest.blocks) {
      if (allBlocks().some((bb) => bb.id === b.id)) continue;
      registerBlock({
        id: b.id,
        name: b.name,
        faces: { top: b.top, bottom: b.bottom ?? b.top, side: b.side ?? b.top },
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
  }

  // Items (register as blocks if they have a block property; otherwise track in item registry)
  if (manifest.items) {
    for (const it of manifest.items) {
      if (it.block) {
        // ensure the block exists
        if (!allBlocks().some((b) => b.id === it.block)) {
          registerBlock({
            id: it.block,
            name: it.name,
            faces: { top: '#cccccc', bottom: '#cccccc', side: '#cccccc' },
            solid: true,
            hardness: 0.5,
            addon: manifest.id,
          });
          added++;
        }
      }
      ITEM_REGISTRY.set(it.id, it);
    }
  }

  // Entities
  if (manifest.entities) {
    for (const e of manifest.entities) {
      const def: EntityDef = {
        id: e.id as EntityType,
        name: e.name,
        hostile: e.hostile,
        health: e.health,
        speed: e.speed,
        width: e.width,
        height: e.height,
        colors: e.colors,
        drops: e.drops,
      };
      ENTITY_DEFS[e.id as EntityType] = def;
      added++;
    }
  }

  // Recipes
  if (manifest.recipes) {
    for (const r of manifest.recipes) {
      RECIPES.push(r);
    }
  }

  // Commands
  if (manifest.commands) {
    for (const c of manifest.commands) {
      try {
        const fn = new Function('args', 'api', c.script) as (args: string[], api: GameAPI) => string;
        CUSTOM_COMMANDS.set(c.name.toLowerCase(), { help: c.help, fn });
      } catch (err: any) {
        console.warn(`Failed to compile command '${c.name}' in addon '${manifest.id}':`, err);
      }
    }
  }

  // Script
  if (manifest.script && boundAPI) {
    try {
      const fn = new Function('api', 'ctx', manifest.script.code) as (api: GameAPI, ctx: any) => void;
      const result = loadAddonScript(manifest.id, fn, boundAPI);
      if (!result.ok) {
        console.warn(`Failed to load script for addon '${manifest.id}':`, result.error);
      }
    } catch (err: any) {
      console.warn(`Failed to compile script for addon '${manifest.id}':`, err);
    }
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

// ---- Item registry ----
const ITEM_REGISTRY = new Map<string, AddonItemDef>();
export function getItem(id: string): AddonItemDef | undefined {
  return ITEM_REGISTRY.get(id);
}
export function allItems(): AddonItemDef[] {
  return Array.from(ITEM_REGISTRY.values());
}

// ---- Recipe registry ----
export const RECIPES: AddonRecipeDef[] = [];

// ---- Custom commands (from addons) ----
export interface CustomCommand {
  help: string;
  fn: (args: string[], api: GameAPI) => string;
}
export const CUSTOM_COMMANDS = new Map<string, CustomCommand>();

/** Run a custom command, returning a message. Returns null if command not found. */
export function runCustomCommand(name: string, args: string[]): string | null {
  const c = CUSTOM_COMMANDS.get(name.toLowerCase());
  if (!c || !boundAPI) return null;
  return c.fn(args, boundAPI);
}

// ---- Built-in sample addons ----
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
  {
    id: 'magic',
    name: 'Magic Pack',
    author: 'MiniCraft',
    description: 'Adds a magic wand command and a regen-tick script. Demonstrates the scripting API.',
    items: [
      { id: 'magic_essence', name: 'Magic Essence', food: 4 },
    ],
    commands: [
      {
        name: 'wand',
        help: '/wand — grant a magic essence item',
        script: `
          const leftover = api.player.give('magic_essence', 1);
          return 'You received magic essence' + (leftover > 0 ? ' (bag full!)' : '');
        `,
      },
      {
        name: 'rain',
        help: '/rain — make it rain instantly',
        script: `
          api.time.setWeather('rain');
          return 'The skies darken...';
        `,
      },
    ],
    script: {
      code: `
        // Heal the player slightly every 5 seconds when holding still
        let timer = 0;
        api.on('tick', (dt) => {
          timer += dt;
          if (timer >= 5) {
            timer = 0;
            if (api.player.health < 20 && api.chance) {
              // api.util.chance
            }
          }
        });
        api.on('blockBreak', (x, y, z, block) => {
          if (block === 'diamond') {
            api.chat.message('A diamond was mined at ' + x + ',' + y + ',' + z + '!');
          }
        });
      `,
    },
  },
];

// Load built-in addons on import
for (const a of BUILTIN_ADDONS) loadAddon(a);
// Rebuild the dynamic block index now that core + addon blocks are registered.
rebuildIndex();
