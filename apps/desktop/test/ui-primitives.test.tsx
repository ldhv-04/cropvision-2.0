import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { Button, buttonVariants } from '../src/renderer/src/components/ui/button';
import { Badge } from '../src/renderer/src/components/ui/badge';
import { Card } from '../src/renderer/src/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/renderer/src/components/ui/tabs';
import { cn } from '../src/renderer/src/lib/utils';

const uiDir = new URL('../src/renderer/src/components/ui/', import.meta.url);

describe('shadcn primitives, Impeccable variant (AC-D2)', () => {
  it('ships every primitive the plan lists', () => {
    const files = readdirSync(uiDir).sort();
    for (const f of ['badge', 'button', 'card', 'command', 'dialog', 'scroll-area', 'select', 'slider', 'tabs', 'tooltip']) expect(files).toContain(`${f}.tsx`);
  });

  it('never uses large shadows, backdrop blur or gradients', () => {
    for (const f of readdirSync(uiDir)) {
      expect(readFileSync(new URL(f, uiDir), 'utf8'), f).not.toMatch(/shadow-(md|lg|xl|2xl)|backdrop-blur|bg-gradient/);
    }
  });

  it('buttons are 32px by default and press down 1px within 50ms', () => {
    const c = buttonVariants();
    expect(c).toContain('h-8');
    expect(c).toContain('text-[13px]');
    expect(c).toContain('active:translate-y-px');
    expect(c).toContain('duration-50');
    expect(buttonVariants({ size: 'lg' })).toContain('h-9');
  });

  it('shows a keyboard shortcut hint when given', () => {
    const html = renderToString(<Button kbd="Ctrl K">Tìm nhanh</Button>);
    expect(html).toMatch(/<kbd[^>]*>Ctrl K<\/kbd>/);
  });

  it('status badges are 22px with a 6px dot and tone colours', () => {
    const html = renderToString(<Badge tone="critical">BSI 18.2%</Badge>);
    expect(html).toContain('h-[22px]');
    expect(html).toContain('bg-telemetry-critical-bg');
    expect(html).toContain('border-telemetry-critical-border');
    expect(html).toMatch(/h-1\.5 w-1\.5[^"]*bg-telemetry-critical/);
  });

  it('neutral badges stay neutral (chromatic restraint)', () => {
    const html = renderToString(<Badge>LOW</Badge>);
    expect(html).not.toContain('telemetry');
    expect(html).toContain('border-border');
  });

  it('cards separate by surface and 1px border, no shadow', () => {
    const html = renderToString(<Card>x</Card>);
    expect(html).toMatch(/class="[^"]*\bborder\b[^"]*bg-card/);
    expect(html).toContain('rounded-md');
    expect(html).not.toContain('shadow');
  });

  it('tabs render an accessible tablist', () => {
    const html = renderToString(<Tabs defaultValue="a"><TabsList><TabsTrigger value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger></TabsList></Tabs>);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
  });

  it('inactive tab panels stay hidden even when the panel has a display class (flex)', () => {
    const html = renderToString(<Tabs defaultValue="a"><TabsContent value="a">A</TabsContent><TabsContent value="b" className="flex flex-col">B</TabsContent></Tabs>);
    expect(html).toMatch(/data-state="inactive"[^>]*class="[^"]*data-\[state=inactive\]:hidden/);
  });

  it('cn merges conflicting tailwind classes, last wins', () => {
    expect(cn('h-8 px-2', 'h-9')).toBe('px-2 h-9');
  });
});
