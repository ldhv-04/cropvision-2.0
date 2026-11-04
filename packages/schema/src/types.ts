import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import * as t from './tables';

export type Block = InferSelectModel<typeof t.blocks>;
export type NewBlock = InferInsertModel<typeof t.blocks>;
export type ScoutingCheckpoint = InferSelectModel<typeof t.scoutingCheckpoints>;
export type NewScoutingCheckpoint = InferInsertModel<typeof t.scoutingCheckpoints>;
export type WorkOrder = InferSelectModel<typeof t.workOrders>;
export type NewWorkOrder = InferInsertModel<typeof t.workOrders>;
export type ScoutingSession = InferSelectModel<typeof t.scoutingSessions>;
export type NewScoutingSession = InferInsertModel<typeof t.scoutingSessions>;
export type LeafSample = InferSelectModel<typeof t.leafSamples>;
export type NewLeafSample = InferInsertModel<typeof t.leafSamples>;
export type AgronomicLog = InferSelectModel<typeof t.agronomicLogs>;
export type NewAgronomicLog = InferInsertModel<typeof t.agronomicLogs>;
export type IrrigationLease = InferSelectModel<typeof t.irrigationLeases>;
export type NewIrrigationLease = InferInsertModel<typeof t.irrigationLeases>;
