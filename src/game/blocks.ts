import * as THREE from 'three';

export type BlockType = string;

export interface BlockDef {
  id: BlockType;
  name: string;
  /** Faces: [top, bottom, side] — each a color used to paint the texture */
  faces: { top: string; bottom: string; side: string };
  transparent?: boolean;
  solid?: boolean;
  /** If true, the block is a liquid (no collision, swimmable) */
  liquid?: boolean;
  /** Drop given when mined. Defaults to self. 'none' = no drop. */
  drop?: BlockType | 'none';
  /** Hardness in seconds to break by hand (survival). 0 = instant. */
  hardness?: number;
  /** Light emission 0..1 */
  light?: number;
  /** Custom texture pattern: 'speckle' (default), 'stripes', 'bricks', 'glass', 'ore' */
  pattern?: 'speckle' | 'stripes' | 'bricks' | 'glass' | 'ore' | 'plain';
  /** For ore blocks: the speckle accent color */
  accent?: string;
  /** Addon id that registered this block, or 'core' */
  addon?: string;
}

// ---- Core block registry ----
const registry = new Map<BlockType, BlockDef>();
const order: BlockType[] = [];

export function registerBlock(def: BlockDef) {
  if (registry.has(def.id)) {
    // update existing
    registry.set(def.id, { ...registry.get(def.id)!, ...def });
    return;
  }
  registry.set(def.id, def);
  order.push(def.id);
}

export function getBlock(id: BlockType): BlockDef | undefined {
  return registry.get(id);
}

export function allBlocks(): BlockDef[] {
  return order.map((id) => registry.get(id)!);
}

export function isSolid(id: BlockType): boolean {
  if (id === 'air') return false;
  const b = registry.get(id);
  return !!b?.solid;
}

export function isTransparent(id: BlockType): boolean {
  if (id === 'air') return true;
  const b = registry.get(id);
  return !!b?.transparent;
}

export function isLiquid(id: BlockType): boolean {
  const b = registry.get(id);
  return !!b?.liquid;
}

// ---- Dynamic block id <-> index mapping ----
// Used by the chunk system to pack block ids into a Uint8Array.
let nextIndex = 1; // 0 reserved for air
const idToIndex = new Map<BlockType, number>([['air', 0]]);
const indexToId: BlockType[] = ['air'];

export function rebuildIndex() {
  nextIndex = 1;
  idToIndex.clear();
  idToIndex.set('air', 0);
  indexToId.length = 1;
  indexToId[0] = 'air';
  for (const id of order) {
    idToIndex.set(id, nextIndex);
    indexToId[nextIndex] = id;
    nextIndex++;
  }
}

export function getBlockIndex(id: BlockType): number {
  if (!idToIndex.has(id)) {
    idToIndex.set(id, nextIndex);
    indexToId[nextIndex] = id;
    nextIndex++;
  }
  return idToIndex.get(id)!;
}

export function getBlockByIndex(i: number): BlockType {
  return indexToId[i] ?? 'air';
}

export function isIndexFull(): boolean {
  return nextIndex >= 255;
}

