import { MODULES } from '../../lib/shortcuts';
import { useBlocks, useSessions } from '../../store/queries';
import { useUi } from '../../store/ui';
import { fmtDate, fmtPct } from '../severity';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';

/** Ctrl+K: jump to any block, scouting session or module. */
export function CommandMenu() {
  const { commandOpen, setCommandOpen, setModule, selectBlock, selectSession } = useUi();
  const blocks = useBlocks().data ?? [];
  const sessions = useSessions().data ?? [];
  const run = (fn: () => void) => () => { fn(); setCommandOpen(false); };
  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="Tìm nhanh">
      <CommandInput placeholder="Tìm lô, phiên khảo sát, phân hệ…" />
      <CommandList>
        <CommandEmpty>Không tìm thấy</CommandEmpty>
        <CommandGroup heading="Lô">
          {blocks.map((b) => (
            <CommandItem key={b.id} value={`lô ${b.name} ${b.id}`} onSelect={run(() => { selectBlock(b.id); setModule('gis'); })}>
              {b.name}<span className="telemetry ml-auto text-xs text-muted-foreground">{b.areaHectares.toFixed(2)} ha</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Phiên khảo sát">
          {sessions.slice(0, 50).map((s) => (
            <CommandItem key={s.id} value={`phiên ${s.blockName} ${fmtDate(s.startedAt)} ${s.id}`} onSelect={run(() => { selectSession(s.id, s.blockId); setModule('scouting'); })}>
              {s.blockName} · {fmtDate(s.startedAt)}<span className="telemetry ml-auto text-xs text-muted-foreground">BSI {fmtPct(s.blockSeverityIndexPct)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Phân hệ">
          {MODULES.map((m, i) => (
            <CommandItem key={m.id} value={`phân hệ ${m.label} ${m.hint}`} onSelect={run(() => setModule(m.id))}>
              {m.label}<span className="ml-auto text-xs text-muted-foreground">Alt {i + 1}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
