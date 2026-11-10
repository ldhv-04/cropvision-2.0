import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as S from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Select = S.Root;
export const SelectValue = S.Value;
export const SelectGroup = S.Group;

export const SelectTrigger = forwardRef<ElementRef<typeof S.Trigger>, ComponentPropsWithoutRef<typeof S.Trigger>>(({ className, children, ...p }, ref) => (
  <S.Trigger ref={ref} className={cn('flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-[13px] focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:truncate', className)} {...p}>
    {children}
    <S.Icon asChild><ChevronDown className="h-4 w-4 shrink-0 opacity-60" /></S.Icon>
  </S.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = forwardRef<ElementRef<typeof S.Content>, ComponentPropsWithoutRef<typeof S.Content>>(({ className, children, position = 'popper', ...p }, ref) => (
  <S.Portal>
    <S.Content ref={ref} position={position} sideOffset={4} className={cn('relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground', position === 'popper' && 'w-[var(--radix-select-trigger-width)]', className)} {...p}>
      <S.Viewport className="p-1">{children}</S.Viewport>
    </S.Content>
  </S.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = forwardRef<ElementRef<typeof S.Item>, ComponentPropsWithoutRef<typeof S.Item>>(({ className, children, ...p }, ref) => (
  <S.Item ref={ref} className={cn('relative flex h-8 cursor-default select-none items-center rounded-sm pl-7 pr-2 text-[13px] outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:opacity-50', className)} {...p}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"><S.ItemIndicator><Check className="h-4 w-4" /></S.ItemIndicator></span>
    <S.ItemText>{children}</S.ItemText>
  </S.Item>
));
SelectItem.displayName = 'SelectItem';