// ---- Core blocks ----
const CORE_BLOCKS: BlockDef[] = [
  {
    id: 'grass',
    name: 'Grass',
    faces: { top: '#6cae3a', bottom: '#8b6b43', side: '#7a9e4f' },
    solid: true,
    drop: 'dirt',
    hardness: 0.6,
    pattern: 'speckle',
  },
  {
    id: 'dirt',
    name: 'Dirt',
    faces: { top: '#8b6b43', bottom: '#8b6b43', side: '#8b6b43' },
    solid: true,
    hardness: 0.5,
    pattern: 'speckle',
  },
  {
    id: 'stone',
    name: 'Stone',
    faces: { top: '#8a8a8a', bottom: '#8a8a8a', side: '#8a8a8a' },
    solid: true,
    drop: 'cobblestone',
    hardness: 1.5,
    pattern: 'speckle',
  },
  {
    id: 'cobblestone',
    name: 'Cobblestone',
    faces: { top: '#6f6f6f', bottom: '#6f6f6f', side: '#6f6f6f' },
    solid: true,
    hardness: 2,
    pattern: 'speckle',
  },
  {
    id: 'sand',
    name: 'Sand',
    faces: { top: '#e6d9a0', bottom: '#e6d9a0', side: '#e6d9a0' },
    solid: true,
    hardness: 0.5,
    pattern: 'speckle',
  },
  {
    id: 'wood',
    name: 'Wood Log',
    faces: { top: '#b8915a', bottom: '#b8915a', side: '#6e5230' },
    solid: true,
    hardness: 1,
    pattern: 'stripes',
  },
  {
    id: 'planks',
    name: 'Planks',
    faces: { top: '#b8915a', bottom: '#b8915a', side: '#b8915a' },
    solid: true,
    hardness: 1,
    pattern: 'stripes',
  },
  {
    id: 'leaves',
    name: 'Leaves',
    faces: { top: '#3f7d2a', bottom: '#3f7d2a', side: '#3f7d2a' },
    transparent: true,
    solid: true,
    hardness: 0.2,
    pattern: 'speckle',
  },
  {
    id: 'brick',
    name: 'Bricks',
    faces: { top: '#a64b2a', bottom: '#a64b2a', side: '#a64b2a' },
    solid: true,
    hardness: 2,
    pattern: 'bricks',
  },
  {
    id: 'glass',
    name: 'Glass',
    faces: { top: '#bfe6f2', bottom: '#bfe6f2', side: '#bfe6f2' },
    transparent: true,
    solid: true,
    drop: 'none',
    hardness: 0.3,
    pattern: 'glass',
  },
  {
    id: 'gold',
    name: 'Gold Ore',
    faces: { top: '#c9a23a', bottom: '#c9a23a', side: '#c9a23a' },
    solid: true,
    hardness: 3,
    pattern: 'ore',
    accent: '#ffe066',
  },
  {
    id: 'diamond',
    name: 'Diamond Ore',
    faces: { top: '#5fe6d4', bottom: '#5fe6d4', side: '#5fe6d4' },
    solid: true,
    hardness: 3,
    pattern: 'ore',
    accent: '#aef9ef',
  },
  {
    id: 'water',
    name: 'Water',
    faces: { top: '#3a72c4', bottom: '#3a72c4', side: '#3a72c4' },
    transparent: true,
    liquid: true,
    solid: false,
    hardness: 0,
    pattern: 'speckle',
  },
  {
    id: 'glowstone',
    name: 'Glowstone',
    faces: { top: '#f7d774', bottom: '#f7d774', side: '#f7d774' },
    solid: true,
    light: 0.8,
    hardness: 0.3,
    pattern: 'speckle',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    faces: { top: '#1a1426', bottom: '#1a1426', side: '#1a1426' },
    solid: true,
    hardness: 8,
    pattern: 'speckle',
  },
  {
    id: 'snow',
    name: 'Snow Block',
    faces: { top: '#f4f8ff', bottom: '#f4f8ff', side: '#f4f8ff' },
    solid: true,
    hardness: 0.3,
    pattern: 'speckle',
  },
  {
    id: 'lava',
    name: 'Lava',
    faces: { top: '#e2541a', bottom: '#e2541a', side: '#e2541a' },
    transparent: true,
    liquid: true,
    solid: false,
    light: 0.6,
    hardness: 0,
    pattern: 'speckle',
  },
  {
    id: 'bedrock',
    name: 'Bedrock',
    faces: { top: '#2a2a2a', bottom: '#2a2a2a', side: '#2a2a2a' },
    solid: true,
    drop: 'none',
    hardness: 999,
    pattern: 'speckle',
  },
];

for (const b of CORE_BLOCKS) registerBlock({ ...b, addon: 'core' });

// ---- Hotbar (default) ----
export const HOTBAR: BlockType[] = [
  'grass',
  'dirt',
  'stone',
  'cobblestone',
  'wood',
  'planks',
  'leaves',
  'brick',
  'glass',
];

