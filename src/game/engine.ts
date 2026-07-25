import * as THREE from 'three';
import { World, CHUNK_SIZE } from './world';
import { VoxelRenderer } from './voxelRenderer';
import { Player } from './player';
import {
  allBlocks,
  getBlock,
  isSolid,
  isLiquid,
  type BlockType,
} from './blocks';
import { Inventory } from './inventory';
import { GAME_MODES, type GameMode } from './gameModes';
import { EntityManager, ENTITY_DEFS, type EntityType } from './entities';
import {
  loadWorldEdits,
  saveWorldEdit,
  deleteWorldEdit,
  loadPlayerState,
  savePlayerState,
} from './persistence';

export type Weather = 'clear' | 'rain' | 'snow';

export interface EngineCallbacks {
  onLockChange?: (locked: boolean) => void;
  onSelectedChange?: (slot: number) => void;
  onFlyChange?: (flying: boolean) => void;
  onModeChange?: (mode: GameMode) => void;
  onHealthChange?: (health: number, maxHealth: number) => void;
  onFoodChange?: (food: number, maxFood: number) => void;
  onInventoryChange?: () => void;
  onTimeChange?: (timeOfDay: number) => void;
  onWeatherChange?: (weather: Weather) => void;
  onMessage?: (message: string, kind: 'info' | 'error') => void;
  onLoaded?: () => void;
}

