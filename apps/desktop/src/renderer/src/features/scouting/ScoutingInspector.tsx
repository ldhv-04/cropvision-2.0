import { MapPinned } from 'lucide-react';
import { severityTone } from '@cropvision/theme-tokens';
import { useSessions } from '../../store/queries';
import { useUi } from '../../store/ui';
import { fmtDate } from '../../components/severity';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable, type Column } from '../../components/ui/data-table';
import { ModulePanel } from '../../components/shell/ModulePanel';

type Session = NonNullable<ReturnType<typeof useSessions>['data']>[number];

const columns: Column<Session>[] = [
  { key: 'block', header: 'Lô', width: 'minmax(120px,1fr)', render: (s) => s.blockName },
  { key: 'start', header: 'Bắt đầu', width: '110px', numeric: true, render: (s) => fmtDate(s.startedAt) },
  { key: 'n', header: 'Mẫu', width: '70px', numeric: true, render: (s) => s.totalSamples },
  { key: 'di', header: 'DI %', width: '80px', numeric: true, render: (s) => s.diseaseIncidencePct.toFixed(1) },
  { key: 'bsi', header: 'BSI %', width: '100px', numeric: true, render: (s) => <Badge tone={severityTone(s.blockSeverityIndexPct)} className="telemetry">{s.blockSeverityIndexPct.toFixed(1)}</Badge> },
  { key: 'rec', header: 'Khuyến nghị', width: '220px', render: (s) => <span className="telemetry text-xs text-muted-foreground">{s.recommendationCode ?? '—'}</span> },
];

export function ScoutingInspector() {
  const sessions = useSessions().data ?? [];
  const { selectedSessionId, selectSession, setModule } = useUi();
  const sel = sessions.find((s) => s.id === selectedSessionId);
  return (
    <ModulePanel title="Phiên khảo sát" description="Đồng bộ từ điện thoại qua Wi-Fi. Chọn một phiên để xem mẫu lá ở bảng bên phải."
      actions={sel && <Button variant="outline" onClick={() => setModule('gis')}><MapPinned />Xem {sel.blockName} trên bản đồ</Button>}>
      <DataTable label="Phiên khảo sát" columns={columns} rows={sessions} rowKey={(s) => s.id} selectedKey={selectedSessionId}
        onRowClick={(s) => selectSession(s.id, s.blockId)} className="min-h-0 flex-1"
        empty="Chưa có phiên nào. Kết nối điện thoại cùng Wi-Fi để đồng bộ." />
    </ModulePanel>
  );
}
