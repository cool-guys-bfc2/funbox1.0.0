/*
# MiniCraft world + player persistence (single-tenant, no auth)

1. New Tables
- `world_edits`
  - `id` (uuid, primary key)
  - `x`, `y`, `z` (int, not null) — voxel coordinate
  - `block` (text, not null) — block type id ('air' = removed)
  - `created_at` (timestamptz)
  - Unique constraint on (x, y, z) so re-editing the same voxel upserts.
- `player_state`
  - `id` (int, primary key, always 1 for single-tenant)
  - `mode` (text, not null, default 'survival')
  - `health` (int, not null, default 20)
  - `food` (int, not null, default 20)
  - `position` (jsonb, nullable) — {x, y, z}
  - `yaw` (float, default 0)
  - `pitch` (float, default 0)
  - `flying` (boolean, default false)
  - `inventory` (jsonb, nullable) — array of {slot, block, count}
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on both tables.
- Single-tenant (no sign-in): allow anon + authenticated full CRUD because the
  data is intentionally shared/public (one sandbox world per browser session).
*/

CREATE TABLE IF NOT EXISTS world_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x int NOT NULL,
  y int NOT NULL,
  z int NOT NULL,
  block text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (x, y, z)
);

ALTER TABLE world_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_world_edits" ON world_edits;
CREATE POLICY "anon_select_world_edits" ON world_edits FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_world_edits" ON world_edits;
CREATE POLICY "anon_insert_world_edits" ON world_edits FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_world_edits" ON world_edits;
CREATE POLICY "anon_update_world_edits" ON world_edits FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_world_edits" ON world_edits;
CREATE POLICY "anon_delete_world_edits" ON world_edits FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_world_edits_xyz ON world_edits (x, y, z);

CREATE TABLE IF NOT EXISTS player_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode text NOT NULL DEFAULT 'survival',
  health int NOT NULL DEFAULT 20,
  food int NOT NULL DEFAULT 20,
  position jsonb,
  yaw float DEFAULT 0,
  pitch float DEFAULT 0,
  flying boolean DEFAULT false,
  inventory jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE player_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_player_state" ON player_state;
CREATE POLICY "anon_select_player_state" ON player_state FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_player_state" ON player_state;
CREATE POLICY "anon_insert_player_state" ON player_state FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_player_state" ON player_state;
CREATE POLICY "anon_update_player_state" ON player_state FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_player_state" ON player_state;
CREATE POLICY "anon_delete_player_state" ON player_state FOR DELETE
  TO anon, authenticated USING (true);
