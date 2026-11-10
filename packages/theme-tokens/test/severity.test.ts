import { describe, expect, it } from 'vitest';
import { decideCoffeeRustAction } from '@cropvision/domain';
import { severityTone, SEVERITY_BANDS } from '../src/index';

describe('severityTone (AC-D4)', () => {
  it.each([[0, 'healthy'], [4.99, 'healthy'], [5, 'warning'], [14.99, 'warning'], [15, 'critical'], [100, 'critical']] as const)(
    '%s %% -> %s', (pct, tone) => expect(severityTone(pct)).toBe(tone));

  it('treats non-finite input as critical (fail loud, never green)', () => {
    expect(severityTone(Number.NaN)).toBe('critical');
  });

  it('uses the same BSI cut-offs as the domain rule engine', () => {
    const code = (bsiPct: number) => decideCoffeeRustAction({ bsiPct, diPct: 0, treeCount: 1, samples: [] }).code;
    const expected = { healthy: 'CULTURAL_CONTROL_ONLY', warning: 'LOCALIZED_SPOT_SPRAY', critical: 'BLOCK_WIDE_INTERVENTION' } as const;
    for (const pct of [0, 4.99, 5, 14.99, 15, 60]) expect(code(pct)).toBe(expected[severityTone(pct) as keyof typeof expected]);
  });

  it('describes the three legend bands', () => {
    expect(SEVERITY_BANDS.map((b) => [b.tone, b.label, b.code])).toEqual([
      ['healthy', 'BSI < 5%', 'CULTURAL_CONTROL_ONLY'],
      ['warning', '5% ≤ BSI < 15%', 'LOCALIZED_SPOT_SPRAY'],
      ['critical', 'BSI ≥ 15%', 'BLOCK_WIDE_INTERVENTION'],
    ]);
  });
});