// ---- Texture generation ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFaceTexture(def: BlockDef, face: 'top' | 'bottom' | 'side'): THREE.Texture {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const baseColor = def.faces[face];
  const rand = mulberry32(
    (def.id.charCodeAt(0) || 1) * 13 + (face.charCodeAt(0) || 1) * 7 + face.length * 31
  );

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const c = new THREE.Color(baseColor);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);

  const pattern = def.pattern || 'speckle';

  if (pattern === 'ore' && def.accent) {
    // base stone speckle
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = rand();
        if (n < 0.15) {
          const shade = n < 0.07 ? -0.1 : 0.08;
          const cc = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + shade)));
          ctx.fillStyle = `#${cc.getHexString()}`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    // accent ore blobs
    ctx.fillStyle = def.accent;
    const blobs = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < blobs; i++) {
      const bx = Math.floor(rand() * 14);
      const by = Math.floor(rand() * 14);
      ctx.fillRect(bx, by, 2, 2);
      if (rand() > 0.5) ctx.fillRect(bx + 1, by + 2, 1, 1);
    }
  } else if (pattern === 'bricks') {
    // mortar lines
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < size; y += 4) {
      ctx.fillRect(0, y, size, 1);
    }
    for (let y = 0; y < size; y += 4) {
      const offset = (y / 4) % 2 === 0 ? 0 : 8;
      ctx.fillRect((0 + offset) % size, y, 1, 4);
      ctx.fillRect((8 + offset) % size, y, 1, 4);
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = rand();
        if (n < 0.1) {
          const shade = n < 0.05 ? -0.08 : 0.06;
          const cc = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + shade)));
          ctx.fillStyle = `#${cc.getHexString()}`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  } else if (pattern === 'stripes') {
    // vertical bark stripes for side, horizontal for top
    if (face === 'side') {
      for (let x = 0; x < size; x++) {
        if (x % 3 === 0) {
          const cc = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, hsl.l - 0.08));
          ctx.fillStyle = `#${cc.getHexString()}`;
          ctx.fillRect(x, 0, 1, size);
        }
      }
    } else {
      // rings on top
      for (let r = 1; r < 8; r += 2) {
        ctx.strokeStyle = `rgba(0,0,0,0.18)`;
        ctx.beginPath();
        ctx.arc(8, 8, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = rand();
        if (n < 0.08) {
          const shade = n < 0.04 ? -0.06 : 0.05;
          const cc = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + shade)));
          ctx.fillStyle = `#${cc.getHexString()}`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  } else if (pattern === 'glass') {
    // clear with a border + highlight
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = baseColor;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(6, 8);
    ctx.lineTo(3, 12);
    ctx.stroke();
  } else {
    // speckle (default)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = rand();
        if (n < 0.18) {
          const shade = n < 0.09 ? -0.12 : 0.1;
          const cc = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + shade)));
          ctx.fillStyle = `#${cc.getHexString()}`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // subtle border darkening
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, size, 1);
  ctx.fillRect(0, size - 1, size, 1);
  ctx.fillRect(0, 0, 1, size);
  ctx.fillRect(size - 1, 0, 1, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Material cache ----
const materialCache = new Map<BlockType, THREE.Material[]>();

export function getBlockMaterials(type: BlockType): THREE.Material[] {
  const existing = materialCache.get(type);
  if (existing) return existing;

  const def = registry.get(type);
  if (!def) {
    // fallback: pink error material
    const m = new THREE.MeshLambertMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
    const arr = [m, m, m, m, m, m];
    materialCache.set(type, arr);
    return arr;
  }

  const top = makeFaceTexture(def, 'top');
  const bottom = makeFaceTexture(def, 'bottom');
  const side = makeFaceTexture(def, 'side');

  const mk = (tex: THREE.Texture) => {
    if (def.liquid) {
      return new THREE.MeshLambertMaterial({
        map: tex,
        transparent: true,
        opacity: type === 'water' ? 0.65 : 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    if (def.transparent && def.pattern === 'glass') {
      return new THREE.MeshLambertMaterial({
        map: tex,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    if (def.transparent) {
      return new THREE.MeshLambertMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  };

  // Box face order: +x, -x, +y, -y, +z, -z
  const mats = [
    mk(side),
    mk(side),
    mk(top),
    mk(bottom),
    mk(side),
    mk(side),
  ];
  materialCache.set(type, mats);
  return mats;
}

export function clearMaterialCache() {
  for (const mats of materialCache.values()) {
    for (const m of mats) {
      if ((m as any).map) (m as any).map.dispose();
      m.dispose();
    }
  }
  materialCache.clear();
}
