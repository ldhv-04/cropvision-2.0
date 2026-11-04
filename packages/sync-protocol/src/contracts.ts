import { z } from 'zod/v4';
import { createSelectSchema } from 'drizzle-zod';
import {
  agronomicLogs, blocks, irrigationLeases, leafSamples, scoutingCheckpoints, scoutingSessions, workOrders,
} from '@cropvision/schema';

/** Bump when a table changes shape; client and hub refuse to sync across versions. */
export const SCHEMA_VERSION = 1;
export const HUB_PORT = 45678;
export const MDNS_SERVICE_TYPE = 'cropvision-hub'; // _cropvision-hub._tcp.local.

export const handshakeSchema = z.object({
  hubId: z.string().min(1),
  farmName: z.string(),
  version: z.string(),
  schemaVersion: z.number().int(),
  serverTime: z.number().int(),
});
export type Handshake = z.infer<typeof handshakeSchema>;

const rows = {
  blocks: z.array(createSelectSchema(blocks)),
  scoutingCheckpoints: z.array(createSelectSchema(scoutingCheckpoints)),
  workOrders: z.array(createSelectSchema(workOrders)),
  irrigationLeases: z.array(createSelectSchema(irrigationLeases)),
  scoutingSessions: z.array(createSelectSchema(scoutingSessions)),
  leafSamples: z.array(createSelectSchema(leafSamples)),
  agronomicLogs: z.array(createSelectSchema(agronomicLogs)),
};

/** Desktop → Mobile. */
export const pullResponseSchema = z.object({
  serverTime: z.number().int(),
  blocks: rows.blocks,
  scoutingCheckpoints: rows.scoutingCheckpoints,
  workOrders: rows.workOrders,
  irrigationLeases: rows.irrigationLeases,
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

/** Mobile → Desktop. */
export const pushBodySchema = z.object({
  deviceId: z.string().min(1),
  scoutingSessions: rows.scoutingSessions,
  leafSamples: rows.leafSamples,
  agronomicLogs: rows.agronomicLogs,
  workOrders: rows.workOrders,
  irrigationLeases: rows.irrigationLeases,
});
export type PushBody = z.infer<typeof pushBodySchema>;

export const pushResponseSchema = z.object({
  acknowledgedIds: z.array(z.string()),
  missingMediaSampleIds: z.array(z.string()),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

export const mediaAckSchema = z.object({ sampleId: z.string(), bytes: z.number().int().positive(), mediaSyncStatus: z.literal('VERIFIED') });
export type MediaAck = z.infer<typeof mediaAckSchema>;

export const pullQuerySchema = z.object({ since: z.coerce.number().int().min(0).default(0) });

/** Event pushed over WebSocket to the desktop UI. */
export type HubEvent = { type: 'SESSION_UPDATED'; sessionId: string | null; sampleId?: string };
