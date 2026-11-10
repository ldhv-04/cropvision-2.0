import { describe, expect, it } from 'vitest';
import { MODULES, resolveShortcut } from '../src/renderer/src/lib/shortcuts';
import { blockOverview } from '../src/renderer/src/lib/overview';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const key = (k: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

describe('activity rail modules and shortcuts (AC-S1)', () => {
  it('has the 5 plan modules in order with Lucide icon names', () => {
    expect(MODULES.map((m) => [m.id, m.icon])).toEqual([
      ['gis', 'Map'], ['scouting', 'ScanSearch'], ['hydraulic', 'Droplets'], ['ledger', 'ShieldAlert'], ['studio', 'Cpu'],
    ]);
  });

  it('maps Alt+1..Alt+5 to the modules', () => {
    MODULES.forEach((m, i) => expect(resolveShortcut(key(String(i + 1), { altKey: true }))).toEqual({ type: 'module', id: m.id }));
  });

  it('opens the command dialog on Ctrl+K and Cmd+K', () => {
    expect(resolveShortcut(key('k', { ctrlKey: true }))).toEqual({ type: 'command' });
    expect(resolveShortcut(key('K', { metaKey: true }))).toEqual({ type: 'command' });
  });

  it('ignores plain digits, Alt+6 and Ctrl+Alt combos (typing in forms stays safe)', () => {
    expect(resolveShortcut(key('1'))).toBeNull();
    expect(resolveShortcut(key('6', { altKey: true }))).toBeNull();
    expect(resolveShortcut(key('1', { altKey: true, ctrlKey: true }))).toBeNull();
  });
});

describe('blockOverview (AC-S4)', () => {
  const block = { id: 'b1', name: 'Lô A', treeCount: 1000, expectedHarvestDate: NOW + 30 * DAY };
  const session = (id: string, startedAt: number, bsi: number, di: number) =>
    ({ id, blockId: 'b1', startedAt, blockSeverityIndexPct: bsi, diseaseIncidencePct: di, totalSamples: 4 });

  it('uses the latest session of the block and the domain rule engine (0.8 L/tree)', () => {
    const o = blockOverview({
      block, now: NOW, phi: null, samples: [],
      sessions: [session('old', NOW - 9 * DAY, 2, 10), session('new', NOW - DAY, 20, 60), { ...session('other', NOW, 1, 1), blockId: 'b2' }],
    });
    expect(o.latestSessionId).toBe('new');
    expect(o.kpis).toMatchObject({ bsiPct: 20, diPct: 60, samples: 4, bsiTone: 'critical' });
    expect(o.decision).toMatchObject({ code: 'BLOCK_WIDE_INTERVENTION', sprayVolumeLiters: 800 });
  });

  it('localized spray volume counts only checkpoints with DS >= 5%', () => {
    const o = blockOverview({
      block, now: NOW, phi: null, sessions: [session('s', NOW, 8, 50)],
      samples: [{ checkpointId: 'c1', dsIndexPct: 12 }, { checkpointId: 'c2', dsIndexPct: 1 }, { checkpointId: 'c3', dsIndexPct: 6 }, { checkpointId: 'c4', dsIndexPct: 0 }],
    });
    expect(o.decision).toMatchObject({ code: 'LOCALIZED_SPOT_SPRAY', sprayVolumeLiters: 400, affectedCheckpointIds: ['c1', 'c3'] });
    expect(o.workOrder).toMatchObject({ blockId: 'b1', orderType: 'SPRAYING', instructions: { recommendationCode: 'LOCALIZED_SPOT_SPRAY', sprayVolumeLiters: 400, checkpointIds: ['c1', 'c3'] } });
  });

  it('cultural control becomes a pruning order with no chemical volume', () => {
    const o = blockOverview({ block, now: NOW, phi: null, samples: [], sessions: [session('s', NOW, 1, 2)] });
    expect(o.decision?.code).toBe('CULTURAL_CONTROL_ONLY');
    expect(o.workOrder).toMatchObject({ orderType: 'PRUNING', instructions: { sprayVolumeLiters: 0 } });
  });

  it('counts PHI lock days up (ceil) and reports no lock when expired or absent', () => {
    expect(blockOverview({ block, now: NOW, sessions: [], samples: [], phi: { harvestLockedUntil: NOW + 2.2 * DAY } }).kpis.phiDaysLeft).toBe(3);
    expect(blockOverview({ block, now: NOW, sessions: [], samples: [], phi: { harvestLockedUntil: null } }).kpis.phiDaysLeft).toBe(0);
    expect(blockOverview({ block, now: NOW, sessions: [], samples: [], phi: null }).kpis.phiDaysLeft).toBe(0);
  });

  it('with no scouting yet there is no decision and no work order to issue', () => {
    const o = blockOverview({ block, now: NOW, phi: null, sessions: [], samples: [] });
    expect(o).toMatchObject({ latestSessionId: null, decision: null, workOrder: null });
    expect(o.kpis.bsiPct).toBeNull();
  });
});
