import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { safeMediaPath } from './lan-server';

/** Lists and map popovers never decode the 1024² original (≈4 MB of RAM each); they get this square thumbnail. */
export const THUMB_SIZE = 160;

export const thumbUrl = (relativeKey: string) => `cv-media://thumb/${relativeKey.split('/').map(encodeURIComponent).join('/')}`;

type Sharp = typeof import('sharp').default;
let sharpLib: Promise<Sharp> | undefined;
// Electron's nativeImage cannot decode WebP (probed on Electron 45), so sharp is used, loaded on the first cache miss only.
// sharp 0.35's .d.mts declares cache/concurrency as named exports, but at runtime they live on the default export only.
type Tuning = { cache(on: boolean): unknown; concurrency(n: number): number };
const loadSharp = () => (sharpLib ??= import('sharp').then((m) => {
  const s = m.default;
  (s as unknown as Tuning).cache(false); (s as unknown as Tuning).concurrency(1); // no libvips op cache, one thread: smallest RAM
  return s;
}));

export function createThumbnailer(o: { mediaDir: string; cacheDir: string }) {
  const inflight = new Map<string, Promise<string | null>>();

  const make = async (src: string, out: string): Promise<string | null> => {
    try {
      const sharp = await loadSharp();
      const buf = await sharp(src).resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
      mkdirSync(dirname(out), { recursive: true });
      const part = `${out}.${process.pid}.${Date.now()}.part`;
      writeFileSync(part, buf);
      renameSync(part, out); // atomic: a reader never sees a half-written thumbnail
      return out;
    } catch {
      return null; // corrupt or unreadable original: caller answers 404
    }
  };

  return {
    /** Path of a cached thumbnail for a media key, generating it once; null for unknown, unsafe or undecodable keys. */
    async get(relativeKey: string): Promise<string | null> {
      const src = safeMediaPath(o.mediaDir, relativeKey);
      const cached = safeMediaPath(o.cacheDir, relativeKey);
      if (!src || !cached) return null;
      const out = `${cached}.thumb.webp`;
      if (existsSync(out)) return out;
      if (!existsSync(src)) return null;
      let p = inflight.get(out);
      if (!p) { p = make(src, out).finally(() => inflight.delete(out)); inflight.set(out, p); }
      return p;
    },
  };
}
