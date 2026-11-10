import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Calculator, Droplets, OctagonX } from 'lucide-react';
import { useBlocks, useLeases } from '../../store/queries';
import { ModulePanel } from '../../components/shell/ModulePanel';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Field, Input, NativeSelect } from '../../components/ui/input';
import { DataTable, type Column } from '../../components/ui/data-table';
import { ipcError } from '../../components/severity';

type Plan = Awaited<ReturnType<typeof window.desktopApi.planFertigation>>;
type Lease = NonNullable<ReturnType<typeof useLeases>['data']>[number];

export function Irrigation() {
  const qc = useQueryClient();
  const blocks = useBlocks().data ?? [];
  const leases = useLeases().data ?? [];
  const [blockId, setBlockId] = useState('');
  const block = blocks.find((b) => b.id === blockId);
  const [f, setF] = useState({ waterPerTreeLiters: 2, fertilizerGramsPerTree: 30, injectorRateLph: 100 });
  const [drip, setDrip] = useState({ maxDurationSec: 1800, maxVolumeLiters: 500 });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await qc.invalidateQueries({ queryKey: ['leases'] }); } catch (e) { setErr(ipcError(e)); } };
  const names = new Map(blocks.map((b) => [b.id, b.name]));

  const columns: Column<Lease>[] = [
    { key: 'block', header: 'Lô', width: 'minmax(100px,1fr)', render: (l) => names.get(l.blockId) ?? '—' },
    { key: 'mode', header: 'Chế độ', width: '150px', render: (l) => <span className="telemetry text-xs">{l.mode}</span> },
    { key: 'status', header: 'Trạng thái', width: '190px', render: (l) => <Badge tone={l.status === 'ACTIVE' ? 'hydraulic' : l.status.startsWith('ABORTED') ? 'critical' : undefined}>{l.status}</Badge> },
    { key: 'vol', header: 'Thể tích (L)', width: '130px', numeric: true, render: (l) => `${l.actualVolumeLiters.toFixed(1)} / ${l.maxVolumeLiters.toFixed(0)}` },
    { key: 'bar', header: 'Áp TB (bar)', width: '100px', numeric: true, render: (l) => l.averagePressureBar?.toFixed(2) ?? '—' },
    { key: 'act', header: '', width: '90px', render: (l) => l.status === 'ACTIVE' && <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); void run(() => window.desktopApi.abortLease(l.id)); }}><OctagonX />Dừng</Button> },
  ];

  return (
    <ModulePanel title="Tưới & châm phân Venturi" description='Mọi lệnh mở van là một lease giới hạn thời gian, thể tích và áp suất — không có lệnh "bật van" vô thời hạn.'>
      <div className="grid shrink-0 grid-cols-[220px_1fr_1.4fr] gap-3">
        <Card><CardContent>
          <Field label="Lô"><NativeSelect value={blockId} onChange={(e) => { setBlockId(e.target.value); setPlan(null); }}><option value="">—</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect></Field>
        </CardContent></Card>

        <Card>
          <CardHeader><CardTitle>Tưới nhỏ giọt</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-2">
            <Field label="Tối đa (giây)"><Input type="number" min="1" value={drip.maxDurationSec} onChange={(e) => setDrip({ ...drip, maxDurationSec: +e.target.value })} className="w-24" /></Field>
            <Field label="Tối đa (lít)"><Input type="number" min="1" value={drip.maxVolumeLiters} onChange={(e) => setDrip({ ...drip, maxVolumeLiters: +e.target.value })} className="w-24" /></Field>
            <Button disabled={!block} onClick={() => run(() => window.desktopApi.issueLease({ blockId, mode: 'DRIP_IRRIGATION', ...drip }))}><Droplets />Cấp lease tưới</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Châm phân Venturi</CardTitle><span className="telemetry text-xs text-muted-foreground">2,5 bar · 3 pha</span></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <Field label="Nước/cây (L)"><Input type="number" min="0.1" step="any" value={f.waterPerTreeLiters} onChange={(e) => setF({ ...f, waterPerTreeLiters: +e.target.value })} className="w-20" /></Field>
              <Field label="Phân/cây (g)"><Input type="number" min="0" step="any" value={f.fertilizerGramsPerTree} onChange={(e) => setF({ ...f, fertilizerGramsPerTree: +e.target.value })} className="w-20" /></Field>
              <Field label="Bộ châm (L/h)"><Input type="number" min="1" value={f.injectorRateLph} onChange={(e) => setF({ ...f, injectorRateLph: +e.target.value })} className="w-20" /></Field>
              <Button variant="secondary" disabled={!block} onClick={() => run(async () => setPlan(await window.desktopApi.planFertigation({ treeCount: block!.treeCount, dripFlowLph: block!.nominalDripFlowLph, ...f })))}><Calculator />Tính kế hoạch</Button>
            </div>
            {plan && block && (
              <div className="flex flex-col gap-2">
                <p className="telemetry text-xs">Nước <b>{plan.totalWaterLiters.toFixed(0)} L</b> · Phân <b>{plan.totalFertilizerKg.toFixed(2)} kg</b> · Hút qua Venturi <b>{plan.injectedSolutionLiters.toFixed(1)} L</b></p>
                <table className="w-full text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1 font-medium">Pha</th><th className="py-1 text-right font-medium">Thời gian</th><th className="py-1 text-right font-medium">Áp suất (bar)</th></tr></thead>
                  <tbody className="telemetry">{plan.phases.map((p) => <tr key={p.phase} className="border-t border-border/60"><td className="py-1">{p.phase}</td><td className="py-1 text-right">{p.durationSec} s</td><td className="py-1 text-right">{p.minPressureBar}–{p.maxPressureBar} (đích {p.targetPressureBar})</td></tr>)}</tbody>
                </table>
                <Button className="self-start" onClick={() => run(() => window.desktopApi.issueLease({ blockId, ...plan.lease }))}>Cấp lease châm phân ({plan.lease.maxDurationSec} s)</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {err && <div role="alert" className="shrink-0 rounded-md border border-telemetry-critical-border bg-telemetry-critical-bg px-3 py-2 text-telemetry-critical">{err}</div>}
      <DataTable label="Lease gần đây" columns={columns} rows={leases} rowKey={(l) => l.id} className="min-h-0 flex-1" empty="Chưa có lease." />
    </ModulePanel>
  );
}
