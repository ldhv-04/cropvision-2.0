import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { SPRAY_LITERS_PER_TREE } from '@cropvision/domain';
import { useBlocks, useCosts, useLeases, usePhi, useSamples, useSessions, useLogs } from '../../store/queries';
import { useUi, type InspectorTab } from '../../store/ui';
import { blockOverview } from '../../lib/overview';
import { cn } from '../../lib/utils';
import { SampleList } from '../../features/scouting/SampleList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { fmtDate, fmtPct, fmtVnd, ipcError } from '../severity';

const TONE_TEXT = { healthy: 'text-telemetry-healthy', warning: 'text-telemetry-warning', critical: 'text-telemetry-critical' } as const;

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('telemetry text-xl font-bold', className)}>{value}</span>
    </div>
  );
}

function Overview({ blockId }: { blockId: string }) {
  const qc = useQueryClient();
  const block = useBlocks().data?.find((b) => b.id === blockId);
  const sessions = useSessions().data ?? [];
  const phi = usePhi().data?.find((p) => p.blockId === blockId) ?? null;
  const latestId = sessions.filter((s) => s.blockId === blockId).sort((a, b) => b.startedAt - a.startedAt)[0]?.id ?? null;
  const samples = useSamples(latestId).data ?? [];
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!block) return null;
  const o = blockOverview({ block, sessions, samples, phi, now: Date.now() });
  const issue = async () => {
    if (!o.workOrder) return;
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      await window.desktopApi.createWorkOrder({ ...o.workOrder, scheduledDate: today.getTime() });
      await qc.invalidateQueries({ queryKey: ['workOrders'] });
      setMsg({ ok: true, text: `Đã giao: ${o.workOrder.title}` });
    } catch (e) { setMsg({ ok: false, text: ipcError(e) }); }
  };
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{block.name}</h2>
        <span className="telemetry text-xs text-muted-foreground">{block.areaHectares.toFixed(2)} ha · {block.treeCount} cây</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="BSI" value={fmtPct(o.kpis.bsiPct)} className={o.kpis.bsiTone ? TONE_TEXT[o.kpis.bsiTone] : undefined} />
        <Kpi label="DI" value={fmtPct(o.kpis.diPct)} />
        <Kpi label="Mẫu phiên gần nhất" value={String(o.kpis.samples)} />
        <Kpi label="Khóa PHI còn" value={o.kpis.phiDaysLeft ? `${o.kpis.phiDaysLeft} ngày` : 'Không'} className={o.kpis.phiDaysLeft ? 'text-telemetry-critical' : undefined} />
      </div>
      <section aria-label="Khuyến nghị bộ luật" className="rounded-md border border-border bg-background">
        <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bộ luật xác định (WASI)</div>
        {o.decision ? (
          <div className="flex flex-col gap-2 p-3">
            <Badge tone={o.kpis.bsiTone ?? undefined} className="telemetry self-start">{o.decision.code}</Badge>
            <p className="text-muted-foreground">{o.decision.summary}</p>
            <dl className="telemetry grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Dung dịch phun</dt><dd className="text-right font-bold">{o.decision.sprayVolumeLiters.toFixed(1)} L</dd>
              <dt className="text-muted-foreground">Định mức</dt><dd className="text-right">{SPRAY_LITERS_PER_TREE} L/cây</dd>
              <dt className="text-muted-foreground">Điểm chốt cần phun</dt><dd className="text-right">{o.decision.affectedCheckpointIds.length}</dd>
            </dl>
            <Button onClick={issue} className="mt-1"><Send />Giao lệnh cho điện thoại</Button>
            {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-xs text-telemetry-healthy' : 'text-xs text-telemetry-critical'}>{msg.text}</p>}
          </div>
        ) : <p className="p-3 text-muted-foreground">Chưa có phiên khảo sát cho lô này.</p>}
      </section>
    </div>
  );
}

