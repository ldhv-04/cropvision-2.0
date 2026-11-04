import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';
import { createStabilityGate, type GateState } from './camera-gate.logic';

/** Accelerometer at 50 Hz (20 ms) → rolling stability gate. Disable the shutter whenever `!isStable`. */
export function useCameraStabilityGate(): GateState {
  const [state, setState] = useState<GateState>({ isStable: false, stabilityScore: 0, lockReason: 'CALIBRATING' });
  const gate = useRef(createStabilityGate());
  useEffect(() => {
    Accelerometer.setUpdateInterval(20);
    let n = 0;
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const s = gate.current.pushG(x, y, z);
      // re-render only on a lock/unlock flip, or ~5x per second for the score readout
      setState((prev) => (prev.isStable !== s.isStable || prev.lockReason !== s.lockReason || ++n % 10 === 0 ? s : prev));
    });
    return () => sub.remove();
  }, []);
  return state;
}
