import type { Engine } from './engine';
import { GAME_MODE_LIST, type GameMode } from './gameModes';
import { allBlocks, type BlockType } from './blocks';
import { ENTITY_DEFS, type EntityType } from './entities';
import { runCustomCommand } from './addons';

export interface CommandResult {
  ok: boolean;
  message: string;
}

type CommandFn = (args: string[], engine: Engine) => CommandResult;

const commands = new Map<string, { fn: CommandFn; help: string }>();

function parseBlock(arg: string): BlockType | null {
  const lower = arg.toLowerCase();
  if (allBlocks().some((b) => b.id === lower)) return lower;
  return null;
}

function parseEntityType(arg: string): EntityType | null {
  const lower = arg.toLowerCase() as EntityType;
  if (ENTITY_DEFS[lower]) return lower;
  return null;
}

function parseNumber(arg: string | undefined): number | null {
  if (arg === undefined) return null;
  const n = Number(arg);
  if (Number.isNaN(n)) return null;
  return n;
}

// /give <block> [count]
commands.set('give', {
  help: '/give <block> [count] — add blocks to your inventory',
  fn: (args, engine) => {
    if (args.length < 1) return { ok: false, message: 'Usage: /give <block> [count]' };
    const block = parseBlock(args[0]);
    if (!block) return { ok: false, message: `Unknown block: ${args[0]}` };
    const count = parseNumber(args[1]) ?? 1;
    if (count <= 0) return { ok: false, message: 'Count must be positive' };
    const leftover = engine.inventory.add(block, count);
    engine.refreshUI();
    return {
      ok: true,
      message: `Gave ${count} ${block}${leftover > 0 ? ` (inventory full, ${leftover} lost)` : ''}`,
    };
  },
});

// /gamemode <mode>
commands.set('gamemode', {
  help: '/gamemode <survival|creative|adventure|spectator> — change game mode',
  fn: (args, engine) => {
    if (args.length < 1) return { ok: false, message: 'Usage: /gamemode <mode>' };
    const mode = args[0].toLowerCase() as GameMode;
    if (!GAME_MODE_LIST.includes(mode)) {
      return { ok: false, message: `Unknown mode. Options: ${GAME_MODE_LIST.join(', ')}` };
    }
    engine.setGameMode(mode);
    return { ok: true, message: `Game mode set to ${mode}` };
  },
});

// /gm shortcut
commands.set('gm', { help: '/gm <mode> — shortcut for /gamemode', fn: (a, e) => commands.get('gamemode')!.fn(a, e) });

// /tp <x> <y> <z>
commands.set('tp', {
  help: '/tp <x> <y> <z> — teleport to coordinates',
  fn: (args, engine) => {
    if (args.length < 3) return { ok: false, message: 'Usage: /tp <x> <y> <z>' };
    const x = parseNumber(args[0]);
    const y = parseNumber(args[1]);
    const z = parseNumber(args[2]);
    if (x === null || y === null || z === null) return { ok: false, message: 'Coordinates must be numbers' };
    engine.teleport(x, y, z);
    return { ok: true, message: `Teleported to ${x}, ${y}, ${z}` };
  },
});

// /summon <entity> [x] [y] [z]
commands.set('summon', {
  help: '/summon <pig|cow|sheep|chicken|zombie|skeleton> [x y z]',
  fn: (args, engine) => {
    if (args.length < 1) return { ok: false, message: 'Usage: /summon <entity> [x y z]' };
    const type = parseEntityType(args[0]);
    if (!type) return { ok: false, message: `Unknown entity: ${args[0]}` };
    let x: number;
    let y: number;
    let z: number;
    if (args.length >= 4) {
      x = parseNumber(args[1]) ?? 0;
      y = parseNumber(args[2]) ?? 0;
      z = parseNumber(args[3]) ?? 0;
    } else {
      const p = engine.player.position;
      x = p.x;
      y = p.y;
      z = p.z;
    }
    engine.summon(type, x, y, z);
    return { ok: true, message: `Summoned ${type} at ${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}` };
  },
});

