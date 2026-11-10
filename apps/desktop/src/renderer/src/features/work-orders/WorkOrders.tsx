import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardPlus, NotebookPen, TriangleAlert } from 'lucide-react';
import { useBlocks, useCosts, useLogs, usePhi, useWorkOrders } from '../../store/queries';
import { fmtDate, fmtVnd, ipcError, toMs } from '../../components/severity';
import { ModulePanel } from '../../components/shell/ModulePanel';
import { Button } from '../../components/ui/button';
import { Field, Input, NativeSelect } from '../../components/ui/input';
import { DataTable, type Column } from '../../components/ui/data-table';

const TYPES = ['SCOUTING', 'IRRIGATION', 'FERTIGATION', 'SPRAYING', 'PRUNING'] as const;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const CATS = ['FERTILIZER', 'PESTICIDE', 'IRRIGATION', 'SOIL_AMENDMENT'] as const;
const UNITS = ['KG', 'LITER', 'GRAM', 'ML', 'M3'] as const;
const today = () => new Date().toISOString().slice(0, 10);
type Order = NonNullable<ReturnType<typeof useWorkOrders>['data']>[number];
type Log = NonNullable<ReturnType<typeof useLogs>['data']>[number];

export function WorkOrders() {
  const qc = useQueryClient();
  const blocks = useBlocks().data ?? [];
  const orders = useWorkOrders().data ?? [];
  const logs = useLogs().data ?? [];
  const phi = usePhi().data ?? [];
  const costs = useCosts().data ?? [];
  const names = new Map(blocks.map((b) => [b.id, b.name]));
  const [o, setO] = useState({ blockId: '', orderType: 'SCOUTING' as (typeof TYPES)[number], title: '', date: today() });
  const [l, setL] = useState({ blockId: '', actionCategory: 'PESTICIDE' as (typeof CATS)[number], productName: '', activeIngredient: '', quantityApplied: 1, unit: 'LITER' as (typeof UNITS)[number], totalCostVnd: 0, phiDays: 0, date: today() });
  const [err, setErr] = useState<string | null>(null);
  const refresh = (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const blockOptions = <><option value="">—</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</>;

  const orderCols: Column<Order>[] = [
    { key: 'date', header: 'Ngày', width: '100px', numeric: true, render: (w) => fmtDate(w.scheduledDate) },
    { key: 'block', header: 'Lô', width: '120px', render: (w) => names.get(w.blockId) },
    { key: 'type', header: 'Loại', width: '120px', render: (w) => <span className="telemetry text-xs">{w.orderType}</span> },
    { key: 'title', header: 'Tiêu đề', width: 'minmax(140px,1fr)', render: (w) => w.title },
    { key: 'status', header: 'Trạng thái', width: '140px', render: (w) => (
      <NativeSelect aria-label={`Trạng thái ${w.title}`} className="h-7 w-full text-xs" value={w.status} onChange={async (e) => { await window.desktopApi.setWorkOrderStatus(w.id, e.target.value as any); await refresh('workOrders'); }}>
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </NativeSelect>) },
  ];
  const logCols: Column<Log>[] = [
    { key: 'date', header: 'Ngày', width: '100px', numeric: true, render: (g) => fmtDate(g.executedAt) },
    { key: 'block', header: 'Lô', width: '110px', render: (g) => names.get(g.blockId) },
    { key: 'cat', header: 'Loại', width: '120px', render: (g) => <span className="telemetry text-xs">{g.actionCategory}</span> },
    { key: 'prod', header: 'Sản phẩm', width: 'minmax(120px,1fr)', render: (g) => g.productName },
    { key: 'qty', header: 'Lượng', width: '100px', numeric: true, render: (g) => `${g.quantityApplied} ${g.unit}` },
    { key: 'cost', header: 'Chi phí', width: '130px', numeric: true, render: (g) => fmtVnd(g.totalCostVnd) },
    { key: 'phi', header: 'Thu hoạch từ', width: '110px', numeric: true, render: (g) => (g.preHarvestIntervalDays ? fmtDate(g.safeHarvestUnlockDate) : '—') },
  ];

  return (
    <ModulePanel title="Việc, vật tư & thời gian cách ly" description="Thuốc BVTV đi qua khóa PHI xác định trước khi được ghi.">
      {phi.filter((p) => p.harvestLockedUntil || p.conflictsWithExpectedHarvest).map((p) => (
        <div key={p.blockId} role="alert" className="flex shrink-0 items-center gap-2 rounded-md border border-telemetry-critical-border bg-telemetry-critical-bg px-3 py-2 text-telemetry-critical">
          <TriangleAlert className="h-4 w-4" />Lô {p.blockName}: cách ly đến <span className="telemetry font-bold">{fmtDate(p.harvestLockedUntil)}</span>
          {p.conflictsWithExpectedHarvest && <> — VƯỢT ngày thu hoạch dự kiến <span className="telemetry font-bold">{fmtDate(p.expectedHarvestDate)}</span></>}
        </div>
      ))}

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-4">
        <section className="flex min-h-0 flex-col gap-2">
          <h2 className="text-sm font-semibold">Lệnh giao việc</h2>
          <form className="flex shrink-0 flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); try {
            await window.desktopApi.createWorkOrder({ blockId: o.blockId, orderType: o.orderType, title: o.title, scheduledDate: toMs(o.date)!, instructions: {} });
            setO({ ...o, title: '' }); await refresh('workOrders');
          } catch (x) { setErr(ipcError(x)); } }}>
            <Field label="Lô"><NativeSelect required value={o.blockId} onChange={(e) => setO({ ...o, blockId: e.target.value })}>{blockOptions}</NativeSelect></Field>
            <Field label="Loại"><NativeSelect value={o.orderType} onChange={(e) => setO({ ...o, orderType: e.target.value as any })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</NativeSelect></Field>
            <Field label="Tiêu đề" className="flex-1"><Input required value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} /></Field>
            <Field label="Ngày"><Input type="date" value={o.date} onChange={(e) => setO({ ...o, date: e.target.value })} /></Field>
            <Button><ClipboardPlus />Tạo lệnh</Button>
          </form>
          <DataTable label="Lệnh giao việc" columns={orderCols} rows={orders} rowKey={(w) => w.id} className="min-h-0 flex-1" empty="Chưa có lệnh." />
        </section>

        <section className="flex min-h-0 flex-col gap-2">
          <h2 className="text-sm font-semibold">Nhật ký vật tư & PHI</h2>
          <form className="flex shrink-0 flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); try {
            await window.desktopApi.addLog({ blockId: l.blockId, actionCategory: l.actionCategory, productName: l.productName, activeIngredient: l.activeIngredient || null, quantityApplied: l.quantityApplied, unit: l.unit, totalCostVnd: l.totalCostVnd, preHarvestIntervalDays: l.phiDays, executedAt: toMs(l.date)! });
            await refresh('logs', 'phi', 'costs');
          } catch (x) { setErr(ipcError(x)); } }}>
            <Field label="Lô"><NativeSelect required value={l.blockId} onChange={(e) => setL({ ...l, blockId: e.target.value })}>{blockOptions}</NativeSelect></Field>
            <Field label="Loại"><NativeSelect value={l.actionCategory} onChange={(e) => setL({ ...l, actionCategory: e.target.value as any })}>{CATS.map((t) => <option key={t}>{t}</option>)}</NativeSelect></Field>
            <Field label="Sản phẩm"><Input required value={l.productName} onChange={(e) => setL({ ...l, productName: e.target.value })} className="w-36" /></Field>
            <Field label="Hoạt chất"><Input value={l.activeIngredient} onChange={(e) => setL({ ...l, activeIngredient: e.target.value })} className="w-28" /></Field>
            <Field label="Lượng"><Input type="number" step="any" min="0" value={l.quantityApplied} onChange={(e) => setL({ ...l, quantityApplied: +e.target.value })} className="w-20" /></Field>
            <Field label="Đơn vị"><NativeSelect value={l.unit} onChange={(e) => setL({ ...l, unit: e.target.value as any })}>{UNITS.map((t) => <option key={t}>{t}</option>)}</NativeSelect></Field>
            <Field label="Chi phí (VND)"><Input type="number" min="0" value={l.totalCostVnd} onChange={(e) => setL({ ...l, totalCostVnd: +e.target.value })} className="w-28" /></Field>
            <Field label="PHI (ngày)"><Input type="number" min="0" value={l.phiDays} onChange={(e) => setL({ ...l, phiDays: +e.target.value })} className="w-20" /></Field>
            <Field label="Ngày"><Input type="date" value={l.date} onChange={(e) => setL({ ...l, date: e.target.value })} /></Field>
            <Button><NotebookPen />Ghi nhật ký</Button>
          </form>
          {err && <div role="alert" className="shrink-0 rounded-md border border-telemetry-critical-border bg-telemetry-critical-bg px-3 py-2 text-telemetry-critical">{err}</div>}
          <DataTable label="Nhật ký vật tư" columns={logCols} rows={logs} rowKey={(g) => g.id} className="min-h-0 flex-1" empty="Chưa có nhật ký." />
          <div className="telemetry flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {costs.map((c) => <span key={c.blockId}>{c.blockName}: <b className="text-foreground">{fmtVnd(c.totalCostVnd)}</b></span>)}
          </div>
        </section>
      </div>
    </ModulePanel>
  );
}
