// Hand-written DDL kept in lock-step with tables.ts (test/schema.test.ts fails on column drift).
// shortcut: single create-if-not-exists script, no versioned migrations; add a user_version ladder on first breaking change.
const sys = `created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, sync_status TEXT NOT NULL DEFAULT 'PENDING'`;
const idx = (t: string) => `CREATE INDEX IF NOT EXISTS ${t}_updated_at_idx ON ${t}(updated_at);`;

export const createTablesSql = `
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, crop_variety TEXT NOT NULL, growth_stage TEXT NOT NULL,
  tree_count INTEGER NOT NULL, area_hectares REAL NOT NULL, boundary_geojson TEXT NOT NULL,
  expected_harvest_date INTEGER, nominal_drip_flow_lph REAL NOT NULL DEFAULT 4, ${sys});
CREATE TABLE IF NOT EXISTS scouting_checkpoints (
  id TEXT PRIMARY KEY NOT NULL, block_id TEXT NOT NULL REFERENCES blocks(id), sequence_order INTEGER NOT NULL,
  latitude REAL NOT NULL, longitude REAL NOT NULL, ${sys});
CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY NOT NULL, block_id TEXT NOT NULL REFERENCES blocks(id), order_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN', title TEXT NOT NULL, instructions_json TEXT NOT NULL,
  scheduled_date INTEGER NOT NULL, completed_at INTEGER, ${sys});
CREATE TABLE IF NOT EXISTS scouting_sessions (
  id TEXT PRIMARY KEY NOT NULL, block_id TEXT NOT NULL REFERENCES blocks(id),
  work_order_id TEXT REFERENCES work_orders(id), device_id TEXT NOT NULL, started_at INTEGER NOT NULL,
  completed_at INTEGER, total_samples INTEGER NOT NULL DEFAULT 0, disease_incidence_pct REAL NOT NULL DEFAULT 0,
  block_severity_index_pct REAL NOT NULL DEFAULT 0, recommendation_code TEXT, recommendation_summary TEXT, ${sys});
CREATE TABLE IF NOT EXISTS leaf_samples (
  id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES scouting_sessions(id),
  checkpoint_id TEXT REFERENCES scouting_checkpoints(id), canopy_layer TEXT NOT NULL,
  latitude REAL NOT NULL, longitude REAL NOT NULL, imu_stability_score REAL NOT NULL,
  leaf_pixel_count INTEGER NOT NULL, lesion_pixel_count INTEGER NOT NULL, ds_index_pct REAL NOT NULL,
  uncertainty_entropy REAL NOT NULL DEFAULT 0, inference_latency_ms REAL NOT NULL DEFAULT 0,
  engine_version TEXT NOT NULL, image_relative_key TEXT NOT NULL,
  media_sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY', captured_at INTEGER NOT NULL, ${sys});
CREATE TABLE IF NOT EXISTS agronomic_logs (
  id TEXT PRIMARY KEY NOT NULL, block_id TEXT NOT NULL REFERENCES blocks(id), action_category TEXT NOT NULL,
  product_name TEXT NOT NULL, active_ingredient TEXT, barcode_string TEXT, quantity_applied REAL NOT NULL,
  unit TEXT NOT NULL, total_cost_vnd INTEGER NOT NULL DEFAULT 0, pre_harvest_interval_days INTEGER NOT NULL DEFAULT 0,
  safe_harvest_unlock_date INTEGER NOT NULL, executed_at INTEGER NOT NULL, ${sys});
CREATE TABLE IF NOT EXISTS irrigation_leases (
  id TEXT PRIMARY KEY NOT NULL, block_id TEXT NOT NULL REFERENCES blocks(id), mode TEXT NOT NULL, status TEXT NOT NULL,
  max_duration_sec INTEGER NOT NULL, max_volume_liters REAL NOT NULL, min_pressure_bar REAL NOT NULL DEFAULT 2,
  max_pressure_bar REAL NOT NULL DEFAULT 3.5, required_pressure_bar REAL NOT NULL DEFAULT 2.5,
  actual_volume_liters REAL NOT NULL DEFAULT 0, average_pressure_bar REAL, issued_at INTEGER NOT NULL,
  completed_at INTEGER, ${sys});
${['blocks', 'scouting_checkpoints', 'work_orders', 'scouting_sessions', 'leaf_samples', 'agronomic_logs', 'irrigation_leases'].map(idx).join('\n')}
`;
