import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const control = 'h-8 rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...p }, ref) => (
  <input ref={ref} type={type} className={cn(control, type === 'number' && 'telemetry text-right', className)} {...p} />
));
Input.displayName = 'Input';

/** Native select: keyboard- and automation-friendly for dense forms (Radix Select is used for menus). */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(control, 'pr-7', className)} {...p} />
));
NativeSelect.displayName = 'NativeSelect';

/** Label wraps its control, so `getByLabel` and screen readers find it without ids. */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}