// /setblock <x> <y> <z> <block>
commands.set('setblock', {
  help: '/setblock <x> <y> <z> <block> — place a block at coordinates',
  fn: (args, engine) => {
    if (args.length < 4) return { ok: false, message: 'Usage: /setblock <x> <y> <z> <block>' };
    const x = Math.floor(parseNumber(args[0]) ?? NaN);
    const y = Math.floor(parseNumber(args[1]) ?? NaN);
    const z = Math.floor(parseNumber(args[2]) ?? NaN);
    const block = parseBlock(args[3]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return { ok: false, message: 'Coordinates must be numbers' };
    if (!block) return { ok: false, message: `Unknown block: ${args[3]}` };
    engine.setBlock(x, y, z, block);
    return { ok: true, message: `Set block at ${x}, ${y}, ${z} to ${block}` };
  },
});

// /fill <x1> <y1> <z1> <x2> <y2> <z2> <block>
commands.set('fill', {
  help: '/fill <x1 y1 z1> <x2 y2 z2> <block> — fill a region',
  fn: (args, engine) => {
    if (args.length < 7) return { ok: false, message: 'Usage: /fill <x1 y1 z1> <x2 y2 z2> <block>' };
    const x1 = Math.floor(parseNumber(args[0]) ?? NaN);
    const y1 = Math.floor(parseNumber(args[1]) ?? NaN);
    const z1 = Math.floor(parseNumber(args[2]) ?? NaN);
    const x2 = Math.floor(parseNumber(args[3]) ?? NaN);
    const y2 = Math.floor(parseNumber(args[4]) ?? NaN);
    const z2 = Math.floor(parseNumber(args[5]) ?? NaN);
    const block = parseBlock(args[6]);
    if ([x1, y1, z1, x2, y2, z2].some(Number.isNaN)) return { ok: false, message: 'Coordinates must be numbers' };
    if (!block) return { ok: false, message: `Unknown block: ${args[6]}` };
    const count = engine.fillRegion(x1, y1, z1, x2, y2, z2, block);
    return { ok: true, message: `Filled ${count} blocks with ${block}` };
  },
});

// /time <day|night|noon|midnight>
commands.set('time', {
  help: '/time <day|night|noon|midnight> — set the time of day',
  fn: (args, engine) => {
    if (args.length < 1) return { ok: false, message: 'Usage: /time <day|night|noon|midnight>' };
    const map: Record<string, number> = { day: 0.25, noon: 0.5, night: 0.9, midnight: 0.0 };
    const t = map[args[0].toLowerCase()];
    if (t === undefined) return { ok: false, message: 'Unknown time. Options: day, night, noon, midnight' };
    engine.setTimeOfDay(t);
    return { ok: true, message: `Time set to ${args[0].toLowerCase()}` };
  },
});

// /heal
commands.set('heal', {
  help: '/heal — restore health and hunger to full',
  fn: (_args, engine) => {
    engine.heal();
    return { ok: true, message: 'Healed to full health and hunger' };
  },
});

// /kill [entity]
commands.set('kill', {
  help: '/kill — kill nearby entities (or yourself)',
  fn: (_args, engine) => {
    const n = engine.killNearbyEntities();
    return { ok: true, message: `Killed ${n} nearby entities` };
  },
});

// /clear
commands.set('clear', {
  help: '/clear — empty your inventory',
  fn: (_args, engine) => {
    engine.inventory.clear();
    engine.refreshUI();
    return { ok: true, message: 'Inventory cleared' };
  },
});

// /help
commands.set('help', {
  help: '/help — list available commands',
  fn: () => {
    const lines = Array.from(commands.entries()).map(([name, c]) => `  ${c.help}`);
    return { ok: true, message: 'Commands:\n' + lines.join('\n') };
  },
});

// /weather <clear|rain|snow>
commands.set('weather', {
  help: '/weather <clear|rain|snow> — change the weather',
  fn: (args, engine) => {
    if (args.length < 1) return { ok: false, message: 'Usage: /weather <clear|rain|snow>' };
    const w = args[0].toLowerCase();
    if (w !== 'clear' && w !== 'rain' && w !== 'snow') {
      return { ok: false, message: 'Unknown weather. Options: clear, rain, snow' };
    }
    engine.setWeather(w as 'clear' | 'rain' | 'snow');
    return { ok: true, message: `Weather set to ${w}` };
  },
});

export function runCommand(input: string, engine: Engine): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return { ok: false, message: 'Commands must start with /' };
  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);
  const cmd = commands.get(name);
  if (!cmd) {
    // Try addon-provided custom commands
    const custom = runCustomCommand(name, args);
    if (custom !== null) return { ok: true, message: custom };
    return { ok: false, message: `Unknown command: /${name}. Try /help` };
  }
  try {
    return cmd.fn(args, engine);
  } catch (err: any) {
    return { ok: false, message: `Error: ${err?.message ?? String(err)}` };
  }
}

export function commandHelp(): string[] {
  return Array.from(commands.values()).map((c) => c.help);
}
