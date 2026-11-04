import { decode } from 'fast-png';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { DeterministicHsvLesionEngine, type ISegmentationEngine, type RgbaImage } from '@cropvision/domain';

const ANALYSIS_SIZE = 192;

/** Downscale to a small PNG file, read its bytes and expand to RGBA — keeps the analysis off Base64. */
async function decodeToRgba(uri: string): Promise<RgbaImage> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: ANALYSIS_SIZE, height: ANALYSIS_SIZE }).renderAsync();
  const png = await ref.saveAsync({ format: SaveFormat.PNG });
  const f = new File(png.uri);
  const img = decode(await f.bytes());
  f.delete();
  const n = img.width * img.height, rgba = new Uint8ClampedArray(n * 4);
  const src = img.data as ArrayLike<number>;
  for (let i = 0; i < n; i++) {
    if (img.channels >= 3) { rgba[i * 4] = src[i * img.channels]!; rgba[i * 4 + 1] = src[i * img.channels + 1]!; rgba[i * 4 + 2] = src[i * img.channels + 2]!; }
    else { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = src[i]!; }
    rgba[i * 4 + 3] = 255;
  }
  return { data: rgba, width: img.width, height: img.height };
}

/** DI container: replace this one line with OnnxRuntimeSegmentationEngine once INT8 weights exist (SPEC phase 4). */
export const segmentationEngine: ISegmentationEngine = new DeterministicHsvLesionEngine(decodeToRgba);
