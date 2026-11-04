import type { ISegmentationEngine, SegmentationResult } from './ports';

export interface RgbaImage { data: ArrayLike<number>; width: number; height: number }
export const HSV_ENGINE_VERSION = 'hsv-1.0.0';

function hsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = max === r ? 60 * (((g - b) / d + 6) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [h, max === 0 ? 0 : d / max, max];
}

/** Binary Shannon entropy (bits) of the lesion/leaf split: 0 = unambiguous, 1 = half and half. */
const entropy = (p: number) => (p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p));

export function segmentRgba(img: RgbaImage): SegmentationResult {
  const t0 = Date.now();
  let healthy = 0, lesion = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const [h, s, v] = hsv(img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!);
    if (v < 0.12 || s < 0.2) continue; // background: dark / gray / white
    if (h >= 15 && h <= 65 && s >= 0.3) lesion++; // yellow-orange-brown necrotic tissue
    else if (h > 65 && h <= 170) healthy++; // green blade
  }
  const leaf = healthy + lesion;
  return {
    leafPixelCount: leaf, lesionPixelCount: lesion,
    dsIndexPct: leaf > 0 ? Math.min(100, (lesion / leaf) * 100) : 0,
    uncertaintyEntropy: leaf > 0 ? entropy(lesion / leaf) : 0,
    inferenceLatencyMs: Date.now() - t0, engineVersion: HSV_ENGINE_VERSION,
  };
}

export type ImageDecoder = (imageUri: string) => Promise<RgbaImage>;

/** Works from day one, before any deep-learning weights exist. Decoding is injected (platform specific). */
export class DeterministicHsvLesionEngine implements ISegmentationEngine {
  constructor(private readonly decode: ImageDecoder) {}
  async initialize(): Promise<void> {}
  async analyzeFrame(imageUri: string): Promise<SegmentationResult> {
    return segmentRgba(await this.decode(imageUri));
  }
}
export const FallbackColorThresholdEngine = DeterministicHsvLesionEngine;

export interface OnnxRunner {
  load(): Promise<void>;
  run(imageUri: string): Promise<Pick<SegmentationResult, 'leafPixelCount' | 'lesionPixelCount' | 'uncertaintyEntropy'> & { maskUri?: string }>;
}
export const ONNX_ENGINE_VERSION = 'onnx-int8-512';

/** Stub adapter: the runner (onnxruntime-react-native on Mobile, local sidecar on Desktop) is injected once weights exist. */
export class OnnxRuntimeSegmentationEngine implements ISegmentationEngine {
  private ready = false;
  constructor(private readonly runner: OnnxRunner) {}
  async initialize(): Promise<void> { await this.runner.load(); this.ready = true; }
  async analyzeFrame(imageUri: string): Promise<SegmentationResult> {
    if (!this.ready) throw new Error('ONNX_MODEL_NOT_LOADED');
    const t0 = Date.now();
    const r = await this.runner.run(imageUri);
    return {
      ...r, dsIndexPct: r.leafPixelCount > 0 ? Math.min(100, (r.lesionPixelCount / r.leafPixelCount) * 100) : 0,
      inferenceLatencyMs: Date.now() - t0, engineVersion: ONNX_ENGINE_VERSION,
    };
  }
}
