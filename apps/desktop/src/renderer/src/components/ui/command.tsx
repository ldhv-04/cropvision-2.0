import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { Command as C } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

export const Command = forwardRef<ElementRef<typeof C>, ComponentPropsWithoutRef<typeof C>>(({ className, ...p }, ref) => (
  <C ref={ref} className={cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground', className)} {...p} />
));
Command.displayName = 'Command';

export function CommandDialog({ open, onOpenChange, children, title }: { open: boolean; onOpenChange(o: boolean): void; children: ReactNode; title: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

export const CommandInput = forwardRef<ElementRef<typeof C.Input>, ComponentPropsWithoutRef<typeof C.Input>>(({ className, ...p }, ref) => (
  <div className="flex items-center gap-2 border-b border-border px-3">
    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
    <C.Input ref={ref} className={cn('h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground', className)} {...p} />
  </div>
));
CommandInput.displayName = 'CommandInput';

export const CommandList = forwardRef<ElementRef<typeof C.List>, ComponentPropsWithoutRef<typeof C.List>>(({ className, ...p }, ref) => (
  <C.List ref={ref} className={cn('max-h-80 overflow-y-auto overflow-x-hidden p-1', className)} {...p} />
));
CommandList.displayName = 'CommandList';

export const CommandEmpty = (p: ComponentPropsWithoutRef<typeof C.Empty>) => <C.Empty className="py-6 text-center text-[13px] text-muted-foreground" {...p} />;

export const CommandGroup = forwardRef<ElementRef<typeof C.Group>, ComponentPropsWithoutRef<typeof C.Group>>(({ className, ...p }, ref) => (
  <C.Group ref={ref} className={cn('[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground', className)} {...p} />
));
CommandGroup.displayName = 'CommandGroup';

export const CommandItem = forwardRef<ElementRef<typeof C.Item>, ComponentPropsWithoutRef<typeof C.Item>>(({ className, ...p }, ref) => (
  <C.Item ref={ref} className={cn('flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-[13px] outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground', className)} {...p} />
));
CommandItem.displayName = 'CommandItem';
