import type { BlockType } from './blocks';

export interface InventorySlot {
  block: BlockType;
  count: number;
}

export const MAX_STACK = 64;
export const INVENTORY_SIZE = 36; // 9 hotbar + 27 main

export class Inventory {
  slots: (InventorySlot | null)[];
  // selected hotbar index 0..8
  selected = 0;

  constructor() {
    this.slots = new Array(INVENTORY_SIZE).fill(null);
  }

  /** Add count of block to inventory. Returns leftover count that didn't fit. */
  add(block: BlockType, count = 1): number {
    if (block === 'air' || count <= 0) return 0;
    // first, fill existing stacks
    let remaining = count;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.block === block && s.count < MAX_STACK) {
        const add = Math.min(MAX_STACK - s.count, remaining);
        s.count += add;
        remaining -= add;
      }
    }
    // then, fill empty slots
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(MAX_STACK, remaining);
        this.slots[i] = { block, count: add };
        remaining -= add;
      }
    }
    return remaining;
  }

  /** Remove count of block. Returns actual removed count. */
  remove(block: BlockType, count = 1): number {
    let remaining = count;
    let removed = 0;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.block === block) {
        const take = Math.min(s.count, remaining);
        s.count -= take;
        removed += take;
        remaining -= take;
        if (s.count === 0) this.slots[i] = null;
      }
    }
    return removed;
  }

  count(block: BlockType): number {
    let total = 0;
    for (const s of this.slots) {
      if (s && s.block === block) total += s.count;
    }
    return total;
  }

  /** Get the block currently selected on the hotbar, or null. */
  selectedBlock(): BlockType | null {
    const s = this.slots[this.selected];
    return s ? s.block : null;
  }

  /** Consume one of the selected hotbar block. Returns true if consumed. */
  consumeSelected(): boolean {
    const s = this.slots[this.selected];
    if (!s) return false;
    s.count -= 1;
    if (s.count <= 0) this.slots[this.selected] = null;
    return true;
  }

  /** Move a slot's contents to another slot (swap or merge). */
  move(from: number, to: number) {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (!b) {
      this.slots[to] = a;
      this.slots[from] = null;
    } else if (b.block === a.block) {
      const add = Math.min(MAX_STACK - b.count, a.count);
      b.count += add;
      a.count -= add;
      if (a.count <= 0) this.slots[from] = null;
    } else {
      this.slots[from] = b;
      this.slots[to] = a;
    }
  }

  /** Set a slot directly (for creative mode / commands). */
  setSlot(index: number, block: BlockType, count: number) {
    if (index < 0 || index >= this.slots.length) return;
    if (block === 'air' || count <= 0) {
      this.slots[index] = null;
    } else {
      this.slots[index] = { block, count: Math.min(MAX_STACK, count) };
    }
  }

  /** Clear all slots. */
  clear() {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = null;
  }

  /** Serialize for persistence. */
  toJSON(): InventorySlot[] {
    return this.slots.map((s) => (s ? { ...s } : null)) as any;
  }

  /** Restore from persistence. */
  fromJSON(data: InventorySlot[] | null) {
    this.clear();
    if (!data) return;
    for (let i = 0; i < Math.min(data.length, this.slots.length); i++) {
      if (data[i] && data[i].block && data[i].count > 0) {
        this.slots[i] = { block: data[i].block, count: data[i].count };
      }
    }
  }

  /** Hotbar slots (0..8) for the UI. */
  hotbar(): (InventorySlot | null)[] {
    return this.slots.slice(0, 9);
  }

  /** Main inventory slots (9..35) for the UI. */
  main(): (InventorySlot | null)[] {
    return this.slots.slice(9);
  }
}
