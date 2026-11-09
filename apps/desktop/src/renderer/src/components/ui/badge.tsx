import type { HTMLAttributes } from 'react';
import type { TelemetryTone } from '@cropvision/theme-tokens';
import { cn } from '../../lib/utils';

const TONE: Record<TelemetryTone, { box: string; dot: string }> = {
  healthy: { box: 'border-telemetry-healthy-border bg-telemetry-healthy-bg text-telemetry-healthy', dot: 'bg-telemetry-healthy' },
  warning: { box: 'border-telemetry-warning-border bg-telemetry-warning-bg text-telemetry-warning', dot: 'bg-telemetry-warning' },
  critical: { box: 'border-telemetry-critical-border bg-telemetry-critical-bg text-telemetry-critical', dot: 'bg-telemetry-critical' },
  hydraulic: { box: 'border-telemetry-hydraulic-border bg-telemetry-hydraulic-bg text-telemetry-hydraulic', dot: 'bg-telemetry-hydraulic' },
};

/** Status pill. Colour only with a telemetry `tone` (alert data); without one it stays neutral. */
export function Badge({ tone, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: TelemetryTone }) {
  return (
    <span className={cn('inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium', tone ? TONE[tone].box : 'border-border bg-secondary text-secondary-foreground', className)} {...props}>
      {tone && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', TONE[tone].dot)} />}
      {children}
    </span>
  );
}
