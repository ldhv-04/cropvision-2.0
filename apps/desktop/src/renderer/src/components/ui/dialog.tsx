import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

// Flat dim overlay: no blur over the WebGL map (Impeccable law 1, FPS).
export const DialogContent = forwardRef<ElementRef<typeof D.Content>, ComponentPropsWithoutRef<typeof D.Content>>(({ className, children, ...p }, ref) => (
  <D.Portal>
    <D.Overlay className="fixed inset-0 z-50 bg-black/60" />
    <D.Content ref={ref} className={cn('fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-3 overflow-auto rounded-md border border-border bg-popover p-4 text-popover-foreground focus-visible:outline-none', className)} {...p}>
      {children}
      <D.Close className="absolute right-3 top-3 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label="Đóng">
        <X className="h-4 w-4" />
      </D.Close>
    </D.Content>
  </D.Portal>
));
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1 pr-6', className)} {...p} />;
export const DialogTitle = forwardRef<ElementRef<typeof D.Title>, ComponentPropsWithoutRef<typeof D.Title>>(({ className, ...p }, ref) => (
  <D.Title ref={ref} className={cn('text-sm font-semibold', className)} {...p} />
));
DialogTitle.displayName = 'DialogTitle';
export const DialogDescription = forwardRef<ElementRef<typeof D.Description>, ComponentPropsWithoutRef<typeof D.Description>>(({ className, ...p }, ref) => (
  <D.Description ref={ref} className={cn('text-xs text-muted-foreground', className)} {...p} />
));
DialogDescription.displayName = 'DialogDescription';
