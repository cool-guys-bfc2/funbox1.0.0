import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { InventorySlot } from './inventory';
import type { GameMode } from './gameModes';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase: SupabaseClient = createClient(url, anon);

export interface WorldEdit {
  x: number;
  y: number;
  z: number;
  block: string;
}

export interface PlayerStateRow {
  id: number;
  mode: GameMode;
  health: number;
  food: number;
  position: { x: number; y: number; z: number } | null;
  yaw: number;
  pitch: number;
  flying: boolean;
  inventory: InventorySlot[] | null;
  updated_at?: string;
}

// ---- World edits ----

export async function loadWorldEdits(): Promise<WorldEdit[]> {
  const { data, error } = await supabase
    .from('world_edits')
    .select('x,y,z,block')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('loadWorldEdits failed:', error.message);
    return [];
  }
  return (data ?? []) as WorldEdit[];
}

export async function saveWorldEdit(edit: WorldEdit): Promise<void> {
  const { error } = await supabase
    .from('world_edits')
    .upsert(edit, { onConflict: 'x,y,z' });
  if (error) console.warn('saveWorldEdit failed:', error.message);
}

export async function deleteWorldEdit(x: number, y: number, z: number): Promise<void> {
  const { error } = await supabase
    .from('world_edits')
    .delete()
    .eq('x', x)
    .eq('y', y)
    .eq('z', z);
  if (error) console.warn('deleteWorldEdit failed:', error.message);
}

// ---- Player state ----

export async function loadPlayerState(): Promise<PlayerStateRow | null> {
  const { data, error } = await supabase
    .from('player_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    console.warn('loadPlayerState failed:', error.message);
    return null;
  }
  return (data as PlayerStateRow) ?? null;
}

export async function savePlayerState(state: Omit<PlayerStateRow, 'id' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('player_state').upsert(
    { id: 1, ...state },
    { onConflict: 'id' }
  );
  if (error) console.warn('savePlayerState failed:', error.message);
}
