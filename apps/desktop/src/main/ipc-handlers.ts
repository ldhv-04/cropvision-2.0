import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod/v4';
import {
  agronomicLogs, blocks, leafSamples, scoutingCheckpoints, scoutingSessions, workOrders,
} from '@cropvision/schema';
import {
  DAY_MS, PhiViolationError, evaluateAgronomicAction, generateScoutingCheckpoints, generateUuidV7,
  planVenturiFertigation, polygonAreaHectares, type VenturiInput,
} from '@cropvision/domain';
import type { Db } from './db';
import { thumbUrl } from './thumbnails';
import type { LeaseManager, LeaseRequest } from './lease-manager';

export interface HubInfo { port: number; hubId: string; farmName: string; addresses: string[]; mdns: boolean }
export interface HandlerContext { db: Db; leases: LeaseManager; hubInfo: () => HubInfo; now?: () => number }

const polygon = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()).min(2)).min(4)).min(1),
});
const blockInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  cropVariety: z.enum(['ROBUSTA', 'ARABICA']),
  growthStage: z.enum(['ESTABLISHMENT', 'FLOWER_INDUCTION_DRY', 'BLOOMING', 'FRUIT_DEVELOPMENT', 'RIPENING', 'POST_HARVEST']),
  treeCount: z.number().int().min(0),
  boundary: polygon,
  expectedHarvestDate: z.number().int().nullable().optional(),
  nominalDripFlowLph: z.number().positive().default(4),
});
const workOrderInput = z.object({
  blockId: z.string(), orderType: z.enum(['SCOUTING', 'IRRIGATION', 'FERTIGATION', 'SPRAYING', 'PRUNING']),
  title: z.string().min(1), scheduledDate: z.number().int(), instructions: z.record(z.string(), z.unknown()).default({}),
});
const logInput = z.object({
  blockId: z.string(), actionCategory: z.enum(['FERTILIZER', 'PESTICIDE', 'IRRIGATION', 'SOIL_AMENDMENT']),
  productName: z.string().min(1), activeIngredient: z.string().nullish(), barcodeString: z.string().nullish(),
  quantityApplied: z.number().nonnegative(), unit: z.enum(['KG', 'LITER', 'GRAM', 'ML', 'M3']),
  totalCostVnd: z.number().int().nonnegative().default(0), preHarvestIntervalDays: z.number().int().nonnegative().default(0),
  executedAt: z.number().int(),
});
export type BlockInput = z.input<typeof blockInput>;
export type WorkOrderInput = z.input<typeof workOrderInput>;
export type LogInput = z.input<typeof logInput>;

/** cv-media:// URL for a stored image; the protocol handler in main/index.ts serves it from disk. */
export const mediaUrl = (relativeKey: string) => `cv-media://media/${relativeKey.split('/').map(encodeURIComponent).join('/')}`;

