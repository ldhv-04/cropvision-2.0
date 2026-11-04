import type { Lease, Telemetry } from './irrigation-lease';

export interface SegmentationResult {
  leafPixelCount: number;
  lesionPixelCount: number;
  dsIndexPct: number;
  uncertaintyEntropy: number;
  inferenceLatencyMs: number;
  engineVersion: string;
  maskUri?: string;
}
export interface ISegmentationEngine {
  initialize(): Promise<void>;
  analyzeFrame(imageUri: string): Promise<SegmentationResult>;
}
/** Phase-4 name for the same port (A3). */
export type ISegmentationProvider = ISegmentationEngine;

export interface IIrrigationController {
  /** Send a CRC32-framed, time/volume-bounded lease to the hardware (USB-serial LoRa, MQTT or BLE). */
  issueLease(lease: Lease, frame: string): Promise<void>;
  abortLease(leaseId: string): Promise<void>;
  onTelemetry(handler: (leaseId: string, t: Telemetry) => void): () => void;
}
export type IIoTGateway = IIrrigationController;
