import * as THREE from 'three';
import { World } from './world';
import { isSolid } from './blocks';

export type EntityType =
  | 'pig'
  | 'cow'
  | 'sheep'
  | 'chicken'
  | 'zombie'
  | 'skeleton';

export interface EntityDef {
  id: EntityType;
  name: string;
  hostile: boolean;
  health: number;
  speed: number;
  /** body dimensions in blocks */
  width: number;
  height: number;
  /** colors for the blocky model: [body, head, accent] */
  colors: [string, string, string];
  /** drops on death: [{block, count}] */
  drops: { block: string; count: number }[];
}

export const ENTITY_DEFS: Record<EntityType, EntityDef> = {
  pig: {
    id: 'pig',
    name: 'Pig',
    hostile: false,
    health: 10,
    speed: 1.4,
    width: 0.9,
    height: 0.9,
    colors: ['#e89aae', '#f0b8c4', '#c77a8e'],
    drops: [{ block: 'porkchop', count: 2 }],
  },
  cow: {
    id: 'cow',
    name: 'Cow',
    hostile: false,
    health: 10,
    speed: 1.4,
    width: 0.9,
    height: 1.2,
    colors: ['#4a3526', '#2a1d12', '#e8d8c0'],
    drops: [{ block: 'leather', count: 2 }],
  },
  sheep: {
    id: 'sheep',
    name: 'Sheep',
    hostile: false,
    health: 8,
    speed: 1.4,
    width: 0.9,
    height: 1.0,
    colors: ['#f0f0f0', '#e8d8c0', '#4a3526'],
    drops: [{ block: 'wool', count: 1 }],
  },
  chicken: {
    id: 'chicken',
    name: 'Chicken',
    hostile: false,
    health: 4,
    speed: 1.2,
    width: 0.6,
    height: 0.7,
    colors: ['#f8f8f8', '#e0e0e0', '#c0392b'],
    drops: [{ block: 'feather', count: 2 }],
  },
  zombie: {
    id: 'zombie',
    name: 'Zombie',
    hostile: true,
    health: 20,
    speed: 1.0,
    width: 0.6,
    height: 1.8,
    colors: ['#3a7d2a', '#5a8a4a', '#2a5d1a'],
    drops: [{ block: 'rotten_flesh', count: 1 }],
  },
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    hostile: true,
    health: 20,
    speed: 1.1,
    width: 0.6,
    height: 1.8,
    colors: ['#d8d8d8', '#c0c0c0', '#8a8a8a'],
    drops: [{ block: 'bone', count: 2 }],
  },
};

export interface Entity {
  id: number;
  type: EntityType;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  health: number;
  onGround: boolean;
  /** AI wander target */
  wanderTarget: THREE.Vector3 | null;
  wanderTimer: number;
  hurtTimer: number;
  dead: boolean;
  mesh: THREE.Group;
}

const GRAVITY = 22;
let nextId = 1;

function makeEntityMesh(def: EntityDef): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.colors[0] });
  const headMat = new THREE.MeshLambertMaterial({ color: def.colors[1] });
  const accentMat = new THREE.MeshLambertMaterial({ color: def.colors[2] });

  const w = def.width;
  const h = def.height;
  // body
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.5, w * 1.4), bodyMat);
  body.position.y = h * 0.5;
  g.add(body);
  // head
  const head = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.4, w * 0.7), headMat);
  head.position.set(0, h * 0.85, w * 0.8);
  g.add(head);
  // legs (4)
  const legGeo = new THREE.BoxGeometry(w * 0.25, h * 0.3, w * 0.25);
  const legMat = bodyMat;
  const legPositions: [number, number][] = [
    [w * 0.3, w * 0.5],
    [-w * 0.3, w * 0.5],
    [w * 0.3, -w * 0.5],
    [-w * 0.3, -w * 0.5],
  ];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, h * 0.15, lz);
    g.add(leg);
  }
  // accent (eyes / feature)
  if (def.hostile) {
    const eyeGeo = new THREE.BoxGeometry(w * 0.12, w * 0.12, w * 0.05);
    const eye1 = new THREE.Mesh(eyeGeo, accentMat);
    eye1.position.set(-w * 0.15, h * 0.9, w * 1.1);
    g.add(eye1);
    const eye2 = new THREE.Mesh(eyeGeo, accentMat);
    eye2.position.set(w * 0.15, h * 0.9, w * 1.1);
    g.add(eye2);
  } else if (def.id === 'sheep') {
    const wool = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, h * 0.55, w * 1.45), accentMat);
    wool.position.set(0, h * 0.5, 0);
    g.add(wool);
  } else if (def.id === 'cow') {
    const spot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h * 0.2, w * 0.1), accentMat);
    spot.position.set(w * 0.2, h * 0.7, w * 0.7);
    g.add(spot);
  } else if (def.id === 'chicken') {
    const beak = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, w * 0.1, w * 0.2), accentMat);
    beak.position.set(0, h * 0.8, w * 1.1);
    g.add(beak);
  } else if (def.id === 'pig') {
    const snout = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, w * 0.2, w * 0.2), accentMat);
    snout.position.set(0, h * 0.7, w * 1.0);
    g.add(snout);
  }
  g.userData.def = def;
  return g;
}