/** All business operations the renderer may call. Pure of Electron so they are unit-testable. */
export function createHandlers(c: HandlerContext) {
  const { db } = c;
  const now = c.now ?? Date.now;
  const live = <T extends { deletedAt: any }>(t: T) => isNull(t.deletedAt);
  const stamp = () => ({ updatedAt: now(), syncStatus: 'PENDING' as const });
  const need = <T>(v: T | undefined, what: string): T => { if (v === undefined) throw new Error(`${what} not found`); return v; };

  return {
    hubInfo: async () => c.hubInfo(),
    mediaUrl,

    listBlocks: async () => db.select().from(blocks).where(live(blocks)).all(),
    saveBlock: async (raw: BlockInput) => {
      const i = blockInput.parse(raw);
      const prev = i.id ? db.select().from(blocks).where(eq(blocks.id, i.id)).get() : undefined;
      const row = {
        id: i.id ?? generateUuidV7(), name: i.name, cropVariety: i.cropVariety, growthStage: i.growthStage, treeCount: i.treeCount,
        areaHectares: polygonAreaHectares(i.boundary), boundaryGeoJson: JSON.stringify(i.boundary),
        expectedHarvestDate: i.expectedHarvestDate ?? null, nominalDripFlowLph: i.nominalDripFlowLph,
        createdAt: prev?.createdAt ?? now(), deletedAt: null, ...stamp(),
      };
      db.insert(blocks).values(row).onConflictDoUpdate({ target: blocks.id, set: row }).run();
      return row;
    },
    deleteBlock: async (id: string) => { db.update(blocks).set({ deletedAt: now(), ...stamp() }).where(eq(blocks.id, id)).run(); },

    listCheckpoints: async (blockId: string) =>
      db.select().from(scoutingCheckpoints).where(and(eq(scoutingCheckpoints.blockId, blockId), live(scoutingCheckpoints))).all()
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    generateCheckpoints: async (blockId: string, count = 5) => {
      const block = need(db.select().from(blocks).where(eq(blocks.id, blockId)).get(), 'block');
      const pts = generateScoutingCheckpoints(JSON.parse(block.boundaryGeoJson), count);
      return db.transaction((tx) => {
        tx.update(scoutingCheckpoints).set({ deletedAt: now(), ...stamp() }).where(and(eq(scoutingCheckpoints.blockId, blockId), live(scoutingCheckpoints))).run();
        return pts.map((p) => {
          const row = { id: generateUuidV7(), blockId, ...p, createdAt: now(), deletedAt: null, ...stamp() };
          tx.insert(scoutingCheckpoints).values(row).run();
          return row;
        });
      });
    },

    listWorkOrders: async () => db.select().from(workOrders).where(live(workOrders)).all().sort((a, b) => a.scheduledDate - b.scheduledDate),
    createWorkOrder: async (raw: WorkOrderInput) => {
      const i = workOrderInput.parse(raw);
      const row = {
        id: generateUuidV7(), blockId: i.blockId, orderType: i.orderType, status: 'OPEN' as const, title: i.title,
        instructionsJson: JSON.stringify(i.instructions), scheduledDate: i.scheduledDate, completedAt: null, createdAt: now(), deletedAt: null, ...stamp(),
      };
      db.insert(workOrders).values(row).run();
      return row;
    },
    setWorkOrderStatus: async (id: string, status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') => {
      db.update(workOrders).set({ status, completedAt: status === 'COMPLETED' ? now() : null, ...stamp() }).where(eq(workOrders.id, id)).run();
    },

    listSessions: async () => {
      const names = new Map(db.select({ id: blocks.id, name: blocks.name }).from(blocks).all().map((b) => [b.id, b.name]));
      return db.select().from(scoutingSessions).where(live(scoutingSessions)).all()
        .sort((a, b) => b.startedAt - a.startedAt).map((s) => ({ ...s, blockName: names.get(s.blockId) ?? '?' }));
    },
    listSamples: async (sessionId: string) =>
      db.select().from(leafSamples).where(and(eq(leafSamples.sessionId, sessionId), live(leafSamples))).all()
        .map((s) => {
          const ok = s.mediaSyncStatus === 'VERIFIED';
          return { ...s, mediaUrl: ok ? mediaUrl(s.imageRelativeKey) : null, thumbUrl: ok ? thumbUrl(s.imageRelativeKey) : null };
        }),

    listLogs: async () => db.select().from(agronomicLogs).where(live(agronomicLogs)).all().sort((a, b) => b.executedAt - a.executedAt),
    /** Pesticides pass the deterministic PHI lock before they are written (architectural law 5). */
    addLog: async (raw: LogInput) => {
      const i = logInput.parse(raw);
      const block = need(db.select().from(blocks).where(eq(blocks.id, i.blockId)).get(), 'block');
      let unlock = i.executedAt + i.preHarvestIntervalDays * DAY_MS;
      if (i.actionCategory === 'PESTICIDE') {
        const v = evaluateAgronomicAction({
          kind: 'PESTICIDE', nowMs: now(), // hub clock: a backdated executedAt must not bypass the lock
          block: { expectedHarvestDate: block.expectedHarvestDate },
          product: { name: i.productName, activeIngredient: i.activeIngredient ?? '', phiDays: i.preHarvestIntervalDays },
        });
        if (!v.approved) throw new PhiViolationError(v.safeHarvestUnlockDate!, block.expectedHarvestDate!);
        unlock = v.safeHarvestUnlockDate!;
      }
      const row = { ...i, id: generateUuidV7(), activeIngredient: i.activeIngredient ?? null, barcodeString: i.barcodeString ?? null, safeHarvestUnlockDate: unlock, createdAt: now(), deletedAt: null, ...stamp() };
      db.insert(agronomicLogs).values(row).run();
      return row;
    },
    phiStatus: async () => {
      const logs = db.select().from(agronomicLogs).where(live(agronomicLogs)).all();
      return db.select().from(blocks).where(live(blocks)).all().map((b) => {
        const unlock = Math.max(0, ...logs.filter((l) => l.blockId === b.id && l.actionCategory === 'PESTICIDE').map((l) => l.safeHarvestUnlockDate));
        return {
          blockId: b.id, blockName: b.name, expectedHarvestDate: b.expectedHarvestDate,
          harvestLockedUntil: unlock > now() ? unlock : null,
          conflictsWithExpectedHarvest: b.expectedHarvestDate != null && unlock > b.expectedHarvestDate,
        };
      });
    },
    costSummary: async () => {
      const totals = new Map<string, number>();
      for (const l of db.select().from(agronomicLogs).where(live(agronomicLogs)).all()) totals.set(l.blockId, (totals.get(l.blockId) ?? 0) + l.totalCostVnd);
      const names = new Map(db.select({ id: blocks.id, name: blocks.name }).from(blocks).all().map((b) => [b.id, b.name]));
      return [...totals].map(([blockId, totalCostVnd]) => ({ blockId, blockName: names.get(blockId) ?? '?', totalCostVnd }));
    },

    planFertigation: async (i: VenturiInput) => planVenturiFertigation(i),
    issueLease: async (r: LeaseRequest) => c.leases.issue(r),
    abortLease: async (id: string) => c.leases.abort(id),
    listLeases: async () => c.leases.list(),
  };
}
export type Handlers = ReturnType<typeof createHandlers>;