function Leases({ blockId }: { blockId: string }) {
  const leases = (useLeases().data ?? []).filter((l) => l.blockId === blockId);
  if (!leases.length) return <p className="p-4 text-muted-foreground">Chưa có lease tưới cho lô này.</p>;
  return (
    <ul className="flex flex-col">
      {leases.map((l) => (
        <li key={l.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Badge tone={l.status === 'ACTIVE' ? 'hydraulic' : l.status.startsWith('ABORTED') ? 'critical' : undefined}>{l.status}</Badge>
          <span className="text-xs text-muted-foreground">{l.mode}</span>
          <span className="telemetry ml-auto text-xs">{l.actualVolumeLiters.toFixed(1)}/{l.maxVolumeLiters.toFixed(0)} L · {l.averagePressureBar?.toFixed(2) ?? '—'} bar</span>
        </li>
      ))}
    </ul>
  );
}

function PhiCosts({ blockId }: { blockId: string }) {
  const phi = usePhi().data?.find((p) => p.blockId === blockId);
  const cost = useCosts().data?.find((c) => c.blockId === blockId);
  const logs = (useLogs().data ?? []).filter((g) => g.blockId === blockId);
  return (
    <div className="flex flex-col gap-3 p-3">
      <dl className="telemetry grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">Dự kiến thu hoạch</dt><dd className="text-right">{fmtDate(phi?.expectedHarvestDate)}</dd>
        <dt className="text-muted-foreground">Cách ly đến</dt><dd className={cn('text-right', phi?.harvestLockedUntil && 'text-telemetry-critical font-bold')}>{fmtDate(phi?.harvestLockedUntil)}</dd>
        <dt className="text-muted-foreground">Tổng chi phí vật tư</dt><dd className="text-right font-bold">{fmtVnd(cost?.totalCostVnd ?? 0)}</dd>
      </dl>
      {phi?.conflictsWithExpectedHarvest && <p role="alert" className="rounded-md border border-telemetry-critical-border bg-telemetry-critical-bg px-3 py-2 text-telemetry-critical">Cách ly vượt ngày thu hoạch dự kiến</p>}
      <ul className="flex flex-col">
        {logs.slice(0, 25).map((g) => (
          <li key={g.id} className="flex items-center gap-2 border-b border-border/60 py-1.5 text-xs">
            <span className="telemetry text-muted-foreground">{fmtDate(g.executedAt)}</span><span className="truncate">{g.productName}</span>
            <span className="telemetry ml-auto">{fmtVnd(g.totalCostVnd)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RightInspectorDock() {
  const { selectedBlockId, selectedSessionId, inspectorTab, setInspectorTab } = useUi();
  const sessions = useSessions().data ?? [];
  const latestOfBlock = sessions.filter((s) => s.blockId === selectedBlockId).sort((a, b) => b.startedAt - a.startedAt)[0]?.id ?? null;
  return (
    <aside data-testid="inspector" aria-label="Bảng kiểm tra" className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-card">
      <Tabs value={inspectorTab} onValueChange={(t) => setInspectorTab(t as InspectorTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="samples">Mẫu lá</TabsTrigger>
          <TabsTrigger value="leases">Lease tưới</TabsTrigger>
          <TabsTrigger value="phi">PHI & Chi phí</TabsTrigger>
        </TabsList>
        {!selectedBlockId && !selectedSessionId
          ? <p className="p-4 text-muted-foreground">Chọn một lô trên bản đồ (hoặc Ctrl K) để xem chi tiết.</p>
          : <>
            <TabsContent value="overview" className="overflow-y-auto">{selectedBlockId && <Overview blockId={selectedBlockId} />}</TabsContent>
            <TabsContent value="samples" className="flex flex-col"><SampleList sessionId={selectedSessionId ?? latestOfBlock} blockId={selectedBlockId} /></TabsContent>
            <TabsContent value="leases" className="overflow-y-auto">{selectedBlockId && <Leases blockId={selectedBlockId} />}</TabsContent>
            <TabsContent value="phi" className="overflow-y-auto">{selectedBlockId && <PhiCosts blockId={selectedBlockId} />}</TabsContent>
          </>}
      </Tabs>
    </aside>
  );
}
