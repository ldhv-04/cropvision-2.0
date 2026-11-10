import { describe, expect, it } from 'vitest';
import { getPalette, contrastRatio } from '@cropvision/theme-tokens';
import {
  ACTUATE_AT, BORDER, CANOPY_OPTIONS, DEFAULT_CANOPY, TOUCH_MIN, checkpointProgress, fmtDMY, hmiColors, lanBanner, launchTarget,
  orderStripe, orderSummary, phiLockout, pressureGauge, probeHub, reticleState, shouldActuate, slideProgress,
} from '../src/lib/hmi';

const day = getPalette('tactical-daylight');
const noon = getPalette('high-noon-monochrome');

describe('tactical daylight tokens (AC-M1)', () => {
  it('maps mobile colours from the tactical-daylight palette', () => {
    const c = hmiColors(day);
    expect(c).toMatchObject({ bg: '#FAF9F5', card: '#FFFFFF', ink: '#090D16', border: '#94A3B8', primary: '#0F3D26', onPrimary: '#FFFFFF', danger: '#DC2626' });
  });
  it('switches every colour with the high-noon palette', () => {
    expect(hmiColors(noon)).toMatchObject({ bg: '#FFFFFF', ink: '#000000', border: '#000000', primary: '#000000' });
  });
  it('fixes the HMI ergonomics: 56px touch targets, 2px borders', () => {
    expect([TOUCH_MIN, BORDER]).toEqual([56, 2]);
  });
});

describe('LAN sync banner (AC-M2)', () => {
  it('reachable hub: solid emerald with the pending sample count', () => {
    const b = lanBanner(day, { reachable: true, pendingSamples: 12 });
    expect(b).toMatchObject({ tone: 'healthy', text: '● TRẠM ĐÃ KẾT NỐI - ĐỒNG BỘ (12 MẪU)', fill: '#15803D' });
    expect(contrastRatio(b.ink, b.fill)).toBeGreaterThanOrEqual(4.5);
  });
  it('offline: solid amber, data stays in local SQLite', () => {
    expect(lanBanner(day, { reachable: false, pendingSamples: 3 })).toMatchObject({ tone: 'warning', text: '○ CHẾ ĐỘ NGOẠI TUYẾN - LƯU SQLITE CỤC BỘ', fill: '#B45309' });
  });
});

