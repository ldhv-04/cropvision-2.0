import { describe, expect, it } from 'vitest';
import { segmentRgba, DeterministicHsvLesionEngine, FallbackColorThresholdEngine } from '../src/engines';

// 20x10 image: left 10 cols healthy green, right: 5 brown lesion + 5 white background
function img() {
  const w = 20, h = 10, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const [r, g, b] = x < 10 ? [40, 140, 50] : x < 15 ? [150, 90, 30] : [255, 255, 255];
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  return { data: d, width: w, height: h };
}

describe('HSV engine (AC-12)', () => {
  it('separates green leaf, brown lesion, background', () => {
    const r = segmentRgba(img());
    expect(r.lesionPixelCount).toBe(50);
    expect(r.leafPixelCount).toBe(150); // healthy + diseased blade
    expect(r.dsIndexPct).toBeCloseTo(33.33, 1);
    expect(r.uncertaintyEntropy).toBeGreaterThan(0);
  });
  it('class wrapper decodes via injected decoder and exposes version', async () => {
    const e = new DeterministicHsvLesionEngine(async () => img());
    await e.initialize();
    const r = await e.analyzeFrame('file:///x.webp');
    expect(r.engineVersion).toMatch(/hsv/);
    expect(r.dsIndexPct).toBeCloseTo(33.33, 1);
    expect(FallbackColorThresholdEngine).toBe(DeterministicHsvLesionEngine);
  });
  it('returns zero DS when no leaf pixels', () => {
    const w = 2, h = 2, d = new Uint8ClampedArray(w * h * 4).fill(255);
    const r = segmentRgba({ data: d, width: w, height: h });
    expect(r.leafPixelCount).toBe(0);
    expect(r.dsIndexPct).toBe(0);
  });
});
