import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ImageOff } from 'lucide-react';
import { severityTone } from '@cropvision/theme-tokens';
import { useCheckpoints, useSamples } from '../../store/queries';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { fmtDate } from '../../components/severity';

type Sample = NonNullable<ReturnType<typeof useSamples>['data']>[number];
const ROW = 64;
const DS_TEXT = { healthy: 'text-telemetry-healthy', warning: 'text-telemetry-warning', critical: 'text-telemetry-critical' } as const;

/** Memory-safe leaf sample list: virtualized 64px rows with 160px thumbnails; the original loads only in the dialog. */
export function SampleList({ sessionId, blockId }: { sessionId: string | null; blockId: string | null }) {
  const samples = useSamples(sessionId).data ?? [];
  const checkpoints = useCheckpoints(blockId).data ?? [];
  const seq = useMemo(() => new Map(checkpoints.map((c) => [c.id, c.sequenceOrder])), [checkpoints]);
  const [open, setOpen] = useState<Sample | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: samples.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 6 });

  if (!sessionId) return <p className="p-4 text-muted-foreground">Chọn một lô đã khảo sát hoặc một phiên khảo sát.</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 text-xs text-muted-foreground">
        <span className="telemetry">{samples.length} mẫu lá</span><span>DS % · độ trễ suy luận</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative" style={{ height: v.getTotalSize() }}>
          {v.getVirtualItems().map((item) => {
            const s = samples[item.index]!;
            const n = s.checkpointId ? seq.get(s.checkpointId) : undefined;
            return (
              <button key={s.id} type="button" data-testid="sample-row" onClick={() => setOpen(s)}
                className="absolute left-0 top-0 flex w-full items-center gap-3 border-b border-border/60 px-3 text-left transition-colors duration-50 hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
                style={{ height: ROW, transform: `translateY(${item.start}px)` }}>
                {s.thumbUrl
                  ? <img src={s.thumbUrl} alt={`mẫu ${s.id}`} width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-sm border border-border object-cover" />
                  : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground" title="Ảnh chưa đồng bộ"><ImageOff className="h-4 w-4" /></span>}
                <span className="telemetry w-8 text-muted-foreground">#{n != null ? String(n).padStart(2, '0') : '—'}</span>
                <Badge>{s.canopyLayer}</Badge>
                <span className={`telemetry ml-auto text-sm font-bold ${DS_TEXT[severityTone(s.dsIndexPct)]}`}>{s.dsIndexPct.toFixed(1)}%</span>
                <span className="telemetry w-14 text-right text-xs text-muted-foreground">{s.inferenceLatencyMs.toFixed(0)} ms</span>
              </button>
            );
          })}
        </div>
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Mẫu lá · tầng {open.canopyLayer} · DS {open.dsIndexPct.toFixed(1)}%</DialogTitle>
              <DialogDescription className="telemetry">{fmtDate(open.capturedAt)} · {open.engineVersion} · {open.inferenceLatencyMs.toFixed(0)} ms · IMU {open.imuStabilityScore.toFixed(2)} m/s² · {open.latitude.toFixed(6)}, {open.longitude.toFixed(6)}</DialogDescription>
            </DialogHeader>
            {open.mediaUrl
              ? <img src={open.mediaUrl} alt={`ảnh gốc ${open.id}`} className="aspect-square w-full rounded-sm border border-border object-contain" />
              : <p className="text-muted-foreground">Ảnh gốc chưa đồng bộ về trạm.</p>}
            <p className="text-xs text-muted-foreground">So sánh với mặt nạ tổn thương chưa khả dụng: điện thoại chưa lưu mặt nạ phân đoạn (design/ui-spec.md P6).</p>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
