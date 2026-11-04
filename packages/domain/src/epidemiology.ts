export type CanopyLayer = 'TOP' | 'MID' | 'LOW';

/** Coffee leaf rust: the humid lower canopy is infected first, so it weighs more. */
export const CANOPY_WEIGHTS: Record<CanopyLayer, number> = { LOW: 1.2, MID: 1.0, TOP: 0.8 };
/** A sample counts as diseased only above this DS (%). */
export const DI_THRESHOLD_PCT = 0.5;

export function computeDs(leafPixelCount: number, lesionPixelCount: number): number {
  if (!(leafPixelCount > 0)) throw new RangeError('leafPixelCount must be > 0');
  return Math.min(100, Math.max(0, (lesionPixelCount / leafPixelCount) * 100));
}

export interface EpidemiologySample { canopyLayer: CanopyLayer; dsIndexPct: number }
export interface BlockEpidemiology { totalSamples: number; diseaseIncidencePct: number; blockSeverityIndexPct: number }

export function computeBlockEpidemiology(samples: readonly EpidemiologySample[]): BlockEpidemiology {
  if (samples.length === 0) throw new RangeError('at least one sample required');
  let diseased = 0, weighted = 0, weights = 0;
  for (const s of samples) {
    if (s.dsIndexPct > DI_THRESHOLD_PCT) diseased += 1;
    const w = CANOPY_WEIGHTS[s.canopyLayer];
    weighted += w * s.dsIndexPct;
    weights += w;
  }
  return {
    totalSamples: samples.length,
    diseaseIncidencePct: (diseased / samples.length) * 100,
    blockSeverityIndexPct: weighted / weights,
  };
}
