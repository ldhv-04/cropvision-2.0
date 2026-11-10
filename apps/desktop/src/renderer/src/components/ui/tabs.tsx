import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as T from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

export const Tabs = T.Root;

export const TabsList = forwardRef<ElementRef<typeof T.List>, ComponentPropsWithoutRef<typeof T.List>>(({ className, ...p }, ref) => (
  <T.List ref={ref} className={cn('flex h-9 w-full shrink-0 items-end gap-0.5 border-b border-border px-2', className)} {...p} />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<ElementRef<typeof T.Trigger>, ComponentPropsWithoutRef<typeof T.Trigger>>(({ className, ...p }, ref) => (
  <T.Trigger ref={ref} className={cn('-mb-px h-8 whitespace-nowrap border-b-2 border-transparent px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:text-foreground', className)} {...p} />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<ElementRef<typeof T.Content>, ComponentPropsWithoutRef<typeof T.Content>>(({ className, ...p }, ref) => (
  // Radix keeps inactive panels mounted with `hidden`; a display class (flex) would override it, so hide by state too.
  <T.Content ref={ref} className={cn('min-h-0 flex-1 focus-visible:outline-none', className, 'data-[state=inactive]:hidden')} {...p} />
));
TabsContent.displayName = 'TabsContent';
