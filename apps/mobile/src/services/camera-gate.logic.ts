export const G = 9.81;
export const SHAKE_THRESHOLD_MS2 = 1.2;
export const GATE_WINDOW = 5;

export interface GateState { isStable: boolean; stabilityScore: number; lockReason: 'CALIBRATING' | 'HAND_SHAKE' | null }

/**
 * Pre-inference camera gate (SPEC §5.1 / phase 3): a_delta = |‖a‖ − 9.81| over a rolling window of 5 frames.
 * The worst frame in the window decides, so one jolt locks the shutter for 5 samples (100 ms at 50 Hz).
 */
export function createStabilityGate(opts: { window?: number; threshold?: number } = {}) {
  const size = opts.window ?? GATE_WINDOW, threshold = opts.threshold ?? SHAKE_THRESHOLD_MS2;
  const deltas: number[] = [];
  const push = (ax: number, ay: number, az: number): GateState => {
    deltas.push(Math.abs(Math.sqrt(ax * ax + ay * ay + az * az) - G));
    if (deltas.length > size) deltas.shift();
    const score = Math.max(...deltas);
    if (deltas.length < size) return { isStable: false, stabilityScore: score, lockReason: 'CALIBRATING' };
    return score > threshold ? { isStable: false, stabilityScore: score, lockReason: 'HAND_SHAKE' } : { isStable: true, stabilityScore: score, lockReason: null };
  };
  /** expo-sensors reports acceleration in g. */
  const pushG = (ax: number, ay: number, az: number) => push(ax * G, ay * G, az * G);
  return { push, pushG, reset: () => { deltas.length = 0; } };
}
