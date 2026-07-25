import * as THREE from 'three';
import { World } from './world';
import { isSolid, isLiquid } from './blocks';

const PLAYER_HEIGHT = 1.7;
const PLAYER_EYE = 1.55;
const PLAYER_RADIUS = 0.3;
const GRAVITY = 26;
const JUMP_SPEED = 8.6;
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 7.5;
const FLY_SPEED = 9;
const REACH = 6;

export interface RaycastHit {
  x: number;
  y: number;
  z: number;
  /** The face normal of the hit block (for placement) */
  nx: number;
  ny: number;
  nz: number;
}

export class Player {
  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  invulnerable = false;
  noclip = false;

  private keys: Record<string, boolean> = {};
  private mouseLeftDown = false;
  private world: World;
  private camera: THREE.PerspectiveCamera;
  private dom: HTMLElement;

  constructor(world: World, camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.world = world;
    this.camera = camera;
    this.dom = dom;
    this.bindEvents();
  }

  spawn() {
    // Spawn at world origin (0,0) on top of the highest solid block.
    const cx = 0;
    const cz = 0;
    const topY = this.world.topSolidY(cx, cz);
    const y = topY >= 0 ? topY : 0;
    this.position.set(cx + 0.5, y + 1 + PLAYER_HEIGHT, cz + 0.5);
    this.velocity.set(0, 0, 0);
  }

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.mouseLeftDown = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseLeftDown = false;
  };

  isMouseLeftDown() {
    return this.mouseLeftDown;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  isLocked() {
    return document.pointerLockElement === this.dom;
  }

  onMouseMove(e: MouseEvent) {
    if (!this.isLocked()) return;
    const sens = 0.0024;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  toggleFly() {
    this.flying = !this.flying;
    this.velocity.set(0, 0, 0);
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05); // clamp to avoid tunneling on lag spikes

    // Build wish direction from keys (in camera-yaw space)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys['KeyW']) wish.add(forward);
    if (this.keys['KeyS']) wish.sub(forward);
    if (this.keys['KeyD']) wish.add(right);
    if (this.keys['KeyA']) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];

    if (this.flying) {
      const speed = FLY_SPEED * (sprint ? 1.8 : 1);
      this.velocity.x = wish.x * speed;
      this.velocity.z = wish.z * speed;
      this.velocity.y = 0;
      if (this.keys['Space']) this.velocity.y = speed;
      if (this.keys['ControlLeft'] || this.keys['KeyC']) this.velocity.y = -speed;
    } else {
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      this.velocity.x = wish.x * speed;
      this.velocity.z = wish.z * speed;
      this.velocity.y -= GRAVITY * dt;
      if (this.keys['Space'] && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    // Move with collision (axis-separated)
    if (this.noclip) {
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;
    } else {
      this.moveAxis('x', this.velocity.x * dt);
      this.moveAxis('z', this.velocity.z * dt);
      this.moveAxis('y', this.velocity.y * dt);
    }

    // World bottom safety
    if (this.position.y < -10) {
      this.spawn();
    }

    // Update camera
    this.camera.position.set(
      this.position.x,
      this.position.y - PLAYER_HEIGHT + PLAYER_EYE,
      this.position.z
    );
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(
      this.camera.position.x + dir.x,
      this.camera.position.y + dir.y,
      this.camera.position.z + dir.z
    );
  }

  private moveAxis(axis: 'x' | 'y' | 'z', amount: number) {
    if (amount === 0) return;
    const pos = this.position.clone();
    pos[axis] += amount;

    // AABB for player body
    const min = new THREE.Vector3(
      pos.x - PLAYER_RADIUS,
      pos.y - PLAYER_HEIGHT,
      pos.z - PLAYER_RADIUS
    );
    const max = new THREE.Vector3(
      pos.x + PLAYER_RADIUS,
      pos.y,
      pos.z + PLAYER_RADIUS
    );

    // Check overlapping solid voxels
    const x0 = Math.floor(min.x);
    const x1 = Math.floor(max.x);
    const y0 = Math.floor(min.y);
    const y1 = Math.floor(max.y);
    const z0 = Math.floor(min.z);
    const z1 = Math.floor(max.z);

    let collided = false;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const t = this.world.get(x, y, z);
          if (t === 'air' || isLiquid(t)) continue;
          if (!isSolid(t)) continue;
          // voxel AABB is [x, x+1] etc.
          const vmin = { x, y, z };
          const vmax = { x: x + 1, y: y + 1, z: z + 1 };
          if (
            max.x > vmin.x &&
            min.x < vmax.x &&
            max.y > vmin.y &&
            min.y < vmax.y &&
            max.z > vmin.z &&
            min.z < vmax.z
          ) {
            collided = true;
            break;
          }
        }
        if (collided) break;
      }
      if (collided) break;
    }

    if (collided) {
      if (axis === 'y') {
        if (amount < 0) {
          // landed — snap to top of block
          this.position.y = Math.floor(min.y) + 1 + PLAYER_HEIGHT;
          this.onGround = true;
        } else {
          // hit head
          this.position.y = Math.floor(max.y) - PLAYER_HEIGHT;
        }
        this.velocity.y = 0;
      } else {
        // don't move on that axis
      }
      return;
    }

    this.position[axis] = pos[axis];
    if (axis === 'y' && amount < 0) this.onGround = false;
  }

  /** Voxel raycast (DDA) up to REACH blocks. Returns first solid hit. */
  raycast(): RaycastHit | null {
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    const distToEdge = (o: number, s: number) => {
      if (s > 0) return Math.ceil(o) - o;
      if (s < 0) return o - Math.floor(o);
      return 0;
    };
    let tMaxX = stepX !== 0 ? distToEdge(origin.x, stepX) * tDeltaX : Infinity;
    let tMaxY = stepY !== 0 ? distToEdge(origin.y, stepY) * tDeltaY : Infinity;
    let tMaxZ = stepZ !== 0 ? distToEdge(origin.z, stepZ) * tDeltaZ : Infinity;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    for (let i = 0; i < 64; i++) {
      const block = this.world.get(x, y, z);
      if (block !== 'air' && !isLiquid(block) && isSolid(block)) {
        return { x, y, z, nx, ny, nz };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
      if (t > REACH) break;
    }
    return null;
  }
}
