import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Div = HTMLAttributes<HTMLDivElement>;

export const Card = ({ className, ...p }: Div) => <div className={cn('rounded-md border border-border bg-card text-card-foreground', className)} {...p} />;
export const CardHeader = ({ className, ...p }: Div) => <div className={cn('flex items-center justify-between gap-2 border-b border-border px-3 py-2', className)} {...p} />;
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-[13px] font-semibold tracking-tight', className)} {...p} />;
export const CardContent = ({ className, ...p }: Div) => <div className={cn('p-3', className)} {...p} />;
