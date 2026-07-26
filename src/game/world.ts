import { getBlockIndex, getBlockByIndex, type BlockType } from './blocks';
import { placeStructure, type StructureType } from './structures';

// ---- Noise ----
function makeHash(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
class ValueNoise {
  private perm: Uint8Array;
  constructor(seed: number) {
    const rand = makeHash(seed);
    const p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    this.perm = p;
  }
  private grad(hash: number) {
    return (hash & 7) / 7;
  }
  noise2(x: number, y: number) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];
    const u = smooth(xf);
    const v = smooth(yf);
    return lerp(
      lerp(this.grad(aa), this.grad(ba), u),
      lerp(this.grad(ab), this.grad(bb), u),
      v
    );
  }
  fractal(x: number, y: number, octaves: number, persistence = 0.5) {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise2(x * freq, y * freq) * amp;
      max += amp;
      amp *= persistence;
      freq *= 2;
    }
    return total / max;
  }
}

// ---- Chunk constants ----
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 48;
export const SEA_LEVEL = 16;

export const AIR = 0;

export interface Chunk {
  cx: number;
  cz: number;
  data: Uint8Array;
  generated: boolean;
  generating: boolean;
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class World {
  readonly sx = Number.MAX_SAFE_INTEGER;
  readonly sy = CHUNK_HEIGHT;
  readonly sz = Number.MAX_SAFE_INTEGER;
  chunks = new Map<string, Chunk>();
  private noise: ValueNoise;
  private treeNoise: ValueNoise;
  private structNoise: ValueNoise;
  private edits = new Map<string, BlockType>(); // persistent player edits: "x,y,z" -> block

  constructor(seed = 1337) {
    this.noise = new ValueNoise(seed);
    this.treeNoise = new ValueNoise(seed ^ 0x5eed);
    this.structNoise = new ValueNoise(seed ^ 0x8174);
  }

  inBounds(_x: number, _y: number, _z: number) {
    return true; // infinite in x/z; y bounded below
  }

  private getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  private generating = false;

  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = { cx, cz, data: new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE), generated: false, generating: false };
      this.chunks.set(key, c);
      this.generateChunk(c);
    }
    return c;
  }

  /** Get-or-create a chunk shell WITHOUT generating terrain. Safe during generation. */
  private ensureChunkShell(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = { cx, cz, data: new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE), generated: false, generating: false };
      this.chunks.set(key, c);
    }
    return c;
  }

  private idx(lx: number, y: number, lz: number) {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  get(x: number, y: number, z: number): BlockType {
    if (y < 0 || y >= CHUNK_HEIGHT) return 'air';
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const c = this.getChunk(cx, cz);
    if (!c) return 'air';
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return getBlockByIndex(c.data[this.idx(lx, y, lz)]);
  }

  /** Fast index-based get (no string lookup). Returns 0 for air/out-of-bounds. */
  getIndex(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const c = this.getChunk(cx, cz);
    if (!c) return AIR;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return c.data[this.idx(lx, y, lz)];
  }

  set(x: number, y: number, z: number, t: BlockType) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    // During generation, don't trigger neighbor generation — just write the shell.
    const c = this.generating ? this.ensureChunkShell(cx, cz) : this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    c.data[this.idx(lx, y, lz)] = getBlockIndex(t);
    this.edits.set(`${x},${y},${z}`, t);
    if (this.generating && !c.generated) this.trackNeighbor(cx, cz);
  }

  /** Set without recording an edit (used during generation). */
  private setGen(c: Chunk, lx: number, y: number, lz: number, t: BlockType) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    c.data[this.idx(lx, y, lz)] = getBlockIndex(t);
  }

  /** Track a neighbor chunk that needs generation after the current one finishes. */
  private trackNeighbor(cx: number, cz: number) {
    const k = chunkKey(cx, cz);
    const c = this.chunks.get(k);
    if (c && !c.generated && !c.generating) this.pendingNeighbors.add(k);
  }

  /** Apply a player edit (from persistence) at load time. */
  applyEdit(x: number, y: number, z: number, t: BlockType) {
    this.set(x, y, z, t);
  }

  /** Get all player edits for persistence. */
  getEdits(): { x: number; y: number; z: number; block: BlockType }[] {
    const out: { x: number; y: number; z: number; block: BlockType }[] = [];
    for (const [k, v] of this.edits) {
      const [x, y, z] = k.split(',').map(Number);
      out.push({ x, y, z, block: v });
    }
    return out;
  }

  removeEdit(x: number, y: number, z: number) {
    this.edits.delete(`${x},${y},${z}`);
  }

  // ---- Terrain generation ----
  private heightAt(x: number, z: number): number {
    const n = this.noise.fractal(x / 24, z / 24, 4, 0.5);
    const n2 = this.noise.fractal(x / 60 + 100, z / 60 + 100, 2, 0.5);
    return Math.floor(SEA_LEVEL + n * 14 + n2 * 6);
  }

  private generateChunk(c: Chunk) {
    if (c.generated || c.generating) return;
    c.generating = true;
    this.generating = true;
    const baseX = c.cx * CHUNK_SIZE;
    const baseZ = c.cz * CHUNK_SIZE;
    // terrain
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const h = this.heightAt(x, z);
        for (let y = 0; y <= h; y++) {
          let block: BlockType = 'stone';
          if (y === 0) block = 'bedrock';
          else if (y === h) {
            if (h < SEA_LEVEL) block = 'sand';
            else if (h > SEA_LEVEL + 12) block = 'snow';
            else block = 'grass';
          } else if (y >= h - 3) {
            block = 'dirt';
          } else {
            block = 'stone';
          }
          if (block === 'stone' && y < 12) {
            const ore = this.noise.fractal(x / 6 + 500, (y * 3) / 6 + z / 6, 2, 0.5);
            if (ore > 0.82) block = y < 5 ? 'diamond' : 'gold';
          }
          this.setGen(c, lx, y, lz, block);
        }
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            this.setGen(c, lx, y, lz, 'water');
          }
        }
      }
    }
    // trees + structures (deterministic per-chunk)
    this.decorateChunk(c);
    c.generated = true;
    c.generating = false;
    this.generating = false;
    // Now generate any neighbor shells we wrote into during decoration.
    this.flushPendingNeighbors();
  }

  private pendingNeighbors = new Set<string>();
  private flushPendingNeighbors() {
    if (this.pendingNeighbors.size === 0) return;
    const keys = Array.from(this.pendingNeighbors);
    this.pendingNeighbors.clear();
    for (const k of keys) {
      const [cx, cz] = k.split(',').map(Number);
      const c = this.chunks.get(k);
      if (c && !c.generated) this.generateChunk(c);
    }
  }

  private decorateChunk(c: Chunk) {
    const baseX = c.cx * CHUNK_SIZE;
    const baseZ = c.cz * CHUNK_SIZE;
    // trees
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const h = this.heightAt(x, z);
        if (h < SEA_LEVEL) continue;
        const t = this.treeNoise.fractal(x / 3 + 7, z / 3 + 7, 1, 0.5);
        if (t > 0.86 && this.get(x, h, z) === 'grass') {
          placeStructure(this, 'tallTree', x, h + 1, z);
        }
      }
    }
    // structures — one candidate per chunk based on noise
    const sr = this.structNoise.fractal(baseX / 9 + 3, baseZ / 9 + 3, 2, 0.5);
    if (sr > 0.82) {
      const types: StructureType[] = ['house', 'pyramid', 'well'];
      const type = types[Math.floor(this.structNoise.fractal(baseX + 99, baseZ + 99, 1, 0.5) * 3) % 3];
      const sx = baseX + 2 + Math.floor(this.structNoise.noise2(baseX, baseZ) * 10);
      const sz = baseZ + 2 + Math.floor(this.structNoise.noise2(baseZ, baseX) * 10);
      const h = this.heightAt(sx, sz);
      if (h >= SEA_LEVEL - 1) {
        if (type === 'pyramid' && h < SEA_LEVEL + 2) return;
        placeStructure(this, type, sx, h, sz);
      }
    }
  }

  /** Unload chunks far from the player to free memory. */
  unloadFar(centerX: number, centerZ: number, radius: number) {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);
    for (const [key, c] of this.chunks) {
      const dx = c.cx - ccx;
      const dz = c.cz - ccz;
      if (Math.abs(dx) > radius + 2 || Math.abs(dz) > radius + 2) {
        this.chunks.delete(key);
      }
    }
  }

  /** Topmost solid (non-air, non-liquid, non-leaves) block at x,z. */
  topSolidY(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.ensureChunk(cx, cz);
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const b = this.get(x, y, z);
      if (b !== 'air' && b !== 'water' && b !== 'leaves' && b !== 'lava') return y;
    }
    return -1;
  }
}
