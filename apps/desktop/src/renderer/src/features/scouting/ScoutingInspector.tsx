import { useSamples, useSessions } from '../../store/queries';
import { useUi } from '../../store/ui';
import { fmtDate, severityColor } from '../../components/severity';

export function ScoutingInspector() {
  const sessions = useSessions().data ?? [];
  const { selectedSessionId, selectSession, setTab, selectBlock } = useUi();
  const samples = useSamples(selectedSessionId).data ?? [];
  const sel = sessions.find((s) => s.id === selectedSessionId);
  return (
    <div className="panel">
      <h2>Phiên khảo sát</h2>
      {sessions.length === 0 && <p>Chưa có phiên nào. Kết nối điện thoại cùng Wi-Fi để đồng bộ.</p>}
      <table>
        <thead><tr><th>Lô</th><th>Bắt đầu</th><th>Mẫu</th><th>DI %</th><th>BSI %</th><th>Khuyến nghị</th></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className={s.id === selectedSessionId ? 'sel' : ''} onClick={() => selectSession(s.id)} style={{ cursor: 'pointer' }}>
              <td>{s.blockName}</td><td>{fmtDate(s.startedAt)}</td><td>{s.totalSamples}</td>
              <td>{s.diseaseIncidencePct.toFixed(1)}</td>
              <td><span className="tag" style={{ background: severityColor(s.blockSeverityIndexPct) }}>{s.blockSeverityIndexPct.toFixed(1)}</span></td>
              <td>{s.recommendationCode ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sel && (
        <>
          <h3>{sel.blockName} — {samples.length} mẫu lá <button className="act" onClick={() => { selectBlock(sel.blockId); setTab('map'); }}>Xem trên bản đồ</button></h3>
          {sel.recommendationSummary && <p>{sel.recommendationSummary}</p>}
          <div className="thumbs">
            {samples.map((s) => (
              <figure key={s.id}>
                {s.mediaUrl ? <img src={s.mediaUrl} alt={`mẫu ${s.id}`} /> : <div style={{ width: 120, height: 120, background: '#eee', display: 'grid', placeItems: 'center' }}>đang tải ảnh…</div>}
                <figcaption><span className="tag" style={{ background: severityColor(s.dsIndexPct) }}>DS {s.dsIndexPct.toFixed(1)}%</span> {s.canopyLayer}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