describe('probeHub', () => {
  it('is true only when the hub handshake answers OK', async () => {
    const seen: string[] = [];
    expect(await probeHub('http://10.0.0.2:45678', async (u) => { seen.push(String(u)); return { ok: true } as Response; })).toBe(true);
    expect(seen).toEqual(['http://10.0.0.2:45678/api/v1/handshake']);
    expect(await probeHub('http://10.0.0.2:45678', async () => ({ ok: false }) as Response)).toBe(false);
    expect(await probeHub('http://10.0.0.2:45678', async () => { throw new Error('ECONNREFUSED'); })).toBe(false);
    expect(await probeHub('', async () => ({ ok: true }) as Response)).toBe(false);
  });
  it('gives up after the timeout', async () => {
    const never = (_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    expect(await probeHub('http://x', never, 20)).toBe(false);
  });
});

describe('work order cards (AC-M3)', () => {
  it('colours the 8px stripe by order type with telemetry tones', () => {
    expect(orderStripe(day, 'SCOUTING')).toBe(day.telemetry['healthy-fill']);
    expect(orderStripe(day, 'SPRAYING')).toBe(day.telemetry['critical-fill']);
    expect(orderStripe(day, 'FERTIGATION')).toBe(day.telemetry['hydraulic-fill']);
    expect(orderStripe(day, 'IRRIGATION')).toBe(day.telemetry['hydraulic-fill']);
    expect(orderStripe(day, 'PRUNING')).toBe(day.telemetry['warning-fill']);
  });
  it('summarises the target from real data', () => {
    expect(orderSummary({ order_type: 'SCOUTING', instructions_json: '{}' }, 10)).toBe('Khảo sát 10 điểm chữ Z');
    expect(orderSummary({ order_type: 'SCOUTING', instructions_json: '{}' }, 0)).toBe('Khảo sát tự do (lô chưa có tuyến Z)');
    expect(orderSummary({ order_type: 'SPRAYING', instructions_json: '{"sprayVolumeLiters":960,"checkpointIds":[]}' }, 0)).toBe('Phun 960 L dung dịch (0,8 L/cây)');
    expect(orderSummary({ order_type: 'FERTIGATION', instructions_json: 'not json' }, 0)).toBe('Châm phân Venturi 2,5 bar');
  });
  it('launches the matching field flow', () => {
    expect([launchTarget('SCOUTING'), launchTarget('SPRAYING'), launchTarget('IRRIGATION'), launchTarget('FERTIGATION'), launchTarget('PRUNING')])
      .toEqual(['scouting', 'scan', 'valve', 'valve', null]);
  });
});

describe('scouting HUD (AC-M4)', () => {
  it('shaking hand: solid red 4px reticle, banner with the measured value, shutter disabled', () => {
    expect(reticleState({ isStable: false, stabilityScore: 1.83, lockReason: 'HAND_SHAKE' }))
      .toEqual({ color: '#DC2626', width: 4, banner: 'GIỮ CHẶT TAY - ĐANG RUNG (1.8 m/s²)', shutterEnabled: false });
  });
  it('calibrating: locked with its own banner', () => {
    expect(reticleState({ isStable: false, stabilityScore: 0, lockReason: 'CALIBRATING' })).toMatchObject({ width: 4, banner: 'ĐANG HIỆU CHUẨN CẢM BIẾN', shutterEnabled: false });
  });
  it('stable: emerald 2px, no banner, shutter enabled', () => {
    expect(reticleState({ isStable: true, stabilityScore: 0.1, lockReason: null })).toEqual({ color: '#22C55E', width: 2, banner: null, shutterEnabled: true });
  });
  it('canopy selector reads the domain weights, LOW first and default', () => {
    expect(CANOPY_OPTIONS.map((o) => [o.layer, o.label])).toEqual([['LOW', 'TẦNG DƯỚI x1.2'], ['MID', 'TẦNG GIỮA x1.0'], ['TOP', 'TẦNG TRÊN x0.8']]);
    expect(DEFAULT_CANOPY).toBe('LOW');
  });
  it('shows checkpoint progress as two-digit current / total', () => {
    expect(checkpointProgress(2, 10)).toBe('ĐIỂM CHỐT 03 / 10');
    expect(checkpointProgress(10, 10)).toBe('ĐÃ ĐỦ 10 / 10 ĐIỂM');
    expect(checkpointProgress(4, 0)).toBe('CHỤP TỰ DO · 4 MẪU');
  });
});

describe('hydraulic controls (AC-M5)', () => {
  it('places the 2.3–2.7 bar optimal band and needle on a 0–4 bar gauge', () => {
    const g = pressureGauge(2.5);
    expect(g.band[0]).toBeCloseTo(0.575, 6);
    expect(g.band[1]).toBeCloseTo(0.675, 6);
    expect(g).toMatchObject({ needle: 0.625, zone: 'OPTIMAL' });
    expect(pressureGauge(1.0).zone).toBe('LOW');
    expect(pressureGauge(3.1).zone).toBe('HIGH');
  });
  it('clamps the needle and treats missing telemetry as no reading', () => {
    expect(pressureGauge(9).needle).toBe(1);
    expect(pressureGauge(-1).needle).toBe(0);
    expect(pressureGauge(null)).toMatchObject({ needle: 0, zone: 'NO_DATA' });
    expect(pressureGauge(Number.NaN).zone).toBe('NO_DATA');
  });
  it('slide-to-actuate fires only when the 56px knob travels past the threshold', () => {
    const track = 356; // 300px of travel
    expect(slideProgress(150, track)).toBeCloseTo(0.5, 6);
    expect(slideProgress(-20, track)).toBe(0);
    expect(slideProgress(999, track)).toBe(1);
    expect(shouldActuate(slideProgress(0.9 * 300, track))).toBe(false);
    expect(shouldActuate(slideProgress(ACTUATE_AT * 300, track))).toBe(true);
    expect(ACTUATE_AT).toBeGreaterThanOrEqual(0.9);
  });
});

describe('PHI lockout (AC-M6)', () => {
  it('formats dates as DD/MM/YYYY without locale dependence', () => {
    expect(fmtDMY(new Date(2027, 0, 5).getTime())).toBe('05/01/2027');
  });
  it('shows both dates and the overlap for a blocked scan only', () => {
    const harvest = new Date(2027, 0, 5).getTime(), safe = new Date(2027, 0, 19).getTime();
    expect(phiLockout({ status: 'BLOCKED', safeHarvestUnlockDate: safe }, harvest))
      .toEqual({ harvest: '05/01/2027', safe: '19/01/2027', overDays: 14 });
    expect(phiLockout({ status: 'OK', safeHarvestUnlockDate: safe }, harvest)).toBeNull();
  });
});
