import type { ISegmentationEngine, SegmentationResult } from '@cropvision/domain';

/**
 * Desktop AI port: talks to a local Python sidecar (ONNX INT8 model) over loopback HTTP.
 * Contract: GET /health → 200; POST /segment {path} → SegmentationResult JSON. No sidecar ships yet (no weights).
 */
export class SidecarPythonSegmentationEngine implements ISegmentationEngine {
  constructor(private readonly baseUrl = 'http://127.0.0.1:45679') {}
  async initialize(): Promise<void> {
    const r = await fetch(`${this.baseUrl}/health`);
    if (!r.ok) throw new Error(`segmentation sidecar unhealthy: ${r.status}`);
  }
  async analyzeFrame(imageUri: string): Promise<SegmentationResult> {
    const r = await fetch(`${this.baseUrl}/segment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: imageUri }) });
    if (!r.ok) throw new Error(`segmentation sidecar failed: ${r.status}`);
    return (await r.json()) as SegmentationResult;
  }
}
