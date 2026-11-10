import type { ReactNode } from 'react';

/** Centre workspace frame for non-map modules: fixed header, content fills the rest (no page scroll). */
export function ModulePanel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex shrink-0 items-end justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