export class EntityManager {
  entities: Entity[] = [];
  private scene: THREE.Scene;
  private world: World;
  private playerPos = new THREE.Vector3();
  private playerHurtTimer = 0;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
  }

  setPlayerPosition(p: THREE.Vector3) {
    this.playerPos.copy(p);
  }

  spawn(type: EntityType, x: number, y: number, z: number): Entity {
    const def = ENTITY_DEFS[type];
    const mesh = makeEntityMesh(def);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const e: Entity = {
      id: nextId++,
      type,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(),
      yaw: 0,
      health: def.health,
      onGround: false,
      wanderTarget: null,
      wanderTimer: 0,
      hurtTimer: 0,
      dead: false,
      mesh,
    };
    this.entities.push(e);
    return e;
  }

  /** Populate the world near the player with ambient animals + a few monsters. */
  populateNearPlayer() {
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const animals: EntityType[] = ['pig', 'cow', 'sheep', 'chicken'];
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(px + rand(-24, 24));
      const z = Math.floor(pz + rand(-24, 24));
      const y = this.world.topSolidY(x, z);
      if (y < 0) continue;
      const type = animals[Math.floor(Math.random() * animals.length)];
      this.spawn(type, x + 0.5, y + 1, z + 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(px + rand(-24, 24));
      const z = Math.floor(pz + rand(-24, 24));
      const y = this.world.topSolidY(x, z);
      if (y < 0) continue;
      const type: EntityType = Math.random() < 0.5 ? 'zombie' : 'skeleton';
      this.spawn(type, x + 0.5, y + 1, z + 0.5);
    }
  }

  remove(e: Entity) {
    this.scene.remove(e.mesh);
    e.mesh.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
    });
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
  }

  /** Damage the closest entity in front of the player (melee). Returns the entity if killed. */
  meleeAttack(origin: THREE.Vector3, dir: THREE.Vector3, reach: number): Entity | null {
    let best: Entity | null = null;
    let bestDist = reach;
    for (const e of this.entities) {
      if (e.dead) continue;
      const to = e.position.clone().sub(origin);
      const dist = to.length();
      if (dist > reach) continue;
      if (dist < 0.01) continue;
      to.normalize();
      const dot = to.dot(dir);
      if (dot < 0.5) continue; // must be roughly in front
      if (dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    if (best) {
      best.health -= 6;
      best.hurtTimer = 0.4;
      // knockback
      best.velocity.add(dir.clone().setY(0).normalize().multiplyScalar(4));
      best.velocity.y += 3;
      if (best.health <= 0) {
        best.dead = true;
        return best;
      }
    }
    return null;
  }

  /** Returns drops from a dead entity. */
  collectDrops(e: Entity): { block: string; count: number }[] {
    return ENTITY_DEFS[e.type].drops;
  }

  update(dt: number, playerInvulnerable: boolean) {
    this.playerHurtTimer = Math.max(0, this.playerHurtTimer - dt);
    for (const e of this.entities) {
      if (e.dead) continue;
      const def = ENTITY_DEFS[e.type];
      e.hurtTimer = Math.max(0, e.hurtTimer - dt);

      // AI
      e.wanderTimer -= dt;
      const toPlayer = e.position.clone().sub(this.playerPos);
      const distToPlayer = toPlayer.length();
      if (def.hostile && distToPlayer < 16 && !playerInvulnerable) {
        // chase player
        const dir = toPlayer.clone().multiplyScalar(-1);
        dir.y = 0;
        dir.normalize();
        e.velocity.x = dir.x * def.speed;
        e.velocity.z = dir.z * def.speed;
        e.yaw = Math.atan2(dir.x, dir.z);
        // attack
        if (distToPlayer < 1.4 && this.playerHurtTimer <= 0) {
          this.playerHurtTimer = 1.0;
          // signal damage via callback
          this.onPlayerDamage?.(4);
        }
      } else {
        // wander
        if (e.wanderTimer <= 0 || !e.wanderTarget) {
          e.wanderTimer = 2 + Math.random() * 4;
          if (Math.random() < 0.4) {
            e.wanderTarget = e.position.clone().add(
              new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)
            );
          } else {
            e.wanderTarget = null;
            e.velocity.x = 0;
            e.velocity.z = 0;
          }
        }
        if (e.wanderTarget) {
          const dir = e.wanderTarget.clone().sub(e.position);
          dir.y = 0;
          const d = dir.length();
          if (d < 0.5) {
            e.wanderTarget = null;
            e.velocity.x = 0;
            e.velocity.z = 0;
          } else {
            dir.normalize();
            e.velocity.x = dir.x * def.speed * 0.6;
            e.velocity.z = dir.z * def.speed * 0.6;
            e.yaw = Math.atan2(dir.x, dir.z);
          }
        }
      }

      // gravity
      e.velocity.y -= GRAVITY * dt;

      // move with simple collision
      this.moveEntity(e, 'x', e.velocity.x * dt);
      this.moveEntity(e, 'z', e.velocity.z * dt);
      this.moveEntity(e, 'y', e.velocity.y * dt);

      // random jump if blocked horizontally and on ground
      if (e.onGround && (Math.abs(e.velocity.x) > 0.01 || Math.abs(e.velocity.z) > 0.01)) {
        if (this.blockedAhead(e)) {
          e.velocity.y = 6;
          e.onGround = false;
        }
      }

      // world bounds / despawn far entities
      if (e.position.y < -5) {
        e.dead = true;
      }
      const dx = e.position.x - this.playerPos.x;
      const dz = e.position.z - this.playerPos.z;
      if (dx * dx + dz * dz > 60 * 60) {
        e.dead = true;
      }

      // update mesh
      e.mesh.position.copy(e.position);
      e.mesh.rotation.y = e.yaw;
      // flash red when hurt
      e.mesh.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && 'emissive' in m) {
          (m as any).emissive.setHex(e.hurtTimer > 0 ? 0x661111 : 0x000000);
        }
      });
    }
    // cleanup dead
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (this.entities[i].dead) {
        this.remove(this.entities[i]);
      }
    }
  }

  onPlayerDamage?: (amount: number) => void;

  private blockedAhead(e: Entity): boolean {
    const def = ENTITY_DEFS[e.type];
    const yaw = e.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const ahead = e.position.clone().add(new THREE.Vector3(fx, 0, fz).multiplyScalar(def.width));
    const bx = Math.floor(ahead.x);
    const by = Math.floor(e.position.y);
    const bz = Math.floor(ahead.z);
    return isSolid(this.world.get(bx, by, bz));
  }

  private moveEntity(e: Entity, axis: 'x' | 'y' | 'z', amount: number) {
    if (amount === 0) return;
    const def = ENTITY_DEFS[e.type];
    const pos = e.position.clone();
    pos[axis] += amount;
    const r = def.width / 2;
    const min = new THREE.Vector3(pos.x - r, pos.y, pos.z - r);
    const max = new THREE.Vector3(pos.x + r, pos.y + def.height, pos.z + r);
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
          if (!isSolid(this.world.get(x, y, z))) continue;
          if (
            max.x > x &&
            min.x < x + 1 &&
            max.y > y &&
            min.y < y + 1 &&
            max.z > z &&
            min.z < z + 1
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
          e.position.y = Math.floor(min.y) + 1;
          e.onGround = true;
        } else {
          e.position.y = Math.floor(max.y) - def.height;
        }
        e.velocity.y = 0;
      }
      return;
    }
    e.position[axis] = pos[axis];
    if (axis === 'y' && amount < 0) e.onGround = false;
  }

  dispose() {
    for (const e of this.entities) {
      this.scene.remove(e.mesh);
      e.mesh.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
    }
    this.entities = [];
  }
}
