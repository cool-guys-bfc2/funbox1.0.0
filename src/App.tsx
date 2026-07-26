import { useEffect, useRef, useState, useCallback } from 'react';
import { Engine, type Weather } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { GAME_MODES, GAME_MODE_LIST, type GameMode } from '@/game/gameModes';
import { allBlocks, getBlock, type BlockType } from '@/game/blocks';
import { listAddons, BUILTIN_ADDONS, loadAddon, type AddonManifest } from '@/game/addons';
import type { InventorySlot } from '@/game/inventory';

interface LogEntry {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

let logId = 1;

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState(0);
  const [flying, setFlying] = useState(false);
  const [mode, setMode] = useState<GameMode>('survival');
  const [health, setHealth] = useState(20);
  const [maxHealth, setMaxHealth] = useState(20);
  const [food, setFood] = useState(20);
  const [maxFood, setMaxFood] = useState(20);
  const [inventory, setInventory] = useState<(InventorySlot | null)[]>(new Array(36).fill(null));
  const [showInventory, setShowInventory] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showAddons, setShowAddons] = useState(false);
  const [consoleInput, setConsoleInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [timeOfDay, setTimeOfDay] = useState(0.3);
  const [weather, setWeather] = useState<Weather>('clear');
  const [loaded, setLoaded] = useState(false);
  const [addons, setAddons] = useState<AddonManifest[]>(listAddons());

  const refreshInventory = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    setInventory([...eng.inventory.slots]);
    setSelected(eng.inventory.selected);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new Engine(containerRef.current, {
      onLockChange: (l) => {
        setLocked(l);
        if (!l) {
          setShowInventory(false);
          setShowConsole(false);
        }
      },
      onSelectedChange: setSelected,
      onFlyChange: setFlying,
      onModeChange: setMode,
      onHealthChange: (h, mh) => {
        setHealth(h);
        setMaxHealth(mh);
      },
      onFoodChange: (f, mf) => {
        setFood(f);
        setMaxFood(mf);
      },
      onInventoryChange: refreshInventory,
      onTimeChange: setTimeOfDay,
      onWeatherChange: setWeather,
      onMessage: (text, kind) => {
        setLog((prev) => [...prev.slice(-40), { id: logId++, text, kind }]);
      },
      onLoaded: () => {
        setLoaded(true);
        refreshInventory();
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.flushSave();
      engine.dispose();
      engineRef.current = null;
    };
  }, [refreshInventory]);

  // open console with T or /
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return;
      if (e.code === 'KeyT' || e.code === 'Slash') {
        if (engineRef.current?.player.isLocked()) {
          e.preventDefault();
          document.exitPointerLock();
          setShowConsole(true);
          if (e.code === 'Slash') setConsoleInput('/');
        }
      }
      if (e.code === 'KeyE') {
        if (engineRef.current?.player.isLocked()) {
          e.preventDefault();
          document.exitPointerLock();
          setShowInventory(true);
        }
      }
      if (e.code === 'Escape') {
        setShowConsole(false);
        setShowInventory(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started]);

  const handleStart = () => {
    setStarted(true);
    engineRef.current?.requestLock();
  };

  const handleResume = () => {
    setShowInventory(false);
    setShowConsole(false);
    setShowAddons(false);
    engineRef.current?.requestLock();
  };

  const runConsole = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const result = runCommand(consoleInput, eng);
    setLog((prev) => [...prev.slice(-40), { id: logId++, text: result.message, kind: result.ok ? 'info' : 'error' }]);
    setConsoleInput('');
    refreshInventory();
  };

  const handleHotbarClick = (i: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.inventory.selected = i;
    setSelected(i);
  };

  const handleAddonToggle = (manifest: AddonManifest) => {
    const result = loadAddon(manifest);
    setAddons(listAddons());
    setLog((prev) => [
      ...prev.slice(-40),
      { id: logId++, text: `${result.ok ? 'Loaded' : 'Failed to load'} addon '${manifest.name}'${result.error ? `: ${result.error}` : ` (${result.added} blocks)`}`, kind: result.ok ? 'info' : 'error' },
    ]);
  };

  const survival = mode === 'survival';
  const blockList = allBlocks();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black select-none">
      <div ref={containerRef} className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} />

      {/* Crosshair */}
      {locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-6 w-6 opacity-80 mix-blend-difference">
            <div className="absolute left-1/2 top-0 h-6 w-[2px] -translate-x-1/2 bg-white" />
            <div className="absolute top-1/2 left-0 h-[2px] w-6 -translate-y-1/2 bg-white" />
          </div>
        </div>
      )}

      {/* Top-left HUD: mode, time, weather */}
      {locked && (
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-black/45 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur">
              {GAME_MODES[mode].name}
            </span>
            {flying && (
              <span className="rounded-md bg-black/45 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-white/15 backdrop-blur">
                Flying
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/80">
            <span className="rounded-md bg-black/45 px-2 py-0.5 ring-1 ring-white/10 backdrop-blur">
              {timeLabel(timeOfDay)}
            </span>
            {weather !== 'clear' && (
              <span className="rounded-md bg-black/45 px-2 py-0.5 ring-1 ring-white/10 backdrop-blur">
                {weather === 'rain' ? 'Rain' : 'Snow'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Survival stats: health + food */}
      {locked && survival && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Heart key={i} filled={i < Math.floor(health / 2)} half={health % 2 === 1 && i === Math.floor(health / 2)} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Drumstick key={i} filled={i < Math.floor(food / 2)} half={food % 2 === 1 && i === Math.floor(food / 2)} />
            ))}
          </div>
        </div>
      )}

      {/* Hotbar */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
        <div className="flex gap-1 rounded-lg bg-black/45 p-1.5 backdrop-blur-sm ring-1 ring-white/15">
          {Array.from({ length: 9 }).map((_, i) => {
            const slot = inventory[i];
            const isSel = i === selected;
            return (
              <button
                key={i}
                onClick={() => handleHotbarClick(i)}
                className={`relative h-12 w-12 rounded-md ring-2 transition-all ${
                  isSel ? 'ring-white scale-110 bg-white/20' : 'ring-white/10 bg-white/5'
                }`}
                title={slot ? getBlock(slot.block)?.name : ''}
              >
                {slot && <BlockSwatch block={slot.block} />}
                {slot && slot.count > 1 && (
                  <span className="absolute bottom-0.5 right-1 text-[11px] font-bold text-white drop-shadow">
                    {slot.count}
                  </span>
                )}
                <span className="absolute left-1 top-0.5 text-[10px] font-bold text-white/60">{i + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading overlay */}
      {started && !loaded && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-emerald-400" />
            <p className="text-sm font-medium text-white/80">Loading your world…</p>
          </div>
        </div>
      )}

      {/* Start screen */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b from-sky-900/80 via-slate-900/85 to-black/90 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl bg-slate-800/70 p-8 text-center ring-1 ring-white/10 shadow-2xl">
            <h1 className="mb-1 text-4xl font-extrabold tracking-tight text-white drop-shadow">
              Mini<span className="text-emerald-400">Craft</span>
            </h1>
            <p className="mb-6 text-sm text-slate-300">
              A voxel sandbox. Explore, mine, build, survive — with entities, structures, inventory, game modes, commands, and add-ons.
            </p>
            <button
              onClick={handleStart}
              className="w-full rounded-xl bg-emerald-500 px-6 py-3 text-lg font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-[0.98]"
            >
              Play
            </button>
            <ControlsHelp />
          </div>
        </div>
      )}

      {/* Pause overlay */}
      {started && loaded && !locked && !showInventory && !showConsole && !showAddons && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-2xl bg-slate-800/85 p-8 text-center ring-1 ring-white/10 shadow-2xl">
            <h2 className="mb-2 text-2xl font-bold text-white">Paused</h2>
            <p className="mb-6 text-sm text-slate-300">Click below to jump back into the world.</p>
            <button
              onClick={handleResume}
              className="w-full rounded-xl bg-emerald-500 px-6 py-3 text-lg font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-[0.98]"
            >
              Resume
            </button>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => setShowInventory(true)}
                className="rounded-lg bg-slate-700/70 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                Inventory
              </button>
              <button
                onClick={() => setShowConsole(true)}
                className="rounded-lg bg-slate-700/70 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                Commands
              </button>
              <button
                onClick={() => setShowAddons(true)}
                className="rounded-lg bg-slate-700/70 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                Add-ons
              </button>
            </div>
            <ControlsHelp />
          </div>
        </div>
      )}

      {/* Inventory screen */}
      {showInventory && (
        <InventoryScreen
          inventory={inventory}
          onClose={handleResume}
          onSlotClick={(i) => {
            const eng = engineRef.current;
            if (!eng) return;
            eng.inventory.selected = Math.min(i, 8);
            setSelected(Math.min(i, 8));
          }}
          blockList={blockList}
          mode={mode}
          onGive={(block) => {
            const eng = engineRef.current;
            if (!eng) return;
            eng.inventory.add(block, 1);
            refreshInventory();
          }}
        />
      )}

      {/* Command console */}
      {showConsole && (
        <ConsoleScreen
          input={consoleInput}
          setInput={setConsoleInput}
          log={log}
          onRun={runConsole}
          onClose={handleResume}
        />
      )}

      {/* Add-ons screen */}
      {showAddons && (
        <AddonsScreen
          loaded={addons}
          onToggle={handleAddonToggle}
          onClose={handleResume}
        />
      )}
    </div>
  );
}

function timeLabel(t: number): string {
  // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  const hours = Math.floor(((t + 0.0) % 1) * 24);
  const mins = Math.floor((((t + 0.0) % 1) * 24 - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function ControlsHelp() {
  const rows: [string, string][] = [
    ['Move', 'W A S D'],
    ['Jump', 'Space'],
    ['Sprint', 'Shift'],
    ['Look', 'Mouse'],
    ['Break', 'Left click (hold)'],
    ['Place', 'Right click'],
    ['Hotbar', '1–9 / Scroll'],
    ['Inventory', 'E'],
    ['Fly', 'F'],
    ['Up / Down', 'Space / Ctrl (fly)'],
    ['Commands', 'T or /'],
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1.5 text-left text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-slate-400">{k}</span>
          <span className="font-semibold text-slate-200">{v}</span>
        </div>
      ))}
    </div>
  );
}

function BlockSwatch({ block }: { block: BlockType }) {
  const def = getBlock(block);
  if (!def) return null;
  const top = def.faces.top;
  const side = def.faces.side;
  return (
    <div
      className="absolute inset-1.5 overflow-hidden rounded-sm"
      style={{
        background: `linear-gradient(160deg, ${top} 0%, ${top} 45%, ${side} 55%, ${side} 100%)`,
        imageRendering: 'pixelated',
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0 2px, transparent 2px 4px), repeating-linear-gradient(90deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 4px)',
        }}
      />
    </div>
  );
}

