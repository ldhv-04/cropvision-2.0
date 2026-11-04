import { verifyLeaseFrame, type Lease, type Telemetry } from './irrigation-lease';
import type { IIrrigationController } from './ports';

type Handler = (leaseId: string, t: Telemetry) => void;

/**
 * Hardware stand-in: validates the CRC32 frame exactly as an ESP32 would, records what it was told,
 * and lets tests/UI inject telemetry. Real USB-serial LoRa / MQTT controllers implement the same port.
 */
export class SimulatedIrrigationController implements IIrrigationController {
  readonly frames: string[] = [];
  readonly aborted: string[] = [];
  private handlers = new Set<Handler>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  /** autoRun: emit plausible telemetry every `everyMs` (demo mode). */
  constructor(private autoRun?: { flowLph: number; pressureBar: number; everyMs: number; speedup: number }) {}

  async issueLease(lease: Lease, frame: string): Promise<void> {
    if (!verifyLeaseFrame(frame)) throw new Error('CRC32_MISMATCH');
    this.frames.push(frame);
    const a = this.autoRun;
    if (!a) return;
    let elapsed = 0;
    this.timers.set(lease.id, setInterval(() => {
      elapsed += (a.everyMs / 1000) * a.speedup;
      this.emit(lease.id, { elapsedSec: elapsed, pressureBar: a.pressureBar, volumeLiters: (a.flowLph * elapsed) / 3600 });
    }, a.everyMs));
  }
  async abortLease(leaseId: string): Promise<void> {
    this.aborted.push(leaseId);
    const t = this.timers.get(leaseId);
    if (t) { clearInterval(t); this.timers.delete(leaseId); }
  }
  onTelemetry(h: Handler): () => void { this.handlers.add(h); return () => this.handlers.delete(h); }
  emit(leaseId: string, t: Telemetry): void { for (const h of this.handlers) h(leaseId, t); }
}
