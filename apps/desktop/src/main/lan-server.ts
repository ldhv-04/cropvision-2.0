import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { leafSamples } from '@cropvision/schema';
import {
  HUB_PORT, SCHEMA_VERSION, pullQuerySchema, pushBodySchema,
  type HubEvent, type Handshake, type MediaAck,
} from '@cropvision/sync-protocol';
import type { DbContext } from './db';
import { applyPush, pullSince } from './repo';

export const HUB_VERSION = '2.0.0';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface HubOptions extends DbContext { mediaDir: string; hubId: string; farmName: string; now?: () => number }
export interface Hub {
  app: FastifyInstance;
  broadcast(e: HubEvent): void;
  listen(port?: number, host?: string): Promise<string>;
  close(): Promise<void>;
}

/** Relative key from the DB resolved inside mediaDir; null if it would escape (path traversal). */
export function safeMediaPath(mediaDir: string, relativeKey: string): string | null {
  const root = resolve(mediaDir);
  const p = resolve(root, relativeKey);
  return p.startsWith(root + sep) ? p : null;
}

export async function createHub(o: HubOptions): Promise<Hub> {
  const now = o.now ?? Date.now;
  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
  await app.register(websocket);
  const sockets = new Set<{ send(d: string): void }>();
  const broadcast = (e: HubEvent) => { for (const s of sockets) { try { s.send(JSON.stringify(e)); } catch { sockets.delete(s); } } };

  app.get('/ws', { websocket: true }, (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });

  app.get('/api/v1/handshake', async (): Promise<Handshake> => ({
    hubId: o.hubId, farmName: o.farmName, version: HUB_VERSION, schemaVersion: SCHEMA_VERSION, serverTime: now(),
  }));

  app.get('/api/v1/sync/pull', async (req, reply) => {
    const q = pullQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'INVALID_QUERY', issues: q.error.issues });
    const serverTime = now();
    return { serverTime, ...pullSince(o.db, q.data.since) };
  });

  app.post('/api/v1/sync/push', async (req, reply) => {
    const b = pushBodySchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'INVALID_BODY', issues: b.error.issues });
    try {
      const { sessionIds, ...res } = applyPush(o, b.data, (key) => {
        const p = safeMediaPath(o.mediaDir, key);
        return p !== null && existsSync(p) && statSync(p).isFile();
      });
      for (const id of sessionIds) broadcast({ type: 'SESSION_UPDATED', sessionId: id });
      return res;
    } catch (e) {
      return reply.code(409).send({ error: 'PUSH_REJECTED', message: (e as Error).message });
    }
  });

  // Raw binary body: keep the stream, never buffer or base64 it (architectural law 3).
  app.addContentTypeParser('image/webp', (_req, payload, done) => done(null, payload));
  app.put<{ Params: { sampleId: string } }>('/api/v1/media/:sampleId', async (req, reply) => {
    const sample = o.db.select().from(leafSamples).where(eq(leafSamples.id, req.params.sampleId)).get();
    if (!sample) return reply.code(404).send({ error: 'UNKNOWN_SAMPLE' });
    const dest = safeMediaPath(o.mediaDir, sample.imageRelativeKey);
    if (!dest) return reply.code(400).send({ error: 'INVALID_MEDIA_KEY' });

    await mkdir(dirname(dest), { recursive: true });
    const part = `${dest}.${randomUUID()}.part`; // unique: concurrent PUTs for one sample must not share a file
    let total = 0, head = Buffer.alloc(0);
    try {
      await pipeline(req.body as Readable, async function* (src: AsyncIterable<Buffer>) {
        for await (const chunk of src) {
          total += chunk.length;
          if (total > MAX_IMAGE_BYTES) throw new Error('TOO_LARGE');
          if (head.length < 12) head = Buffer.concat([head, chunk]).subarray(0, 12);
          yield chunk;
        }
      }, createWriteStream(part));
    } catch (e) {
      await rm(part, { force: true });
      return reply.code((e as Error).message === 'TOO_LARGE' ? 413 : 400).send({ error: 'UPLOAD_FAILED' });
    }
    const isWebp = head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
    if (total === 0 || !isWebp || (await stat(part)).size === 0) {
      await rm(part, { force: true });
      return reply.code(422).send({ error: 'EMPTY_OR_NOT_WEBP' });
    }
    await rename(part, dest);
    o.db.update(leafSamples).set({ mediaSyncStatus: 'VERIFIED' }).where(eq(leafSamples.id, sample.id)).run();
    broadcast({ type: 'SESSION_UPDATED', sessionId: sample.sessionId, sampleId: sample.id });
    const ack: MediaAck = { sampleId: sample.id, bytes: total, mediaSyncStatus: 'VERIFIED' };
    return ack;
  });

  return {
    app, broadcast,
    listen: (port = HUB_PORT, host = '0.0.0.0') => app.listen({ port, host }),
    close: () => app.close(),
  };
}