function Heart({ filled, half }: { filled: boolean; half: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 drop-shadow">
      <path
        d="M8 14s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 7c0 3.8-5 7-5 7z"
        fill={filled ? '#ff4d4d' : half ? '#a33' : 'rgba(0,0,0,0.35)'}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

function Drumstick({ filled, half }: { filled: boolean; half: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 drop-shadow">
      <circle cx="5" cy="5" r="3.2" fill={filled ? '#c0772a' : half ? '#7a4a18' : 'rgba(0,0,0,0.3)'} stroke="rgba(0,0,0,0.4)" strokeWidth="0.6" />
      <rect x="6.5" y="6.5" width="6" height="2.4" rx="1.2" transform="rotate(45 6.5 6.5)" fill={filled ? '#e8c39a' : half ? '#9a7a5a' : 'rgba(0,0,0,0.3)'} stroke="rgba(0,0,0,0.4)" strokeWidth="0.6" />
    </svg>
  );
}

// ---- Inventory Screen ----
function InventoryScreen({
  inventory,
  onClose,
  onSlotClick,
  blockList,
  mode,
  onGive,
}: {
  inventory: (InventorySlot | null)[];
  onClose: () => void;
  onSlotClick: (i: number) => void;
  blockList: ReturnType<typeof allBlocks>;
  mode: GameMode;
  onGive: (block: BlockType) => void;
}) {
  const creative = mode === 'creative';
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 max-w-2xl w-full rounded-2xl bg-slate-800/90 p-6 ring-1 ring-white/10 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Inventory</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-600">
            Close
          </button>
        </div>

        {/* Hotbar row */}
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Hotbar</p>
        <div className="mb-4 grid grid-cols-9 gap-1.5">
          {inventory.slice(0, 9).map((slot, i) => (
            <button
              key={i}
              onClick={() => onSlotClick(i)}
              className="relative h-12 w-full rounded-md bg-white/5 ring-1 ring-white/10 hover:ring-white/40 transition"
              title={slot ? getBlock(slot.block)?.name : ''}
            >
              {slot && <BlockSwatch block={slot.block} />}
              {slot && slot.count > 1 && (
                <span className="absolute bottom-0.5 right-1 text-[11px] font-bold text-white drop-shadow">{slot.count}</span>
              )}
              <span className="absolute left-1 top-0.5 text-[9px] font-bold text-white/50">{i + 1}</span>
            </button>
          ))}
        </div>

        {/* Main inventory */}
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Storage</p>
        <div className="mb-4 grid grid-cols-9 gap-1.5">
          {inventory.slice(9).map((slot, i) => (
            <div
              key={i}
              className="relative h-12 w-full rounded-md bg-white/5 ring-1 ring-white/10"
              title={slot ? getBlock(slot.block)?.name : ''}
            >
              {slot && <BlockSwatch block={slot.block} />}
              {slot && slot.count > 1 && (
                <span className="absolute bottom-0.5 right-1 text-[11px] font-bold text-white drop-shadow">{slot.count}</span>
              )}
            </div>
          ))}
        </div>

        {/* Creative block palette */}
        {creative && (
          <>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-400">Creative — click to add to inventory</p>
            <div className="max-h-44 overflow-y-auto rounded-lg bg-black/30 p-2">
              <div className="grid grid-cols-9 gap-1.5">
                {blockList.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onGive(b.id)}
                    className="relative h-12 w-full rounded-md bg-white/5 ring-1 ring-white/10 hover:ring-emerald-400 transition"
                    title={b.name}
                  >
                    <BlockSwatch block={b.id} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Console Screen ----
function ConsoleScreen({
  input,
  setInput,
  log,
  onRun,
  onClose,
}: {
  input: string;
  setInput: (s: string) => void;
  log: LogEntry[];
  onRun: () => void;
  onClose: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 max-w-2xl w-full rounded-2xl bg-slate-900/95 p-6 ring-1 ring-white/10 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Commands</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-600">
            Close
          </button>
        </div>
        <div ref={logRef} className="mb-3 h-56 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed">
          {log.length === 0 && <p className="text-slate-500">Type /help for a list of commands.</p>}
          {log.map((l) => (
            <div key={l.id} className={l.kind === 'error' ? 'text-red-400' : 'text-emerald-300'}>
              {l.text.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onRun();
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command (e.g. /give stone 64)"
            className="flex-1 rounded-lg bg-slate-800 px-3 py-2 font-mono text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-emerald-400"
          />
          <button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400">
            Run
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Tip: try /help, /gamemode creative, /tp 32 30 32, /summon zombie, /fill 0 1 0 5 5 5 stone, /time night, /weather rain</p>
      </div>
    </div>
  );
}

// ---- Add-ons Screen ----
function AddonsScreen({
  loaded,
  onToggle,
  onClose,
}: {
  loaded: AddonManifest[];
  onToggle: (m: AddonManifest) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 max-w-2xl w-full rounded-2xl bg-slate-800/90 p-6 ring-1 ring-white/10 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Add-ons</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-600">
            Close
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Add-ons add new blocks to the game. Loaded add-ons: {loaded.length}.
        </p>
        <div className="space-y-3">
          {BUILTIN_ADDONS.map((a) => {
            const isLoaded = loaded.some((l) => l.id === a.id);
            return (
              <div key={a.id} className="rounded-xl bg-slate-700/50 p-4 ring-1 ring-white/10">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white">{a.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">{a.description}</p>
                    <p className="mt-1 text-xs text-emerald-400">{a.blocks?.length ?? 0} blocks</p>
                  </div>
                  <button
                    onClick={() => onToggle(a)}
                    disabled={isLoaded}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      isLoaded
                        ? 'bg-emerald-700/50 text-emerald-300 cursor-default'
                        : 'bg-emerald-500 text-white hover:bg-emerald-400'
                    }`}
                  >
                    {isLoaded ? 'Loaded' : 'Load'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
