import { Check, Map as MapIcon } from 'lucide-react';
import { auditContrast, SHADCN_TOKENS, TELEMETRY_TONES, type Palette } from '@cropvision/theme-tokens';
import { useTheme } from '@cropvision/theme-tokens/react';
import { ModulePanel } from '../../components/shell/ModulePanel';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

const SWATCHES = SHADCN_TOKENS.filter((t) => ['background', 'card', 'primary', 'muted', 'border', 'destructive'].includes(t));

/** Swatches use the palette's own values (inline), so every template is previewed regardless of the active one. */
function PaletteCard({ p, active, onUse }: { p: Palette; active: boolean; onUse(): void }) {
  const below = auditContrast(p).filter((r) => !r.pass);
  return (
    <Card className={active ? 'border-primary' : undefined}>
      <CardHeader>
        <CardTitle>{p.name}</CardTitle>
        {active ? <Badge tone="healthy">Đang dùng</Badge> : <Button size="sm" variant="outline" aria-label={`Dùng ${p.name}`} onClick={onUse}>Dùng</Button>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground">{p.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {SWATCHES.map((t) => (
            <span key={t} className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="h-4 w-4 rounded-sm border border-border" style={{ background: p.shadcn[t] }} />{t}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TELEMETRY_TONES.map((t) => (
            <span key={t} className="flex h-[22px] items-center gap-1.5 rounded-sm border px-2 text-xs" style={{ background: p.telemetry[`${t}-bg`], borderColor: p.telemetry[`${t}-border`], color: p.telemetry[`${t}-fill`] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.telemetry[`${t}-fill`] }} />{t}
            </span>
          ))}
        </div>
        <p className="telemetry text-xs text-muted-foreground">
          {below.length ? `Tương phản dưới mục tiêu: ${below.map((r) => `${r.fg}/${r.bg} ${r.ratio.toFixed(2)}:1`).join(' · ')}` : 'Đạt mọi mục tiêu tương phản'}
        </p>
      </CardContent>
    </Card>
  );
}

export function EdgeStudio() {
  const { palette, palettes, setTheme } = useTheme();
  return (
    <ModulePanel title="Thiết lập trạm" description="Mẫu màu lưu trong packages/theme-tokens/palettes; đổi tại đây không cần sửa mã giao diện.">
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3 overflow-y-auto">
        {palettes.map((p) => <PaletteCard key={p.id} p={p} active={p.id === palette.id} onUse={() => setTheme(p.id)} />)}
        <Card>
          <CardHeader><CardTitle>Bản đồ nền ngoại tuyến</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground">Tệp .pmtiles đọc trực tiếp từ đĩa qua cv-media://tiles.</p>
            <Button variant="outline" className="self-start" onClick={async () => { if (await window.desktopApi.chooseTiles()) location.reload(); }}><MapIcon />Chọn bản đồ ngoại tuyến…</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mô hình AI & cổng LoRa</CardTitle></CardHeader>
          <CardContent className="flex items-start gap-2 text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />Chưa có cấu hình trong dữ liệu trạm; không hiển thị điều khiển giả (design/ui-spec.md P6).
          </CardContent>
        </Card>
      </div>
    </ModulePanel>
  );
}
