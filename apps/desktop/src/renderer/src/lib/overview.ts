import { DAY_MS, decideCoffeeRustAction, type RustDecision } from '@cropvision/domain';
import { severityTone, type SeverityTone } from '@cropvision/theme-tokens';

interface BlockLike { id: string; name: string; treeCount: number }
interface SessionLike { id: string; blockId: string; startedAt: number; blockSeverityIndexPct: number; diseaseIncidencePct: number; totalSamples: number }

export interface WorkOrderDraft {
  blockId: string; orderType: 'SPRAYING' | 'PRUNING'; title: string;
  instructions: { recommendationCode: RustDecision['code']; sprayVolumeLiters: number; checkpointIds: string[] };
}

export interface BlockOverview {
  latestSessionId: string | null;
  kpis: { bsiPct: number | null; diPct: number | null; samples: number; bsiTone: SeverityTone | null; phiDaysLeft: number };
  decision: RustDecision | null;
  workOrder: WorkOrderDraft | null;
}

/** Overview tab model: latest scouting of the block run through the domain rule engine (same code the hub uses). */
export function blockOverview(i: {
  block: BlockLike; now: number;
  sessions: readonly SessionLike[];
  samples: readonly { checkpointId?: string | null; dsIndexPct: number }[];
  phi: { harvestLockedUntil: number | null } | null;
}): BlockOverview {
  const latest = i.sessions.filter((s) => s.blockId === i.block.id).sort((a, b) => b.startedAt - a.startedAt)[0];
  const lock = i.phi?.harvestLockedUntil ?? null;
  const phiDaysLeft = lock && lock > i.now ? Math.ceil((lock - i.now) / DAY_MS) : 0;
  if (!latest) return { latestSessionId: null, kpis: { bsiPct: null, diPct: null, samples: 0, bsiTone: null, phiDaysLeft }, decision: null, workOrder: null };

  const decision = decideCoffeeRustAction({ bsiPct: latest.blockSeverityIndexPct, diPct: latest.diseaseIncidencePct, treeCount: i.block.treeCount, samples: i.samples });
  const chemical = decision.code !== 'CULTURAL_CONTROL_ONLY';
  return {
    latestSessionId: latest.id,
    kpis: { bsiPct: latest.blockSeverityIndexPct, diPct: latest.diseaseIncidencePct, samples: latest.totalSamples, bsiTone: severityTone(latest.blockSeverityIndexPct), phiDaysLeft },
    decision,
    workOrder: {
      blockId: i.block.id,
      // Assumption A-UI-5: cultural control (prune low canopy, open the canopy) is issued as a PRUNING order.
      orderType: chemical ? 'SPRAYING' : 'PRUNING',
      title: chemical ? `${decision.code === 'BLOCK_WIDE_INTERVENTION' ? 'Phun toàn lô' : 'Phun cục bộ'} ${i.block.name} — ${decision.sprayVolumeLiters.toFixed(0)} L` : `Tỉa cành tầng thấp ${i.block.name}`,
      instructions: { recommendationCode: decision.code, sprayVolumeLiters: decision.sprayVolumeLiters, checkpointIds: decision.affectedCheckpointIds },
    },
  };
}
