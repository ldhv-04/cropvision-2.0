import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[13px] font-medium transition-[background-color,transform] duration-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/75',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/60',
        outline: 'border-border bg-transparent text-foreground hover:bg-accent active:bg-accent/70',
        ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/70',
        destructive: 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/75',
      },
      size: { default: 'h-8 px-3', sm: 'h-7 px-2 text-xs', lg: 'h-9 px-4', icon: 'h-10 w-10 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Kbd({ children, className }: { children: string; className?: string }) {
  return <kbd className={cn('rounded-sm border border-border px-1 font-mono text-[11px] font-normal leading-4 text-muted-foreground', className)}>{children}</kbd>;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Keyboard shortcut shown inside the button, e.g. "Ctrl K". */
  kbd?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, kbd, children, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {asChild ? children : <>{children}{kbd && <Kbd className="ml-1">{kbd}</Kbd>}</>}
    </Comp>
  );
});
Button.displayName = 'Button';
