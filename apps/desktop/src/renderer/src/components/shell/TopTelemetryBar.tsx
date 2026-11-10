import { Search, Sprout } from 'lucide-react';
import { useHub, useSessions } from '../../store/queries';
import { useUi } from '../../store/ui';
import { Badge } from '../ui/badge';
import { Kbd } from '../ui/button';

export function TopTelemetryBar() {
  const hub = useHub().data;
  const sessions = useSessions().data ?? [];
  const openCommand = useUi((s) => s.setCommandOpen);
  const ip = hub?.addresses[0];
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight"><Sprout className="h-4 w-4 text-primary" />CropVision</span>
        <span className="h-4 w-px bg-border" aria-hidden />
        <span className="truncate text-muted-foreground" title={hub?.hubId}>{hub?.farmName ?? '…'}</span>
      </div>

      <button type="button" onClick={() => openCommand(true)}
        className="flex h-7 w-80 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-muted-foreground transition-colors duration-50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Tìm lô, phiên khảo sát…</span>
        <Kbd>Ctrl K</Kbd>
      </button>

      <div data-testid="hub-status" className="flex items-center gap-2">
        <span className="telemetry text-xs text-muted-foreground" title="Phiên khảo sát đã nhận từ điện thoại">{sessions.length} phiên</span>
        <Badge tone={hub?.mdns ? 'healthy' : 'warning'} className="telemetry">
          {hub ? `Hub LAN :${hub.port} · ${ip ?? 'không có Wi-Fi'} · mDNS ${hub.mdns ? 'bật' : 'tắt'}` : '…'}
        </Badge>
      </div>
    </header>
  );
}
