import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocks, useLeases } from '../../store/queries';

type Plan = Awaited<ReturnType<typeof window.desktopApi.planFertigation>>;

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
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await qc.invalidateQueries({ queryKey: ['leases'] }); } catch (e) { setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } };
  const names = new Map(blocks.map((b) => [b.id, b.name]));

  return (
    <div className="panel">
      <h2>Tưới & châm phân Venturi (lease có thời hạn)</h2>
      <p>Mọi lệnh mở van là một <b>lease</b> giới hạn thời gian, thể tích và áp suất — không có lệnh "bật van" vô thời hạn.</p>
      <div className="row">
        <label>Lô<select value={blockId} onChange={(e) => { setBlockId(e.target.value); setPlan(null); }}><option value="">—</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </div>

      <h3>Tưới nhỏ giọt</h3>
      <div className="row">
        <label>Tối đa (giây)<input type="number" min="1" value={drip.maxDurationSec} onChange={(e) => setDrip({ ...drip, maxDurationSec: +e.target.value })} /></label>
        <label>Tối đa (lít)<input type="number" min="1" value={drip.maxVolumeLiters} onChange={(e) => setDrip({ ...drip, maxVolumeLiters: +e.target.value })} /></label>
        <button className="act" disabled={!block} onClick={() => run(() => window.desktopApi.issueLease({ blockId, mode: 'DRIP_IRRIGATION', ...drip }))}>Cấp lease tưới</button>
      </div>

      <h3>Châm phân Venturi (2,5 bar, 3 pha)</h3>
      <div className="row">
        <label>Nước/cây (L)<input type="number" min="0.1" step="any" value={f.waterPerTreeLiters} onChange={(e) => setF({ ...f, waterPerTreeLiters: +e.target.value })} /></label>
        <label>Phân/cây (g)<input type="number" min="0" step="any" value={f.fertilizerGramsPerTree} onChange={(e) => setF({ ...f, fertilizerGramsPerTree: +e.target.value })} /></label>
        <label>Lưu lượng bộ châm (L/h)<input type="number" min="1" value={f.injectorRateLph} onChange={(e) => setF({ ...f, injectorRateLph: +e.target.value })} /></label>
        <button className="act" disabled={!block} onClick={() => run(async () => setPlan(await window.desktopApi.planFertigation({ treeCount: block!.treeCount, dripFlowLph: block!.nominalDripFlowLph, ...f })))}>Tính kế hoạch</button>
      </div>
      {plan && block && (
        <div>
          <p>Nước tổng: <b>{plan.totalWaterLiters.toFixed(0)} L</b> · Phân hòa tan: <b>{plan.totalFertilizerKg.toFixed(2)} kg</b> · Dung dịch hút qua Venturi: <b>{plan.injectedSolutionLiters.toFixed(1)} L</b></p>
          <table><thead><tr><th>Pha</th><th>Thời gian</th><th>Áp suất</th></tr></thead>
            <tbody>{plan.phases.map((p) => <tr key={p.phase}><td>{p.phase}</td><td>{p.durationSec} s</td><td>{p.minPressureBar}–{p.maxPressureBar} bar (đích {p.targetPressureBar})</td></tr>)}</tbody></table>
          <button className="act" onClick={() => run(() => window.desktopApi.issueLease({ blockId, ...plan.lease }))}>Cấp lease châm phân ({plan.lease.maxDurationSec} s)</button>
        </div>
      )}
      {err && <div className="warn" role="alert">{err}</div>}

      <h3>Lease gần đây</h3>
      <table>
        <thead><tr><th>Lô</th><th>Chế độ</th><th>Trạng thái</th><th>Thể tích</th><th>Áp suất TB</th><th></th></tr></thead>
        <tbody>{leases.map((l) => (
          <tr key={l.id}><td>{names.get(l.blockId)}</td><td>{l.mode}</td>
            <td className={l.status === 'ACTIVE' ? 'ok' : l.status.startsWith('ABORTED') ? 'err' : ''}>{l.status}</td>
            <td>{l.actualVolumeLiters.toFixed(1)} / {l.maxVolumeLiters.toFixed(0)} L</td><td>{l.averagePressureBar?.toFixed(2) ?? '—'}</td>
            <td>{l.status === 'ACTIVE' && <button className="act" onClick={() => run(() => window.desktopApi.abortLease(l.id))}>Dừng</button>}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}
