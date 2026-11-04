import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const SYNC_STATUSES = ['PENDING', 'SYNCED', 'CONFLICT'] as const;

// The 4 system columns every synced table carries (SPEC phase 1, assumption A1).
const sys = () => ({
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  syncStatus: text('sync_status', { enum: SYNC_STATUSES }).notNull().default('PENDING'),
});
const updatedIdx = (name: string) => (t: { updatedAt: any }) => ({ updatedIdx: index(`${name}_updated_at_idx`).on(t.updatedAt) });

export const blocks = sqliteTable('blocks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cropVariety: text('crop_variety', { enum: ['ROBUSTA', 'ARABICA'] }).notNull(),
  growthStage: text('growth_stage', {
    enum: ['ESTABLISHMENT', 'FLOWER_INDUCTION_DRY', 'BLOOMING', 'FRUIT_DEVELOPMENT', 'RIPENING', 'POST_HARVEST'],
  }).notNull(),
  treeCount: integer('tree_count').notNull(),
  areaHectares: real('area_hectares').notNull(),
  boundaryGeoJson: text('boundary_geojson').notNull(),
  expectedHarvestDate: integer('expected_harvest_date'),
  nominalDripFlowLph: real('nominal_drip_flow_lph').notNull().default(4.0),
  ...sys(),
}, updatedIdx('blocks'));

export const scoutingCheckpoints = sqliteTable('scouting_checkpoints', {
  id: text('id').primaryKey(),
  blockId: text('block_id').notNull().references(() => blocks.id),
  sequenceOrder: integer('sequence_order').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  ...sys(),
}, updatedIdx('scouting_checkpoints'));

export const workOrders = sqliteTable('work_orders', {
  id: text('id').primaryKey(),
  blockId: text('block_id').notNull().references(() => blocks.id),
  orderType: text('order_type', { enum: ['SCOUTING', 'IRRIGATION', 'FERTIGATION', 'SPRAYING', 'PRUNING'] }).notNull(),
  status: text('status', { enum: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] }).notNull().default('OPEN'),
  title: text('title').notNull(),
  instructionsJson: text('instructions_json').notNull(),
  scheduledDate: integer('scheduled_date').notNull(),
  completedAt: integer('completed_at'),
  ...sys(),
}, updatedIdx('work_orders'));

export const scoutingSessions = sqliteTable('scouting_sessions', {
  id: text('id').primaryKey(),
  blockId: text('block_id').notNull().references(() => blocks.id),
  workOrderId: text('work_order_id').references(() => workOrders.id),
  deviceId: text('device_id').notNull(),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  totalSamples: integer('total_samples').notNull().default(0),
  diseaseIncidencePct: real('disease_incidence_pct').notNull().default(0),
  blockSeverityIndexPct: real('block_severity_index_pct').notNull().default(0),
  recommendationCode: text('recommendation_code'),
  recommendationSummary: text('recommendation_summary'),
  ...sys(),
}, updatedIdx('scouting_sessions'));

export const leafSamples = sqliteTable('leaf_samples', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => scoutingSessions.id),
  checkpointId: text('checkpoint_id').references(() => scoutingCheckpoints.id),
  canopyLayer: text('canopy_layer', { enum: ['TOP', 'MID', 'LOW'] }).notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  imuStabilityScore: real('imu_stability_score').notNull(),
  leafPixelCount: integer('leaf_pixel_count').notNull(),
  lesionPixelCount: integer('lesion_pixel_count').notNull(),
  dsIndexPct: real('ds_index_pct').notNull(),
  uncertaintyEntropy: real('uncertainty_entropy').notNull().default(0),
  inferenceLatencyMs: real('inference_latency_ms').notNull().default(0),
  engineVersion: text('engine_version').notNull(),
  imageRelativeKey: text('image_relative_key').notNull(),
  mediaSyncStatus: text('media_sync_status', { enum: ['LOCAL_ONLY', 'UPLOADED', 'VERIFIED'] }).notNull().default('LOCAL_ONLY'),
  capturedAt: integer('captured_at').notNull(),
  ...sys(),
}, updatedIdx('leaf_samples'));

export const agronomicLogs = sqliteTable('agronomic_logs', {
  id: text('id').primaryKey(),
  blockId: text('block_id').notNull().references(() => blocks.id),
  actionCategory: text('action_category', { enum: ['FERTILIZER', 'PESTICIDE', 'IRRIGATION', 'SOIL_AMENDMENT'] }).notNull(),
  productName: text('product_name').notNull(),
  activeIngredient: text('active_ingredient'),
  barcodeString: text('barcode_string'),
  quantityApplied: real('quantity_applied').notNull(),
  unit: text('unit', { enum: ['KG', 'LITER', 'GRAM', 'ML', 'M3'] }).notNull(),
  totalCostVnd: integer('total_cost_vnd').notNull().default(0),
  preHarvestIntervalDays: integer('pre_harvest_interval_days').notNull().default(0),
  safeHarvestUnlockDate: integer('safe_harvest_unlock_date').notNull(),
  executedAt: integer('executed_at').notNull(),
  ...sys(),
}, updatedIdx('agronomic_logs'));

export const irrigationLeases = sqliteTable('irrigation_leases', {
  id: text('id').primaryKey(),
  blockId: text('block_id').notNull().references(() => blocks.id),
  mode: text('mode', { enum: ['DRIP_IRRIGATION', 'VENTURI_FERTIGATION'] }).notNull(),
  status: text('status', {
    enum: ['ISSUED', 'ACTIVE', 'COMPLETED', 'ABORTED_PRESSURE_FAULT', 'ABORTED_FLOW_FAULT', 'EXPIRED'],
  }).notNull(),
  maxDurationSec: integer('max_duration_sec').notNull(),
  maxVolumeLiters: real('max_volume_liters').notNull(),
  minPressureBar: real('min_pressure_bar').notNull().default(2.0),
  maxPressureBar: real('max_pressure_bar').notNull().default(3.5),
  requiredPressureBar: real('required_pressure_bar').notNull().default(2.5),
  actualVolumeLiters: real('actual_volume_liters').notNull().default(0),
  averagePressureBar: real('average_pressure_bar'),
  issuedAt: integer('issued_at').notNull(),
  completedAt: integer('completed_at'),
  ...sys(),
}, updatedIdx('irrigation_leases'));
