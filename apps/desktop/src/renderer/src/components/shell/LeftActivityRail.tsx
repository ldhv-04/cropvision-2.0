import { Cpu, Droplets, Map as MapIcon, ScanSearch, ShieldAlert, type LucideIcon } from 'lucide-react';
import { MODULES } from '../../lib/shortcuts';
import { useUi } from '../../store/ui';
import { cn } from '../../lib/utils';
import { Button, Kbd } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

const ICONS: Record<(typeof MODULES)[number]['icon'], LucideIcon> = { Map: MapIcon, ScanSearch, Droplets, ShieldAlert, Cpu };

export function LeftActivityRail() {
  const { module, setModule } = useUi();
  const item = (m: (typeof MODULES)[number], i: number) => {
    const Icon = ICONS[m.icon];
    const on = m.id === module;
    return (
      <Tooltip key={m.id}>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={m.label} aria-current={on ? 'page' : undefined} onClick={() => setModule(m.id)}
            className={cn('relative', on && 'bg-accent text-foreground before:absolute before:-left-2 before:h-5 before:w-0.5 before:rounded-full before:bg-primary')}>
            <Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{m.label}<span className="text-muted-foreground">{m.hint}</span><Kbd>{`Alt ${i + 1}`}</Kbd></TooltipContent>
      </Tooltip>
    );
  };
  return (
    <nav data-testid="rail" aria-label="Phân hệ" className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-border bg-card py-3">
      <div className="flex flex-col items-center gap-1">{MODULES.slice(0, 4).map(item)}</div>
      <div className="flex flex-col items-center gap-1">{MODULES.slice(4).map((m) => item(m, 4))}</div>
    </nav>
  );
}
