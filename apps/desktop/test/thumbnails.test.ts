import { beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { THUMB_SIZE, createThumbnailer, thumbUrl } from '../src/main/thumbnails';

let mediaDir: string, cacheDir: string;
beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), 'cv-thumb-'));
  mediaDir = join(root, 'media'); cacheDir = join(root, 'thumbs');
  mkdirSync(join(mediaDir, '2026-11'), { recursive: true });
  const big = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#2a7' } }).webp({ quality: 85 }).toBuffer();
  writeFileSync(join(mediaDir, '2026-11', 'sample_a.webp'), big);
  return () => rmSync(root, { recursive: true, force: true });
});

describe('cv-media://thumb (AC-D3)', () => {
  it('builds thumb URLs with each path segment encoded', () => {
    expect(thumbUrl('2026-11/sample a.webp')).toBe('cv-media://thumb/2026-11/sample%20a.webp');
  });

  it('returns a WebP no larger than 160x160 for a stored 1024x1024 sample', async () => {
    const file = await createThumbnailer({ mediaDir, cacheDir }).get('2026-11/sample_a.webp');
    expect(file).not.toBeNull();
    const meta = await sharp(readFileSync(file!)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(THUMB_SIZE);
    expect(meta.height).toBeLessThanOrEqual(THUMB_SIZE);
    expect(THUMB_SIZE).toBe(160);
  });

  it('serves later requests from the disk cache without decoding the original again', async () => {
    const t = createThumbnailer({ mediaDir, cacheDir });
    const first = await t.get('2026-11/sample_a.webp');
    rmSync(join(mediaDir, '2026-11', 'sample_a.webp'));
    expect(await createThumbnailer({ mediaDir, cacheDir }).get('2026-11/sample_a.webp')).toBe(first);
  });

  it('returns null for a key with no stored image', async () => {
    expect(await createThumbnailer({ mediaDir, cacheDir }).get('2026-11/missing.webp')).toBeNull();
  });

  it('refuses path traversal', async () => {
    writeFileSync(join(mediaDir, '..', 'secret.webp'), 'x');
    expect(await createThumbnailer({ mediaDir, cacheDir }).get('../secret.webp')).toBeNull();
  });

  it('returns null instead of throwing for a corrupt image', async () => {
    writeFileSync(join(mediaDir, '2026-11', 'bad.webp'), 'not an image');
    expect(await createThumbnailer({ mediaDir, cacheDir }).get('2026-11/bad.webp')).toBeNull();
  });
});
