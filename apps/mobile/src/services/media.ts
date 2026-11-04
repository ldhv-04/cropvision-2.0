import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import * as Legacy from 'expo-file-system/legacy';
import type { SqlExecutor } from '../db/sql-store';

export const SAMPLE_SIZE = 1024;
export const SAMPLE_QUALITY = 0.85;

const withScheme = (p: string) => (p.startsWith('file://') ? p : `file://${p}`);

/** Centre-square crop (the HUD frame) → 1024×1024 WebP @85 % → app documents dir. Returns the DB key, never the bytes. */
export async function saveSampleImage(photo: { path: string }, sampleId: string, now = new Date()) {
  // The camera reports sensor (landscape) size but the JPEG carries EXIF rotation, so crop against the decoded bitmap, not photo.width/height.
  const decoded = await ImageManipulator.manipulate(withScheme(photo.path)).renderAsync();
  const side = Math.min(decoded.width, decoded.height);
  const ref = await ImageManipulator.manipulate(decoded)
    .crop({ originX: Math.floor((decoded.width - side) / 2), originY: Math.floor((decoded.height - side) / 2), width: side, height: side })
    .resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE })
    .renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.WEBP, compress: SAMPLE_QUALITY });
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dir = new Directory(Paths.document, 'media', month);
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `sample_${sampleId}.webp`);
  new File(out.uri).move(dest);
  return { relativeKey: `${month}/sample_${sampleId}.webp`, uri: dest.uri };
}

export const mediaUriFor = (relativeKey: string) => new File(Paths.document, 'media', ...relativeKey.split('/')).uri;

/** Resolve a sample's file from the DB key. */
export async function sampleMediaUri(exec: SqlExecutor, sampleId: string): Promise<string> {
  const r = (await exec.all<{ image_relative_key: string }>('SELECT image_relative_key FROM leaf_samples WHERE id = ?', [sampleId]))[0];
  if (!r) throw new Error(`unknown sample ${sampleId}`);
  return mediaUriFor(r.image_relative_key);
}

/** Raw binary PUT streamed from disk by the native layer (no Base64, no JS buffering). */
export async function uploadWebp(url: string, fileUri: string): Promise<void> {
  const res = await Legacy.uploadAsync(url, fileUri, {
    httpMethod: 'PUT', uploadType: Legacy.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': 'image/webp' },
  });
  if (res.status !== 200) throw new Error(`upload ${res.status}`);
}
