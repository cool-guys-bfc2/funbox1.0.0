import * as THREE from 'three';
import { World, CHUNK_SIZE, CHUNK_HEIGHT, AIR } from './world';
import { allBlocks, isTransparent, isLiquid, getBlockByIndex, getBlockMaterials, type BlockType } from './blocks';

// Face definitions: direction + 4 corner vertex indices into a unit cube's 8 corners.
// Cube corners (x,y,z):
//   0:(0,0,0) 1:(1,0,0) 2:(0,1,0) 3:(1,1,0)
//   4:(0,0,1) 5:(1,0,1) 6:(0,1,1) 7:(1,1,1)
const FACES = [
  { dir: [1, 0, 0], matIndex: 0, verts: [1, 3, 7, 5] }, // +x
  { dir: [-1, 0, 0], matIndex: 1, verts: [4, 6, 2, 0] }, // -x
  { dir: [0, 1, 0], matIndex: 2, verts: [2, 3, 7, 6] }, // +y
  { dir: [0, -1, 0], matIndex: 3, verts: [0, 1, 5, 4] }, // -y
  { dir: [0, 0, 1], matIndex: 4, verts: [5, 7, 6, 4] }, // +z
  { dir: [0, 0, -1], matIndex: 5, verts: [0, 2, 3, 1] }, // -z
] as const;

const CUBE_CORNERS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

const UV_SET: [number, number][] = [
  [0, 0], [1, 0], [1, 1], [0, 1],
];

export interface ChunkMesh {
  cx: number;
  cz: number;
  meshes: THREE.Mesh[];
}

export class VoxelRenderer {
  group = new THREE.Group();
  private world: World;
  private chunkMeshes = new Map<string, ChunkMesh>();
  /** chunk keys that need (re)meshing */
  private dirty = new Set<string>();
  private materialCache = new Map<BlockType, THREE.Material[]>();

  constructor(world: World) {
    this.world = world;
  }

  private key(cx: number, cz: number) {
    return `${cx},${cz}`;
  }

  /** Mark a chunk (and neighbors if on border) as needing a remesh. */
  markDirty(cx: number, cz: number, neighbors = false) {
    this.dirty.add(this.key(cx, cz));
    if (neighbors) {
      this.dirty.add(this.key(cx - 1, cz));
      this.dirty.add(this.key(cx + 1, cz));
      this.dirty.add(this.key(cx, cz - 1));
      this.dirty.add(this.key(cx, cz + 1));
    }
  }

  /** Ensure a chunk has a mesh; queue dirty chunks for meshing. */
  ensureChunkMeshed(cx: number, cz: number) {
    const k = this.key(cx, cz);
    if (!this.chunkMeshes.has(k)) {
      this.world.ensureChunk(cx, cz);
      this.dirty.add(k);
    }
  }

  /** Process all dirty chunks (build/rebuild their meshes). Call once per frame. */
  update() {
    if (this.dirty.size === 0) return;
    for (const k of this.dirty) {
      const [cx, cz] = k.split(',').map(Number);
      this.buildChunkMesh(cx, cz);
    }
    this.dirty.clear();
  }

  /** Remove chunk meshes that are far from the player. */
  unloadFar(centerX: number, centerZ: number, radius: number) {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);
    for (const [k, cm] of this.chunkMeshes) {
      const dx = cm.cx - ccx;
      const dz = cm.cz - ccz;
      if (Math.abs(dx) > radius + 2 || Math.abs(dz) > radius + 2) {
        for (const m of cm.meshes) {
          this.group.remove(m);
          m.geometry.dispose();
        }
        this.chunkMeshes.delete(k);
      }
    }
  }

  private getMaterials(type: BlockType): THREE.Material[] {
    let m = this.materialCache.get(type);
    if (!m) {
      m = getBlockMaterials(type);
      this.materialCache.set(type, m);
    }
    return m;
  }

  private buildChunkMesh(cx: number, cz: number) {
    const k = this.key(cx, cz);
    // remove old
    const old = this.chunkMeshes.get(k);
    if (old) {
      for (const m of old.meshes) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      this.chunkMeshes.delete(k);
    }

    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const chunk = this.world.ensureChunk(cx, cz);

    // group faces by block type
    const byType = new Map<number, number[]>(); // blockIndex -> [lx,y,lz,faceIndex,...]
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const b = chunk.data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
          if (b === AIR) continue;
          for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = FACES[f].dir;
            const nx = baseX + lx + dx;
            const ny = y + dy;
            const nz = baseZ + lz + dz;
            const neighbor = this.world.getIndex(nx, ny, nz);
            // cull if neighbor is opaque
            if (neighbor !== AIR) {
              const nbType = getBlockByIndex(neighbor);
              if (!isTransparent(nbType)) continue;
              if (nbType === getBlockByIndex(b) && !isLiquid(nbType)) continue;
              if (isLiquid(getBlockByIndex(b)) && nbType === getBlockByIndex(b)) continue;
            }
            let arr = byType.get(b);
            if (!arr) {
              arr = [];
              byType.set(b, arr);
            }
            arr.push(lx, y, lz, f);
          }
        }
      }
    }

    if (byType.size === 0) return;

    const meshes: THREE.Mesh[] = [];
    for (const [blockIndex, cells] of byType) {
      const type = getBlockByIndex(blockIndex);
      const mesh = this.buildTypedMesh(type, cells, baseX, baseZ);
      if (mesh) {
        this.group.add(mesh);
        meshes.push(mesh);
      }
    }
    this.chunkMeshes.set(k, { cx, cz, meshes });
  }

  private buildTypedMesh(
    type: BlockType,
    cells: number[],
    baseX: number,
    baseZ: number
  ): THREE.Mesh | null {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const faceCounts = [0, 0, 0, 0, 0, 0];
    let v = 0;
    for (let i = 0; i < cells.length; i += 4) {
      const lx = cells[i];
      const y = cells[i + 1];
      const lz = cells[i + 2];
      const f = cells[i + 3];
      const verts = FACES[f].verts;
      const dir = FACES[f].dir;
      for (let k = 0; k < 4; k++) {
        const ci = verts[k];
        positions.push(baseX + lx + CUBE_CORNERS[ci][0], y + CUBE_CORNERS[ci][1], baseZ + lz + CUBE_CORNERS[ci][2]);
        normals.push(dir[0], dir[1], dir[2]);
        uvs.push(UV_SET[k][0], UV_SET[k][1]);
      }
      indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
      faceCounts[f]++;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);

    const mats = this.getMaterials(type);
    let idxCursor = 0;
    for (let f = 0; f < 6; f++) {
      const count = faceCounts[f];
      if (count > 0) {
        const countIdx = count * 6;
        geom.addGroup(idxCursor, countIdx, f);
        idxCursor += countIdx;
      }
    }
    geom.computeBoundingSphere();

    const mesh = new THREE.Mesh(geom, mats);
    mesh.frustumCulled = true;
    return mesh;
  }

  /** Force a full rebuild of a specific chunk's mesh. */
  rebuildChunk(cx: number, cz: number) {
    this.dirty.add(this.key(cx, cz));
  }

  /** Rebuild all currently-loaded chunk meshes. */
  rebuildAll() {
    for (const [k] of this.chunkMeshes) {
      this.dirty.add(k);
    }
  }

  dispose() {
    for (const [, cm] of this.chunkMeshes) {
      for (const m of cm.meshes) {
        m.geometry.dispose();
      }
    }
    this.chunkMeshes.clear();
    this.dirty.clear();
  }
}