const DAY_LENGTH = 600; // seconds for a full day-night cycle
const FOOD_TICK_INTERVAL = 6; // seconds per food drain
const REGEN_INTERVAL = 4; // seconds per health regen when full food

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: World;
  voxels: VoxelRenderer;
  player: Player;
  inventory = new Inventory();
  entities: EntityManager;
  private callbacks: EngineCallbacks;
  private container: HTMLElement;

  mode: GameMode = 'survival';
  health = 20;
  maxHealth = 20;
  food = 20;
  maxFood = 20;
  timeOfDay = 0.3; // 0..1
  weather: Weather = 'clear';

  private highlight: THREE.LineSegments;
  private raf = 0;
  private last = 0;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private amb: THREE.AmbientLight;
  private rainParticles: THREE.Points | null = null;
  private foodTimer = 0;
  private regenTimer = 0;
  private miningTarget: { x: number; y: number; z: number } | null = null;
  private miningProgress = 0;
  private miningOverlay: THREE.Mesh;
  private dirty = false;
  private loaded = false;
  private saveTimer = 0;
  private entitySpawnTimer = 0;
  private lastChunkX = Number.NaN;
  private lastChunkZ = Number.NaN;
  private readonly RENDER_RADIUS = 6; // chunks
  private spawnInitialized = false;

  constructor(container: HTMLElement, callbacks: EngineCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.cursor = 'crosshair';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9ad7ff');
    this.scene.fog = new THREE.Fog('#9ad7ff', 45, 95);

    this.camera = new THREE.PerspectiveCamera(
      72,
      container.clientWidth / container.clientHeight,
      0.05,
      500
    );

    this.world = new World(20260725);
    this.voxels = new VoxelRenderer(this.world);
    this.scene.add(this.voxels.group);

    this.player = new Player(this.world, this.camera, this.renderer.domElement);
    this.player.spawn();

    this.entities = new EntityManager(this.scene, this.world);
    this.entities.onPlayerDamage = (amount) => this.takeDamage(amount);

    // lighting
    this.sun = new THREE.DirectionalLight('#fff6e0', 1.15);
    this.sun.position.set(50, 80, 30);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight('#bfe3ff', '#5a4a32', 0.65);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight('#ffffff', 0.25);
    this.scene.add(this.amb);

    // selection highlight
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    const mat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
    });
    this.highlight = new THREE.LineSegments(edges, mat);
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // mining progress overlay (a translucent black box)
    const overlayMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.miningOverlay = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), overlayMat);
    this.miningOverlay.visible = false;
    this.scene.add(this.miningOverlay);

    this.bindEvents();
    this.loop = this.loop.bind(this);

    // async load saved data
    this.loadSaved();
  }

  private async loadSaved() {
    try {
      const [edits, state] = await Promise.all([loadWorldEdits(), loadPlayerState()]);
      for (const e of edits) {
        this.world.applyEdit(e.x, e.y, e.z, e.block as BlockType);
      }
      if (state) {
        this.mode = state.mode;
        this.health = state.health;
        this.food = state.food;
        this.player.flying = state.flying;
        if (state.position) {
          this.player.position.set(state.position.x, state.position.y, state.position.z);
        }
        this.player.yaw = state.yaw ?? 0;
        this.player.pitch = state.pitch ?? 0;
        this.inventory.fromJSON(state.inventory);
        this.applyMode(this.mode, false);
        this.callbacks.onModeChange?.(this.mode);
        this.callbacks.onHealthChange?.(this.health, this.maxHealth);
        this.callbacks.onFoodChange?.(this.food, this.maxFood);
        this.callbacks.onInventoryChange?.();
        this.callbacks.onFlyChange?.(this.player.flying);
      }
    } catch (err) {
      // ignore — fresh world
    } finally {
      this.loaded = true;
      this.updateChunksAroundPlayer();
      this.voxels.update();
      this.entities.populateNearPlayer();
      this.spawnInitialized = true;
      this.callbacks.onLoaded?.();
    }
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.player.dispose();
    this.entities.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('mousedown', this.onCanvasMouseDown);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  requestLock() {
    this.renderer.domElement.requestPointerLock();
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('mousedown', this.onCanvasMouseDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onPointerLockChange = () => {
    this.callbacks.onLockChange?.(this.player.isLocked());
  };

  private onMouseMove = (e: MouseEvent) => {
    this.player.onMouseMove(e);
  };

  private onCanvasMouseDown = (e: MouseEvent) => {
    if (!this.player.isLocked()) return;
    e.preventDefault();
    const def = GAME_MODES[this.mode];
    if (e.button === 0) {
      // left click: break block OR attack entity
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const killed = this.entities.meleeAttack(this.camera.position.clone(), dir, 4);
      if (killed) {
        for (const drop of this.entities.collectDrops(killed)) {
          this.inventory.add(drop.block, drop.count);
        }
        this.refreshUI();
        return;
      }
      if (!def.canBreak) return;
      this.startMining();
    } else if (e.button === 2) {
      if (!def.canPlace) return;
      this.placeBlock();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.player.isLocked()) return;
    if (e.code === 'KeyF') {
      this.player.toggleFly();
      this.callbacks.onFlyChange?.(this.player.flying);
    }
    if (/^Digit[1-9]$/.test(e.code)) {
      const i = parseInt(e.code.slice(5), 10) - 1;
      this.inventory.selected = i;
      this.callbacks.onSelectedChange?.(i);
    }
  };

  private onKeyUp = (_e: KeyboardEvent) => {
    // stop mining when mouse released is handled separately
  };

  private startMining() {
    const hit = this.player.raycast();
    if (!hit) {
      this.miningTarget = null;
      return;
    }
    this.miningTarget = { x: hit.x, y: hit.y, z: hit.z };
    this.miningProgress = 0;
    const def = GAME_MODES[this.mode];
    if (def.infiniteBlocks || this.mode === 'creative') {
      // instant break in creative
      this.breakBlock(hit.x, hit.y, hit.z);
      this.miningTarget = null;
    }
  }

  private breakBlock(x: number, y: number, z: number) {
    const block = this.world.get(x, y, z);
    if (block === 'air' || block === 'bedrock') return;
    this.world.set(x, y, z, 'air');
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    this.voxels.markDirty(cx, cz, lx === 0 || lx === CHUNK_SIZE - 1 || lz === 0 || lz === CHUNK_SIZE - 1);
    deleteWorldEdit(x, y, z);
    // drop
    const def = getBlock(block);
    const drop = def?.drop ?? block;
    if (drop !== 'none' && this.mode !== 'creative') {
      this.inventory.add(drop, 1);
      this.refreshUI();
    }
  }

  private placeBlock() {
    const hit = this.player.raycast();
    if (!hit) return;
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    if (!this.world.inBounds(px, py, pz)) return;
    const existing = this.world.get(px, py, pz);
    if (existing !== 'air' && !isLiquid(existing)) return;
    const def = GAME_MODES[this.mode];
    let block: BlockType | null;
    if (def.infiniteBlocks) {
      block = this.inventory.selectedBlock();
      if (!block) {
        // in creative, fall back to a default if hotbar empty
        block = 'stone';
      }
    } else {
      block = this.inventory.selectedBlock();
      if (!block) return;
    }
    if (this.overlapsPlayer(px, py, pz) && isSolid(block)) return;
    this.world.set(px, py, pz, block);
    const cx = Math.floor(px / CHUNK_SIZE);
    const cz = Math.floor(pz / CHUNK_SIZE);
    const lx = px - cx * CHUNK_SIZE;
    const lz = pz - cz * CHUNK_SIZE;
    this.voxels.markDirty(cx, cz, lx === 0 || lx === CHUNK_SIZE - 1 || lz === 0 || lz === CHUNK_SIZE - 1);
    saveWorldEdit({ x: px, y: py, z: pz, block });
    if (!def.infiniteBlocks) {
      this.inventory.consumeSelected();
      this.refreshUI();
    }
  }

  private overlapsPlayer(x: number, y: number, z: number) {
    const p = this.player.position;
    const r = 0.3;
    const min = { x: p.x - r, y: p.y - 1.7, z: p.z - r };
    const max = { x: p.x + r, y: p.y, z: p.z + r };
    return (
      max.x > x && min.x < x + 1 && max.y > y && min.y < y + 1 && max.z > z && min.z < z + 1
    );
  }

  // ---- Public API for commands ----

  setGameMode(mode: GameMode) {
    this.mode = mode;
    this.applyMode(mode, true);
    this.callbacks.onModeChange?.(mode);
  }

  private applyMode(mode: GameMode, notify: boolean) {
    const def = GAME_MODES[mode];
    this.player.flying = def.canFly;
    this.player.invulnerable = !def.canTakeDamage;
    this.player.noclip = mode === 'spectator';
    if (notify) this.callbacks.onFlyChange?.(this.player.flying);
  }

  teleport(x: number, y: number, z: number) {
    this.player.position.set(x, y, z);
    this.player.velocity.set(0, 0, 0);
  }

  summon(type: EntityType, x: number, y: number, z: number) {
    this.entities.spawn(type, x, y, z);
  }

  setBlock(x: number, y: number, z: number, block: BlockType) {
    this.world.set(x, y, z, block);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    this.voxels.markDirty(cx, cz, lx === 0 || lx === CHUNK_SIZE - 1 || lz === 0 || lz === CHUNK_SIZE - 1);
    if (block === 'air') deleteWorldEdit(x, y, z);
    else saveWorldEdit({ x, y, z, block });
  }

  fillRegion(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: BlockType): number {
    let count = 0;
    const xa = Math.min(x1, x2);
    const xb = Math.max(x1, x2);
    const ya = Math.min(y1, y2);
    const yb = Math.max(y1, y2);
    const za = Math.min(z1, z2);
    const zb = Math.max(z1, z2);
    const dirtyChunks = new Set<string>();
    for (let x = xa; x <= xb; x++) {
      for (let y = ya; y <= yb; y++) {
        for (let z = za; z <= zb; z++) {
          this.world.set(x, y, z, block);
          saveWorldEdit({ x, y, z, block });
          dirtyChunks.add(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`);
          count++;
        }
      }
    }
    for (const k of dirtyChunks) {
      const [cx, cz] = k.split(',').map(Number);
      this.voxels.markDirty(cx, cz, true);
    }
    return count;
  }

  setTimeOfDay(t: number) {
    this.timeOfDay = t;
    this.updateSky();
  }

  setWeather(w: Weather) {
    this.weather = w;
    this.callbacks.onWeatherChange?.(w);
    this.updateWeatherParticles();
  }

  heal() {
    this.health = this.maxHealth;
    this.food = this.maxFood;
    this.callbacks.onHealthChange?.(this.health, this.maxHealth);
    this.callbacks.onFoodChange?.(this.food, this.maxFood);
  }

  killNearbyEntities(): number {
    let n = 0;
    for (const e of this.entities.entities) {
      if (e.dead) continue;
      if (e.position.distanceTo(this.player.position) < 20) {
        e.dead = true;
        n++;
      }
    }
    return n;
  }

  refreshUI() {
    this.callbacks.onInventoryChange?.();
    this.callbacks.onSelectedChange?.(this.inventory.selected);
  }

  takeDamage(amount: number) {
    if (this.player.invulnerable) return;
    this.health = Math.max(0, this.health - amount);
    this.callbacks.onHealthChange?.(this.health, this.maxHealth);
    if (this.health <= 0) {
      this.die();
    }
  }

  private die() {
    // drop inventory? for simplicity, keep inventory but respawn
    this.health = this.maxHealth;
    this.food = this.maxFood;
    this.player.spawn();
    this.callbacks.onHealthChange?.(this.health, this.maxHealth);
    this.callbacks.onFoodChange?.(this.food, this.maxFood);
    this.callbacks.onMessage?.('You died! Respawning at spawn point.', 'info');
  }

  private updateChunksAroundPlayer() {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccz = Math.floor(pz / CHUNK_SIZE);
    // queue chunk meshes in radius (spiral from center outward)
    for (let r = 0; r <= this.RENDER_RADIUS; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          this.voxels.ensureChunkMeshed(ccx + dx, ccz + dz);
        }
      }
    }
    // unload far chunks
    if (ccx !== this.lastChunkX || ccz !== this.lastChunkZ) {
      this.lastChunkX = ccx;
      this.lastChunkZ = ccz;
      this.voxels.unloadFar(px, pz, this.RENDER_RADIUS);
      this.world.unloadFar(px, pz, this.RENDER_RADIUS);
    }
  }

  private updateSky() {
    // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 1 = midnight
    const t = this.timeOfDay;
    const sunAngle = (t - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    this.sun.position.set(sunX * 80, sunY * 80, 30);
    // brightness based on sun height
    const dayFactor = Math.max(0, sunY);
    this.sun.intensity = 0.2 + dayFactor * 1.0;
    this.hemi.intensity = 0.2 + dayFactor * 0.5;
    this.amb.intensity = 0.15 + dayFactor * 0.15;
    // sky color: day blue -> night dark blue
    const day = new THREE.Color('#9ad7ff');
    const night = new THREE.Color('#0a1026');
    const sunset = new THREE.Color('#e8a060');
    let sky: THREE.Color;
    if (sunY > 0.2) {
      sky = day.clone();
    } else if (sunY > -0.2) {
      // sunrise/sunset blend
      const k = (sunY + 0.2) / 0.4;
      sky = sunset.clone().lerp(day, k);
    } else {
      const k = Math.max(0, sunY + 0.6) / 0.4;
      sky = night.clone().lerp(sunset, k);
    }
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.callbacks.onTimeChange?.(t);
  }

  private updateWeatherParticles() {
    if (this.rainParticles) {
      this.scene.remove(this.rainParticles);
      (this.rainParticles.geometry as THREE.BufferGeometry).dispose();
      (this.rainParticles.material as THREE.Material).dispose();
      this.rainParticles = null;
    }
    if (this.weather === 'clear') return;
    const count = 1500;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: this.weather === 'snow' ? 0xffffff : 0x88aacc,
      size: this.weather === 'snow' ? 0.12 : 0.06,
      transparent: true,
      opacity: 0.7,
    });
    this.rainParticles = new THREE.Points(geo, mat);
    this.scene.add(this.rainParticles);
  }

  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    // day-night cycle (paused in spectator? no, keep running)
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
    this.updateSky();

    // weather particles
    if (this.rainParticles) {
      const pos = this.rainParticles.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const speed = this.weather === 'snow' ? 2 : 14;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= speed * dt;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 40;
          arr[i] = this.player.position.x + (Math.random() - 0.5) * 80;
          arr[i + 2] = this.player.position.z + (Math.random() - 0.5) * 80;
        }
      }
      pos.needsUpdate = true;
      this.rainParticles.position.copy(this.player.position).multiplyScalar(0);
    }

    // player update
    this.player.update(dt);
    this.entities.setPlayerPosition(this.player.position);
    this.entities.update(dt, this.player.invulnerable);

    // chunk loading around player
    this.updateChunksAroundPlayer();
    this.voxels.update();

    // entity respawning near player
    this.entitySpawnTimer += dt;
    if (this.entitySpawnTimer >= 12 && this.entities.entities.length < 24) {
      this.entitySpawnTimer = 0;
      this.entities.populateNearPlayer();
    }

    // survival food/health
    const def = GAME_MODES[this.mode];
    if (def.canTakeDamage) {
      this.foodTimer += dt;
      if (this.foodTimer >= FOOD_TICK_INTERVAL) {
        this.foodTimer = 0;
        this.food = Math.max(0, this.food - 1);
        this.callbacks.onFoodChange?.(this.food, this.maxFood);
      }
      this.regenTimer += dt;
      if (this.regenTimer >= REGEN_INTERVAL && this.food >= 18 && this.health < this.maxHealth) {
        this.regenTimer = 0;
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.callbacks.onHealthChange?.(this.health, this.maxHealth);
      }
      if (this.food <= 0) {
        // starvation damage
        this.regenTimer += dt;
        if (this.regenTimer >= 4) {
          this.regenTimer = 0;
          this.takeDamage(1);
        }
      }
    }

    // selection highlight
    const hit = this.player.raycast();
    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    // mining progress (survival hold-to-break)
    if (this.miningTarget) {
      const stillDown = this.player.isMouseLeftDown();
      const cur = this.player.raycast();
      if (!stillDown || !cur || cur.x !== this.miningTarget.x || cur.y !== this.miningTarget.y || cur.z !== this.miningTarget.z) {
        this.miningTarget = null;
        this.miningProgress = 0;
        this.miningOverlay.visible = false;
      } else {
        const block = this.world.get(this.miningTarget.x, this.miningTarget.y, this.miningTarget.z);
        const bdef = getBlock(block);
        const hardness = bdef?.hardness ?? 1;
        this.miningProgress += dt;
        const needed = Math.max(0.05, hardness);
        this.miningOverlay.visible = true;
        this.miningOverlay.position.set(
          this.miningTarget.x + 0.5,
          this.miningTarget.y + 0.5,
          this.miningTarget.z + 0.5
        );
        (this.miningOverlay.material as THREE.MeshBasicMaterial).opacity =
          0.15 + 0.4 * Math.min(1, this.miningProgress / needed);
        if (this.miningProgress >= needed) {
          this.breakBlock(this.miningTarget.x, this.miningTarget.y, this.miningTarget.z);
          this.miningTarget = null;
          this.miningProgress = 0;
          this.miningOverlay.visible = false;
        }
      }
    }

    // autosave player state periodically
    this.saveTimer += dt;
    if (this.saveTimer >= 10) {
      this.saveTimer = 0;
      this.persistPlayer();
    }

    this.renderer.render(this.scene, this.camera);
  }

  private persistPlayer() {
    if (!this.loaded) return;
    savePlayerState({
      mode: this.mode,
      health: this.health,
      food: this.food,
      position: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
      },
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      flying: this.player.flying,
      inventory: this.inventory.toJSON(),
    });
  }

  /** Save immediately (called on unload). */
  flushSave() {
    this.persistPlayer();
  }
}
