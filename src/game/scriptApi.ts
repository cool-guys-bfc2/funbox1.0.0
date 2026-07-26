import type { Engine } from './engine';
import type { BlockType } from './blocks';
import type { EntityType } from './entities';
import type { GameMode } from './gameModes';
import type { Weather } from './engine';

/**
 * The game API exposed to addon scripts.
 * Addons receive an instance of this and can call these methods to control
 * the world, player, entities, time, weather, and listen to events.
 */
export interface GameAPI {
  /** Get the block at world coordinates. */
  getBlock(x: number, y: number, z: number): BlockType;
  /** Set a block at world coordinates. Returns true on success. */
  setBlock(x: number, y: number, z: number, block: BlockType): boolean;
  /** Get the highest non-air block y at x,z. -1 if none. */
  topY(x: number, z: number): number;
  /** Fill a rectangular region. Returns count placed. */
  fill(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: BlockType): number;

  // Player
  player: {
    pos(): { x: number; y: number; z: number };
    teleport(x: number, y: number, z: number): void;
    health: number;
    food: number;
    mode: GameMode;
    flying: boolean;
    setMode(m: GameMode): void;
    heal(): void;
    give(block: BlockType, count?: number): number;
  };

  // Entities
  entities: {
    spawn(type: EntityType, x: number, y: number, z: number): boolean;
    killAll(): number;
    killNearby(radius: number): number;
    list(): { type: EntityType; x: number; y: number; z: number; health: number }[];
  };

  // Time & weather
  time: {
    get(): number;
    set(t: number): void;
    setWeather(w: Weather): void;
    getWeather(): Weather;
  };

  // Messaging
  chat: {
    message(text: string): void;
  };

  // Events — addons register handlers
  on(event: 'tick' | 'blockBreak' | 'blockPlace' | 'playerDamage', handler: (data: any) => void): void;

  // Utilities
  util: {
    random(min: number, max: number): number;
    chance(p: number): boolean;
    lerp(a: number, b: number, t: number): number;
  };
}

export interface ScriptContext {
  api: GameAPI;
  addonId: string;
}

export interface AddonScript {
  /** Called once when the addon loads. Use api.on() to register handlers. */
  init(ctx: ScriptContext): void;
}

/** Registry of loaded script handlers, keyed by addon id. */
interface LoadedScript {
  addonId: string;
  tickHandlers: Array<(dt: number) => void>;
  blockBreakHandlers: Array<(x: number, y: number, z: number, block: BlockType) => void>;
  blockPlaceHandlers: Array<(x: number, y: number, z: number, block: BlockType) => void>;
  playerDamageHandlers: Array<(amount: number) => void>;
}

const loadedScripts = new Map<string, LoadedScript>();

function emptyScript(addonId: string): LoadedScript {
  return { addonId, tickHandlers: [], blockBreakHandlers: [], blockPlaceHandlers: [], playerDamageHandlers: [] };
}

let activeScript: LoadedScript | null = null;

/** Create a GameAPI bound to a specific engine instance. */
export function createGameAPI(engine: Engine): GameAPI {
  return {
    getBlock: (x, y, z) => engine.world.get(x, y, z),
    setBlock: (x, y, z, block) => {
      engine.setBlock(x, y, z, block);
      return true;
    },
    topY: (x, z) => engine.world.topSolidY(x, z),
    fill: (x1, y1, z1, x2, y2, z2, block) => engine.fillRegion(x1, y1, z1, x2, y2, z2, block),

    player: {
      pos: () => ({
        x: engine.player.position.x,
        y: engine.player.position.y,
        z: engine.player.position.z,
      }),
      teleport: (x, y, z) => engine.teleport(x, y, z),
      get health() { return engine.health; },
      get food() { return engine.food; },
      get mode() { return engine.mode; },
      get flying() { return engine.player.flying; },
      setMode: (m) => engine.setGameMode(m),
      heal: () => engine.heal(),
      give: (block, count = 1) => engine.inventory.add(block, count),
    },

    entities: {
      spawn: (type, x, y, z) => {
        engine.summon(type, x, y, z);
        return true;
      },
      killAll: () => {
        let n = 0;
        for (const e of engine.entities.entities) {
          if (!e.dead) { e.dead = true; n++; }
        }
        return n;
      },
      killNearby: (radius) => {
        let n = 0;
        for (const e of engine.entities.entities) {
          if (e.dead) continue;
          if (e.position.distanceTo(engine.player.position) < radius) {
            e.dead = true; n++;
          }
        }
        return n;
      },
      list: () => engine.entities.entities.filter(e => !e.dead).map(e => ({
        type: e.type,
        x: e.position.x,
        y: e.position.y,
        z: e.position.z,
        health: e.health,
      })),
    },

    time: {
      get: () => engine.timeOfDay,
      set: (t) => engine.setTimeOfDay(t),
      setWeather: (w) => engine.setWeather(w),
      getWeather: () => engine.weather,
    },

    chat: {
      message: (text) => engine.message(text, 'info'),
    },

    on: (event, handler) => {
      if (!activeScript) return;
      if (event === 'tick') activeScript.tickHandlers.push(handler as any);
      else if (event === 'blockBreak') activeScript.blockBreakHandlers.push(handler as any);
      else if (event === 'blockPlace') activeScript.blockPlaceHandlers.push(handler as any);
      else if (event === 'playerDamage') activeScript.playerDamageHandlers.push(handler as any);
    },

    util: {
      random: (min, max) => min + Math.random() * (max - min),
      chance: (p) => Math.random() < p,
      lerp: (a, b, t) => a + (b - a) * t,
    },
  };
}

/** Load and run an addon script. The script is a function taking (api, ctx). */
export function loadAddonScript(
  addonId: string,
  scriptFn: (api: GameAPI, ctx: ScriptContext) => void,
  api: GameAPI
): { ok: boolean; error?: string } {
  if (loadedScripts.has(addonId)) {
    return { ok: false, error: `Script for '${addonId}' already loaded` };
  }
  const s = emptyScript(addonId);
  loadedScripts.set(addonId, s);
  activeScript = s;
  try {
    scriptFn(api, { api, addonId });
  } catch (err: any) {
    loadedScripts.delete(addonId);
    activeScript = null;
    return { ok: false, error: err?.message ?? String(err) };
  }
  activeScript = null;
  return { ok: true };
}

/** Dispatch a tick event to all loaded scripts. */
export function dispatchTick(dt: number) {
  for (const s of loadedScripts.values()) {
    for (const h of s.tickHandlers) {
      try { h(dt); } catch { /* swallow per-handler errors */ }
    }
  }
}

export function dispatchBlockBreak(x: number, y: number, z: number, block: BlockType) {
  for (const s of loadedScripts.values()) {
    for (const h of s.blockBreakHandlers) {
      try { h(x, y, z, block); } catch { /* ignore */ }
    }
  }
}

export function dispatchBlockPlace(x: number, y: number, z: number, block: BlockType) {
  for (const s of loadedScripts.values()) {
    for (const h of s.blockPlaceHandlers) {
      try { h(x, y, z, block); } catch { /* ignore */ }
    }
  }
}

export function dispatchPlayerDamage(amount: number) {
  for (const s of loadedScripts.values()) {
    for (const h of s.playerDamageHandlers) {
      try { h(amount); } catch { /* ignore */ }
    }
  }
}

export function unloadAddonScript(addonId: string) {
  loadedScripts.delete(addonId);
}

export function isScriptLoaded(addonId: string): boolean {
  return loadedScripts.has(addonId);
}

export function loadedScriptIds(): string[] {
  return Array.from(loadedScripts.keys());
}
