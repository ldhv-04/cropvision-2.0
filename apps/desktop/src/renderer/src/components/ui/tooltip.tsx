import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as T from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

export const TooltipProvider = T.Provider;
export const Tooltip = T.Root;
export const TooltipTrigger = T.Trigger;

export const TooltipContent = forwardRef<ElementRef<typeof T.Content>, ComponentPropsWithoutRef<typeof T.Content>>(({ className, sideOffset = 6, ...p }, ref) => (
  <T.Portal>
    <T.Content ref={ref} sideOffset={sideOffset} className={cn('z-50 flex items-center gap-2 rounded-sm border border-border bg-popover px-2 py-1 text-xs text-popover-foreground', className)} {...p} />
  </T.Portal>
));
TooltipContent.displayName = 'TooltipContent';
