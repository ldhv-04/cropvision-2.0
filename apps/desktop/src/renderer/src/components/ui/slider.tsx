import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as S from '@radix-ui/react-slider';
import { cn } from '../../lib/utils';

export const Slider = forwardRef<ElementRef<typeof S.Root>, ComponentPropsWithoutRef<typeof S.Root>>(({ className, ...p }, ref) => (
  <S.Root ref={ref} className={cn('relative flex h-5 w-full touch-none select-none items-center', className)} {...p}>
    <S.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-secondary">
      <S.Range className="absolute h-full bg-primary" />
    </S.Track>
    {(p.value ?? p.defaultValue ?? [0]).map((_, i) => (
      <S.Thumb key={i} className="block h-3.5 w-3.5 rounded-full border border-primary bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" />
    ))}
  </S.Root>
));
Slider.displayName = 'Slider';
