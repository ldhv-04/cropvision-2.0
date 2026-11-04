import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocks, useCosts, useLogs, usePhi, useWorkOrders } from '../../store/queries';
import { fmtDate, toMs } from '../../components/severity';

const TYPES = ['SCOUTING', 'IRRIGATION', 'FERTIGATION', 'SPRAYING', 'PRUNING'] as const;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const CATS = ['FERTILIZER', 'PESTICIDE', 'IRRIGATION', 'SOIL_AMENDMENT'] as const;
const UNITS = ['KG', 'LITER', 'GRAM', 'ML', 'M3'] as const;
const today = () => new Date().toISOString().slice(0, 10);

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

  return (
    <div className="panel">
      {phi.filter((p) => p.harvestLockedUntil || p.conflictsWithExpectedHarvest).map((p) => (
        <div key={p.blockId} className="warn" role="alert">
          ⚠ Lô {p.blockName}: cách ly đến {fmtDate(p.harvestLockedUntil)}
          {p.conflictsWithExpectedHarvest && ` — VƯỢT ngày thu hoạch dự kiến ${fmtDate(p.expectedHarvestDate)}`}
        </div>
      ))}

      <h2>Lệnh giao việc</h2>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); setErr(null); try {
        await window.desktopApi.createWorkOrder({ blockId: o.blockId, orderType: o.orderType, title: o.title, scheduledDate: toMs(o.date)!, instructions: {} });
        setO({ ...o, title: '' }); await refresh('workOrders');
      } catch (x) { setErr((x as Error).message); } }}>
        <label>Lô<select required value={o.blockId} onChange={(e) => setO({ ...o, blockId: e.target.value })}><option value="">—</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Loại<select value={o.orderType} onChange={(e) => setO({ ...o, orderType: e.target.value as any })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Tiêu đề<input required value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} /></label>
        <label>Ngày<input type="date" value={o.date} onChange={(e) => setO({ ...o, date: e.target.value })} /></label>
        <button className="act">Tạo lệnh</button>
      </form>
      <table>
        <thead><tr><th>Ngày</th><th>Lô</th><th>Loại</th><th>Tiêu đề</th><th>Trạng thái</th></tr></thead>
        <tbody>{orders.map((w) => (
          <tr key={w.id}><td>{fmtDate(w.scheduledDate)}</td><td>{names.get(w.blockId)}</td><td>{w.orderType}</td><td>{w.title}</td>
            <td><select value={w.status} onChange={async (e) => { await window.desktopApi.setWorkOrderStatus(w.id, e.target.value as any); await refresh('workOrders'); }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td></tr>
        ))}</tbody>
      </table>

      <h2>Nhật ký vật tư & thời gian cách ly (PHI)</h2>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); setErr(null); try {
        await window.desktopApi.addLog({ blockId: l.blockId, actionCategory: l.actionCategory, productName: l.productName, activeIngredient: l.activeIngredient || null, quantityApplied: l.quantityApplied, unit: l.unit, totalCostVnd: l.totalCostVnd, preHarvestIntervalDays: l.phiDays, executedAt: toMs(l.date)! });
        await refresh('logs', 'phi', 'costs');
      } catch (x) { setErr((x as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } }}>
        <label>Lô<select required value={l.blockId} onChange={(e) => setL({ ...l, blockId: e.target.value })}><option value="">—</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Loại<select value={l.actionCategory} onChange={(e) => setL({ ...l, actionCategory: e.target.value as any })}>{CATS.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Sản phẩm<input required value={l.productName} onChange={(e) => setL({ ...l, productName: e.target.value })} /></label>
        <label>Hoạt chất<input value={l.activeIngredient} onChange={(e) => setL({ ...l, activeIngredient: e.target.value })} /></label>
        <label>Lượng<input type="number" step="any" min="0" value={l.quantityApplied} onChange={(e) => setL({ ...l, quantityApplied: +e.target.value })} /></label>
        <label>Đơn vị<select value={l.unit} onChange={(e) => setL({ ...l, unit: e.target.value as any })}>{UNITS.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Chi phí (VND)<input type="number" min="0" value={l.totalCostVnd} onChange={(e) => setL({ ...l, totalCostVnd: +e.target.value })} /></label>
        <label>PHI (ngày)<input type="number" min="0" value={l.phiDays} onChange={(e) => setL({ ...l, phiDays: +e.target.value })} /></label>
        <label>Ngày<input type="date" value={l.date} onChange={(e) => setL({ ...l, date: e.target.value })} /></label>
        <button className="act">Ghi nhật ký</button>
      </form>
      {err && <div className="warn" role="alert">{err}</div>}
      <table>
        <thead><tr><th>Ngày</th><th>Lô</th><th>Loại</th><th>Sản phẩm</th><th>Lượng</th><th>Chi phí</th><th>Được thu hoạch từ</th></tr></thead>
        <tbody>{logs.map((g) => (
          <tr key={g.id}><td>{fmtDate(g.executedAt)}</td><td>{names.get(g.blockId)}</td><td>{g.actionCategory}</td><td>{g.productName}</td>
            <td>{g.quantityApplied} {g.unit}</td><td>{g.totalCostVnd.toLocaleString('vi-VN')}</td><td>{g.preHarvestIntervalDays ? fmtDate(g.safeHarvestUnlockDate) : '—'}</td></tr>
        ))}</tbody>
      </table>
      <h3>Chi phí vật tư theo lô</h3>
      <table><tbody>{costs.map((c) => <tr key={c.blockId}><td>{c.blockName}</td><td>{c.totalCostVnd.toLocaleString('vi-VN')} ₫</td></tr>)}</tbody></table>
    </div>
  );
}
