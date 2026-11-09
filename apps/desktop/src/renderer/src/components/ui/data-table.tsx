import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  /** CSS grid track, e.g. '120px' or '1fr'. */
  width: string;
  /** Numbers: right-aligned JetBrains Mono tabular figures. */
  numeric?: boolean;
  render(row: T): ReactNode;
}

const ROW = 40;

/** Fixed 40px rows, sticky header, virtualized: only visible rows are in the DOM whatever the row count. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, empty, className, label }: {
  columns: Column<T>[]; rows: readonly T[]; rowKey(row: T): string; label: string;
  onRowClick?(row: T): void; selectedKey?: string | null; empty?: ReactNode; className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 8 });
  const grid = { gridTemplateColumns: columns.map((c) => c.width).join(' ') };
  const cell = (c: Column<T>) => cn('flex min-w-0 items-center truncate px-3', c.numeric && 'telemetry justify-end');

  return (
    <div role="table" aria-label={label} aria-rowcount={rows.length} className={cn('flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card', className)}>
      <div role="row" className="grid h-9 shrink-0 border-b border-border bg-muted text-[11px] font-medium uppercase tracking-wide text-muted-foreground" style={grid}>
        {columns.map((c) => <div key={c.key} role="columnheader" className={cell(c)}>{c.header}</div>)}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <div className="px-3 py-6 text-center text-muted-foreground">{empty ?? 'Chưa có dữ liệu'}</div>}
        <div className="relative w-full" style={{ height: v.getTotalSize() }}>
          {v.getVirtualItems().map((item) => {
            const row = rows[item.index]!;
            const k = rowKey(row);
            return (
              <div key={k} role="row" aria-rowindex={item.index + 1} aria-selected={selectedKey === k || undefined}
                onClick={onRowClick && (() => onRowClick(row))}
                className={cn('absolute left-0 top-0 grid w-full border-b border-border/60', onRowClick && 'cursor-pointer hover:bg-accent/60', selectedKey === k && 'bg-accent')}
                style={{ ...grid, height: ROW, transform: `translateY(${item.start}px)` }}>
                {columns.map((c) => <div key={c.key} role="cell" className={cell(c)}>{c.render(row)}</div>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
